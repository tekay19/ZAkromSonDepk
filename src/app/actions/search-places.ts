"use server";

import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { acquireLock, releaseLock, waitForValue } from "@/lib/traffic-control";
import { googlePlacesGateway } from "@/lib/gateway/google-places";
import { GridGenerator, Viewport as GridViewport } from "@/lib/grid-generator";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { auth } from "@/auth";
import { z } from "zod";
import { createHash } from "crypto";
import { addSearchJob } from "@/lib/queue/search-queue";
import { maskEmail } from "@/lib/masking";
import { CREDIT_COSTS, CREDIT_COSTS_BY_TIER } from "@/lib/constants/pricing";
import { logAuditEvent } from "@/lib/auth/audit";
import { getRequestMeta } from "@/lib/auth/request-meta";
import { rateLimit } from "@/lib/auth/rate-limit";
import { buildGlobalDeepListKeys, buildGlobalSearchCacheKey, normalizeSearchInput } from "@/lib/search/cache-key";

const CACHE_TTL_SECONDS = 86400;
// This lock must outlive long deep-search runs; otherwise concurrent requests can start duplicate scans and double-charge.
const LOCK_TTL_MS = Number(process.env.SEARCH_LOCK_TTL_MS || 20 * 60 * 1000);
const WAIT_FOR_CACHE_MS = 8000;
const WAIT_POLL_MS = 200;
const GLOBAL_RATE_LIMIT_PER_MIN = Number(process.env.GOOGLE_PLACES_GLOBAL_RPM || 0);
const USER_RATE_LIMIT_PER_MIN = Number(process.env.GOOGLE_PLACES_USER_RPM || 0);

const SearchSchema = z.object({
    city: z.string().trim().min(2, "Şehir adı en az 2 karakter olmalıdır.").max(50, "Şehir adı çok uzun."),
    keyword: z.string().trim().min(2, "Anahtar kelime en az 2 karakter olmalıdır.").max(50, "Anahtar kelime çok uzun."),
    deepSearch: z.boolean().optional().default(false),
});

type DeepScanTask = {
    viewport: GridViewport;
    depth: number;
};

function shortHash(value: string) {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

type DeepScanStateV1 = {
    v: 1;
    keyword: string; // normalizedKeyword for safety/debug
    city: string; // normalizedCity for safety/debug
    baseGridSize: number;
    maxPagesPerGrid: number;
    maxDepth: number;
    pageSize: number;

    tasks: DeepScanTask[];
    taskIndex: number;

    // Cursor within the current task
    cellIndex: number;
    cellNextPageToken: string | null;
    cellPageCount: number;
    cellResultCount: number;

    done: boolean;
    updatedAt: string;
};

function deepStateKey(normalizedCity: string, normalizedKeyword: string) {
    return buildGlobalDeepListKeys({ normalizedCity, normalizedKeyword }).deepStateKey;
}

function deepFillLockKey(normalizedCity: string, normalizedKeyword: string) {
    return buildGlobalDeepListKeys({ normalizedCity, normalizedKeyword }).deepFillLockKey;
}

function safeJsonParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function cellViewport(parent: GridViewport, gridSize: number, cellIndex: number): GridViewport {
    const size = Math.max(1, Math.floor(gridSize));
    const row = Math.floor(cellIndex / size);
    const col = cellIndex % size;

    const latSpan = parent.northeast.lat - parent.southwest.lat;
    const lngSpan = parent.northeast.lng - parent.southwest.lng;
    const cellLatSize = latSpan / size;
    const cellLngSize = lngSpan / size;

    const swLat = parent.southwest.lat + row * cellLatSize;
    const swLng = parent.southwest.lng + col * cellLngSize;
    const neLat = swLat + cellLatSize;
    const neLng = swLng + cellLngSize;

    return {
        southwest: { lat: swLat, lng: swLng },
        northeast: { lat: neLat, lng: neLng },
    };
}

async function loadOrInitDeepState(args: {
    normalizedCity: string;
    normalizedKeyword: string;
    cityViewport: GridViewport;
    baseGridSize: number;
    maxPagesPerGrid: number;
    maxDepth: number;
    pageSize: number;
    ttlSeconds: number;
}) {
    const key = deepStateKey(args.normalizedCity, args.normalizedKeyword);
    const existing = safeJsonParse<DeepScanStateV1>(await redis.get(key));

    // If config changed (pageSize/grid sizing), reset the state to avoid inconsistent pagination.
    const incompatible =
        existing &&
        (existing.v !== 1 ||
            existing.pageSize !== args.pageSize ||
            existing.baseGridSize !== args.baseGridSize ||
            existing.maxPagesPerGrid !== args.maxPagesPerGrid ||
            existing.maxDepth !== args.maxDepth);

    if (existing && !incompatible) return existing;

    const fresh: DeepScanStateV1 = {
        v: 1,
        keyword: args.normalizedKeyword,
        city: args.normalizedCity,
        baseGridSize: args.baseGridSize,
        maxPagesPerGrid: args.maxPagesPerGrid,
        maxDepth: args.maxDepth,
        pageSize: args.pageSize,
        tasks: [{ viewport: args.cityViewport, depth: 0 }],
        taskIndex: 0,
        cellIndex: 0,
        cellNextPageToken: null,
        cellPageCount: 0,
        cellResultCount: 0,
        done: false,
        updatedAt: new Date().toISOString(),
    };

    await redis.set(key, JSON.stringify(fresh), "EX", args.ttlSeconds);
    return fresh;
}

async function saveDeepState(normalizedCity: string, normalizedKeyword: string, state: DeepScanStateV1, ttlSeconds: number) {
    state.updatedAt = new Date().toISOString();
    await redis.set(deepStateKey(normalizedCity, normalizedKeyword), JSON.stringify(state), "EX", ttlSeconds);
}

async function fillDeepCacheToTarget(args: {
    normalizedCity: string;
    normalizedKeyword: string;
    keyword: string;
    cityViewport: GridViewport;
    billingUserId: string;
    billingTier: SubscriptionTier;
    baseGridSize: number;
    maxPagesPerGrid: number;
    maxDepth: number;
    pageSize: number;
    listCacheKey: string;
    listDataCacheKey: string;
    ttlSeconds: number;
    targetCount: number;
    apiCallBudget: number;
}) {
    const lockKey = deepFillLockKey(args.normalizedCity, args.normalizedKeyword);
    const lockToken = await acquireLock(lockKey, 30000);
    if (!lockToken) return; // Another request is filling; caller can use whatever is already cached.

    try {
        const [rawPlaces, rawIds] = await Promise.all([
            redis.get(args.listDataCacheKey),
            redis.get(args.listCacheKey),
        ]);

        const parsedPlaces = safeJsonParse<any>(rawPlaces);
        const cachedPlaces: any[] = Array.isArray(parsedPlaces) ? parsedPlaces : (parsedPlaces?.places || []);
        const cachedIds: string[] = (safeJsonParse<string[]>(rawIds) || cachedPlaces.map((p: any) => p?.place_id).filter(Boolean));

        if (cachedPlaces.length >= args.targetCount) return;

        const seen = new Set<string>(cachedIds.filter(Boolean));
        let state = await loadOrInitDeepState({
            normalizedCity: args.normalizedCity,
            normalizedKeyword: args.normalizedKeyword,
            cityViewport: args.cityViewport,
            baseGridSize: args.baseGridSize,
            maxPagesPerGrid: args.maxPagesPerGrid,
            maxDepth: args.maxDepth,
            pageSize: args.pageSize,
            ttlSeconds: args.ttlSeconds,
        });

        let budgetLeft = Math.max(0, Math.floor(args.apiCallBudget));
        while (!state.done && budgetLeft > 0 && cachedPlaces.length < args.targetCount) {
            const task = state.tasks[state.taskIndex];
            if (!task) {
                state.done = true;
                break;
            }

            const effectiveGridSize = task.depth > 0 ? 2 : state.baseGridSize;
            const gridPoints = GridGenerator.generateGrid(task.viewport, effectiveGridSize);

            if (state.cellIndex >= gridPoints.length) {
                // Next task
                state.taskIndex += 1;
                state.cellIndex = 0;
                state.cellNextPageToken = null;
                state.cellPageCount = 0;
                state.cellResultCount = 0;
                continue;
            }

            const point = gridPoints[state.cellIndex];
            const locationBias = {
                circle: {
                    center: { latitude: point.lat, longitude: point.lng },
                    radius: point.radius,
                },
            };

            const resp = await googlePlacesGateway.searchText(args.keyword, {
                locationBias,
                pageToken: state.cellNextPageToken || undefined,
                billing: { userId: args.billingUserId, tier: args.billingTier },
            });

            budgetLeft -= 1;
            state.cellPageCount += 1;

            const newPlaces = Array.isArray(resp?.places) ? resp.places : [];
            state.cellResultCount += newPlaces.length;

            for (const p of newPlaces) {
                const id = p?.place_id;
                if (!id || seen.has(id)) continue;
                seen.add(id);

                // Keep a slim representation for pagination cache.
                cachedIds.push(id);
                cachedPlaces.push({
                    place_id: id,
                    name: p.name,
                    formatted_address: p.formatted_address || p.formattedAddress,
                    rating: p.rating,
                    user_ratings_total: p.user_ratings_total || p.userRatingCount,
                    formatted_phone_number: p.formatted_phone_number || p.nationalPhoneNumber,
                    website: p.website || p.websiteUri,
                    photos: p.photos,
                    types: p.types,
                    opening_hours: p.opening_hours || p.regularOpeningHours,
                    business_status: p.business_status || p.businessStatus,
                    location: p.location,
                });
            }

            const nextTok = resp?.nextPageToken || null;
            const canContinueSameCell = Boolean(nextTok) && state.cellPageCount < state.maxPagesPerGrid;
            state.cellNextPageToken = canContinueSameCell ? nextTok : null;

            if (canContinueSameCell) {
                continue;
            }

            // Finished this cell. If we hit the 60-cap and have depth budget, enqueue a sub-task.
            if (state.cellResultCount >= 60 && task.depth < state.maxDepth) {
                const sub = cellViewport(task.viewport, effectiveGridSize, state.cellIndex);
                state.tasks.push({ viewport: sub, depth: task.depth + 1 });
            }

            // Advance to next cell
            state.cellIndex += 1;
            state.cellPageCount = 0;
            state.cellResultCount = 0;
            state.cellNextPageToken = null;
        }

        // If we ran out of tasks, mark done.
        if (state.taskIndex >= state.tasks.length) {
            state.done = true;
        }

        await Promise.all([
            redis.set(args.listCacheKey, JSON.stringify(cachedIds), "EX", args.ttlSeconds),
            redis.set(args.listDataCacheKey, JSON.stringify({ places: cachedPlaces, pageSize: args.pageSize }), "EX", args.ttlSeconds),
            saveDeepState(args.normalizedCity, args.normalizedKeyword, state, args.ttlSeconds),
        ]);
    } finally {
        await releaseLock(lockKey, lockToken);
    }
}

function buildSearchCacheKey(args: {
    userId: string;
    normalizedCity: string;
    normalizedKeyword: string;
    deepSearch: boolean;
    initialPageToken?: string;
}) {
    // GLOBAL CACHE: key is shared across users; user-specific fields are stripped before caching.
    return buildGlobalSearchCacheKey({
        normalizedCity: args.normalizedCity,
        normalizedKeyword: args.normalizedKeyword,
        deepSearch: args.deepSearch,
        pageToken: args.initialPageToken,
    });
}

function stripJobId(result: any) {
    if (!result || typeof result !== "object") return result;
    if (!("jobId" in result)) return result;
    // Old caches stored `jobId` which should never be shared across users.
    const { jobId: _jobId, ...rest } = result as any;
    return rest;
}

function stripPlaceForCache(place: any) {
    if (!place || typeof place !== "object") return place;
    // Remove user-specific fields before persisting to global/shared cache.
    const out: any = { ...(place as any) };
    delete out.emailUnlocked;
    delete out.emails;
    delete out.maskedEmails;
    delete out.emailScores;
    return out;
}

async function ensureLeadsForUser(userId: string, places: any[]) {
    if (!userId) return;
    if (!Array.isArray(places) || places.length === 0) return;

    const placeIds = places.map((p) => p?.place_id).filter(Boolean).slice(0, 500);
    if (placeIds.length === 0) return;

    const dbPlaces = await prisma.place.findMany({
        where: { googleId: { in: placeIds } },
        select: { id: true },
    });
    if (dbPlaces.length === 0) return;

    await prisma.lead.createMany({
        data: dbPlaces.map((p) => ({ userId, placeId: p.id, status: "NEW" })),
        skipDuplicates: true,
    });
}

async function hydratePlacesForUser(userId: string, places: any[]) {
    if (!userId) return places;
    if (!Array.isArray(places) || places.length === 0) return places;

    // Cached/shared results may not have user-specific Lead rows yet.
    // Create them best-effort so unlock/export flows work for cache hits too.
    await ensureLeadsForUser(userId, places).catch(() => { });

    const placeIds = places.map((p) => p?.place_id).filter(Boolean).slice(0, 300);
    if (placeIds.length === 0) return places;

    const [freshPlaces, leads] = await Promise.all([
        prisma.place.findMany({
            where: { googleId: { in: placeIds } },
            select: {
                googleId: true,
                emails: true,
                emailScores: true,
                phones: true,
                socials: true,
                website: true,
                scrapeStatus: true,
            },
        }),
        prisma.lead.findMany({
            where: { userId, place: { googleId: { in: placeIds } } },
            select: { emailUnlocked: true, place: { select: { googleId: true } } },
        }),
    ]);

    const freshMap = new Map(freshPlaces.map((p) => [p.googleId, p]));
    const unlockedSet = new Set(leads.filter((l) => l.emailUnlocked).map((l) => l.place.googleId));

    return places.map((p: any) => {
        const id = p?.place_id;
        if (!id) return p;

        const fresh = freshMap.get(id);
        const emailUnlocked = unlockedSet.has(id);
        const freshEmails = fresh?.emails || [];
        const emailCount = Array.isArray(freshEmails) ? freshEmails.length : 0;

        const out: any = { ...p };

        out.emailUnlocked = emailUnlocked;
        out.emailCount = emailCount;
        out.emails = emailUnlocked ? freshEmails : [];
        out.maskedEmails = !emailUnlocked && emailCount > 0 ? freshEmails.slice(0, 1).map(maskEmail) : [];
        out.emailScores = emailUnlocked ? (fresh?.emailScores || {}) : {};

        if (fresh) {
            out.phones = Array.isArray(fresh.phones) ? fresh.phones : out.phones;
            out.socials = fresh.socials ?? out.socials;
            out.website = fresh.website || out.website;
            out.scrapeStatus = fresh.scrapeStatus || out.scrapeStatus;
        }

        return out;
    });
}

export async function executeSearchCore(city: string, keyword: string, userId: string = "default-user", initialPageToken?: string, deepSearch: boolean = false, jobId?: string) {
    const normalizedCity = normalizeSearchInput(city);
    const normalizedKeyword = normalizeSearchInput(keyword);
    // Only publish streaming updates for background jobs where we have a stable jobId.
    const effectiveJobId = jobId;
    const { ip } = await getRequestMeta();

    // Global Cache Keys (Shared across all users)
    const { listCacheKey, listDataCacheKey } = buildGlobalDeepListKeys({ normalizedCity, normalizedKeyword });
    const cacheKey = buildSearchCacheKey({ userId, normalizedCity, normalizedKeyword, deepSearch, initialPageToken });
    const LONG_TERM_TTL = 31536000; // 1 Year (Effectively permanent)
    const MAX_DEEP_PAGES = Number(process.env.DEEP_SEARCH_MAX_PAGES || 200);

    // Helper to Persist & Publish
    const persistAndPublish = async (placesToSave: any[]) => {
        if (placesToSave.length === 0) return [];

        // 1. Upsert Places and Collect Results
        const enrichedBatch = await Promise.all(placesToSave.map(async (place: any) => {
            // Upsert Place
            const location = place.geometry?.location || place.location || {};
            const lat = (location as any).lat ?? (location as any).latitude;
            const lng = (location as any).lng ?? (location as any).longitude;
            const address = place.formatted_address || place.formattedAddress || null;
            const phone = place.formatted_phone_number || place.nationalPhoneNumber || null;
            const savedPlace = await prisma.place.upsert({
                where: { googleId: place.place_id },
                update: {
                    name: place.name,
                    address,
                    phone,
                    rating: place.rating,
                    userRatingsTotal: place.user_ratings_total,
                    latitude: lat,
                    longitude: lng,
                    types: place.types || [],
                    website: place.website || place.websiteUri || null,
                },
                create: {
                    googleId: place.place_id,
                    name: place.name,
                    address,
                    phone,
                    rating: place.rating,
                    userRatingsTotal: place.user_ratings_total,
                    latitude: lat,
                    longitude: lng,
                    types: place.types || [],
                    website: place.website || place.websiteUri || null,
                }
            });

            // Upsert Lead for User
            const savedLead = await prisma.lead.upsert({
                where: {
                    userId_placeId: {
                        userId,
                        placeId: savedPlace.id
                    }
                },
                update: {},
                create: {
                    userId,
                    placeId: savedPlace.id,
                    status: "NEW"
                },
                select: { emailUnlocked: true }
            });

            const emailUnlocked = Boolean(savedLead.emailUnlocked);
            const emailCount = Array.isArray(savedPlace.emails) ? savedPlace.emails.length : 0;
            const plainEmails = emailUnlocked ? (savedPlace.emails || []) : [];
            const maskedEmails = !emailUnlocked && emailCount > 0
                ? (savedPlace.emails || []).slice(0, 1).map(maskEmail)
                : [];

            // Return Enriched Object for Frontend
            return {
                ...place, // Keep original Google props
                name: savedPlace.name,
                emails: plainEmails,
                maskedEmails,
                emailCount,
                emailUnlocked,
                emailScores: emailUnlocked ? (savedPlace.emailScores || {}) : {},
                phones: savedPlace.phones || [],
                socials: savedPlace.socials,
                place_id: savedPlace.googleId,
                website: savedPlace.website,
                scrapeStatus: savedPlace.scrapeStatus,
            };
        }));

        // Publish to Redis if Job ID exists
        if (effectiveJobId && enrichedBatch.length > 0) {
            await redis.publish(`search:updates:${effectiveJobId}`, JSON.stringify(enrichedBatch));
        }

        return enrichedBatch;
    };

    // 1. Fetch User and Plan
    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        try {
            user = await prisma.user.create({
                data: {
                    id: userId,
                    email: userId.includes("@") ? userId : `${userId}@zakrom-test.com`,
                    credits: PLANS.FREE.credits,
                    subscriptionTier: "FREE"
                }
            });
        } catch (e) {
            user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw new Error("Kullanıcı oluşturulamadı.");
        }
    }

    // Determine credit cost (charged only on cache-miss)
    // All searches are now deep search by default
    // - Deep search init: 15 Credits
    // - Pagination: 1 Credit
    const isPagination = Boolean(initialPageToken);
    const tier = (user.subscriptionTier as SubscriptionTier) || "FREE";
    const plan = PLANS[tier] || PLANS.FREE;

    // Basic abuse protection: rate-limit search actions (separate bucket for "load more").
    // Credits already throttle usage, but this prevents rapid-fire automation that can spike external API cost.
    const searchRpmByTier: Record<SubscriptionTier, number> = {
        FREE: 6,
        STARTER: 15,
        PRO: 30,
        BUSINESS: 60,
    };
    const pageRpmByTier: Record<SubscriptionTier, number> = {
        FREE: 20,
        STARTER: 60,
        PRO: 120,
        BUSINESS: 240,
    };
    const limit = isPagination ? pageRpmByTier[tier] : searchRpmByTier[tier];
    const bucket = isPagination ? "page" : "search";
    const rlKey = `rl:${bucket}:user:${userId}`;
    const rl = await rateLimit(rlKey, { limit, windowMs: 60_000 });
    if (!rl.allowed) {
        throw new Error("Çok fazla istek. Lütfen biraz sonra tekrar deneyin.");
    }
    if (ip) {
        // Coarse IP limiter (helps against multi-account bursts behind one client).
        const ipRl = await rateLimit(`rl:${bucket}:ip:${ip}`, { limit: Math.max(30, limit * 2), windowMs: 60_000 });
        if (!ipRl.allowed) {
            throw new Error("Çok fazla istek. Lütfen biraz sonra tekrar deneyin.");
        }
    }

    const STANDARD_PAGE_SIZE = plan.resultsPerSearch;
    const configuredDeepPageSize = Number(process.env.DEEP_SEARCH_PAGE_SIZE || 60);
    const DEEP_PAGE_SIZE = Math.max(10, Math.min(configuredDeepPageSize, 500));

    // Tier-based "Load more" pricing.
    const pageLoadCost =
        (CREDIT_COSTS_BY_TIER as any)?.PAGE_LOAD?.[tier] ??
        CREDIT_COSTS.PAGINATION;
    const requiredCredits = isPagination ? pageLoadCost : CREDIT_COSTS.SEARCH;

    if (user.credits < requiredCredits) throw new Error(`Yetersiz bakiye. Bu işlem için ${requiredCredits} kredi gerekiyor.`);

    const remainingCredits = Math.max(0, user.credits - requiredCredits);
    const businessGridOverride = Number(process.env.DEEP_SEARCH_BUSINESS_GRID_SIZE || 0);
    const businessPagesOverride = Number(process.env.DEEP_SEARCH_BUSINESS_MAX_PAGES_PER_GRID || 0);

    // Grid sizes (deep scan)
    const baseGridSizeByTier: Record<SubscriptionTier, number> = {
        FREE: 2,       // 2x2 = 4 grid points
        STARTER: 3,    // 3x3 = 9 grid points
        PRO: 3,        // 3x3 = 9 grid points
        BUSINESS: businessGridOverride > 0 ? businessGridOverride : 4,  // 4x4 = 16 grid points
    };
    const basePagesByTier: Record<SubscriptionTier, number> = {
        FREE: 1,       // 1 page per grid cell
        STARTER: 2,    // 2 pages per grid cell
        PRO: 3,        // 3 pages per grid cell (needed to hit 60-cap and trigger recursion)
        BUSINESS: businessPagesOverride > 0 ? businessPagesOverride : 3,  // 3 pages per grid cell
    };
    // Keep deep-scan budgets stable per tier.
    // Previously we increased grid/pages when user had lots of remaining credits; that amplified Google API
    // usage without changing the search price, which can blow up our unit economics.
    const gridSize = Math.min(baseGridSizeByTier[tier], 5);  // Max 5x5 grid
    const maxPagesPerGrid = Math.min(basePagesByTier[tier], 4);  // Max 4 pages per grid cell
    const maxRecursiveDepthByTier: Record<SubscriptionTier, number> = {
        FREE: 0,
        STARTER: 0,
        PRO: 1,
        BUSINESS: 2,
    };
    const maxDepth = maxRecursiveDepthByTier[tier] || 0;

    const configuredMaxApiCalls = Number(process.env.MAX_API_CALLS_PER_SEARCH || 0);
    const estimatedBaseCalls = Math.max(1, gridSize * gridSize * maxPagesPerGrid);
    const depthFactor = Math.max(1, 1 + maxDepth);
    const MAX_API_CALLS = configuredMaxApiCalls > 0
        ? configuredMaxApiCalls
        : Math.min(300, estimatedBaseCalls * depthFactor);

    // --- EXECUTION OR RETRIEVAL ---
    let limitedPlaces: any[] = [];
    let nextToken: string | undefined = undefined;
    let enrichedPlaces: any[] = [];

    // A. Handle "Next Page" of Deep Search
    if (initialPageToken && initialPageToken.startsWith("deep:")) {
        const rawStartIndex = parseInt(initialPageToken.split(":")[1]);
        const startIndex = Number.isFinite(rawStartIndex) ? Math.max(0, rawStartIndex) : NaN;
        if (isNaN(startIndex)) throw new Error("Geçersiz sayfa tokenı.");

        // IMPORTANT (unit economics): deep pagination must not trigger additional Google API scans,
        // otherwise users can force large external spend for a small per-click credit charge.
        // We only paginate over already-cached deep results here.

        // Fetch from Redis List (prefer full cached place data if available)
        const [allPlacesParam, allIdsParam] = await Promise.all([
            redis.get(listDataCacheKey),
            redis.get(listCacheKey),
        ]);

        if (allPlacesParam) {
            const parsed = safeJsonParse<any>(allPlacesParam);
            const allPlaces = Array.isArray(parsed) ? parsed : (parsed?.places || []);

            const safeStart = Math.min(startIndex, allPlaces.length);
            limitedPlaces = allPlaces.slice(safeStart, safeStart + DEEP_PAGE_SIZE);
            if (limitedPlaces.length === 0) {
                return { places: [], nextPageToken: undefined };
            }

            enrichedPlaces = await persistAndPublish(limitedPlaces);

            const nextStart = safeStart + limitedPlaces.length;
            if (nextStart < allPlaces.length) nextToken = `deep:${nextStart}`;
        } else {
            if (!allIdsParam) throw new Error("Arama süresi dolmuş, lütfen tekrar arayın.");
            const allIds = JSON.parse(allIdsParam);
            const safeStart = Math.min(startIndex, allIds.length);
            const sliceIds = allIds.slice(safeStart, safeStart + DEEP_PAGE_SIZE);
            if (sliceIds.length === 0) {
                return { places: [], nextPageToken: undefined };
            }

            // Fetch details from DB
            const placesFromDb = await prisma.place.findMany({
                where: { googleId: { in: sliceIds } }
            });

            // Map DB objects to Google-like for uniformity, then re-run persistAndPublish
            // to apply per-user email gating (unlocked vs masked).
            limitedPlaces = placesFromDb.map(p => ({
                place_id: p.googleId,
                name: p.name,
                formatted_address: p.address,
                formatted_phone_number: p.phone,
                rating: p.rating,
                user_ratings_total: p.userRatingsTotal,
                photos: [],
                geometry: { location: { lat: p.latitude, lng: p.longitude } },
                location: (p.latitude && p.longitude) ? { latitude: p.latitude, longitude: p.longitude } : undefined,
                website: p.website,
                types: p.types,
            }));

            enrichedPlaces = await persistAndPublish(limitedPlaces);

            const nextStart = safeStart + DEEP_PAGE_SIZE;
            if (nextStart < allIds.length) {
                nextToken = `deep:${nextStart}`;
            }
        }

        // --- BILLING TRANSACTION (deep pagination) ---
        await prisma.$transaction(async (tx: any) => {
            const updated = await tx.user.updateMany({
                where: { id: userId, credits: { gte: requiredCredits } },
                data: { credits: { decrement: requiredCredits } }
            });
            if (updated.count === 0) throw new Error("Yetersiz bakiye.");

            await tx.creditTransaction.create({
                data: {
                    userId,
                    amount: -requiredCredits,
                    type: "PAGE_LOAD",
                    description: `"${keyword}" için ${city} derin sayfa yüklemesi`,
                    metadata: {
                        city: normalizedCity,
                        keyword: normalizedKeyword,
                        deepSearch: true,
                        pageToken: initialPageToken,
                        startIndex,
                        resultCount: enrichedPlaces.length,
                        timestamp: new Date().toISOString()
                    }
                }
            });
        });

        const finalResult = { places: enrichedPlaces, nextPageToken: nextToken };
        const cacheResult = { places: enrichedPlaces.map(stripPlaceForCache), nextPageToken: nextToken };
        await Promise.all([
            redis.set(cacheKey, JSON.stringify(cacheResult), "EX", LONG_TERM_TTL),
            prisma.searchCache.upsert({
                where: { queryKey: cacheKey },
                update: { results: cacheResult as any, expiresAt: new Date(Date.now() + LONG_TERM_TTL * 1000) },
                create: { queryKey: cacheKey, results: cacheResult as any, expiresAt: new Date(Date.now() + LONG_TERM_TTL * 1000) }
            })
        ]);

        return finalResult;
    }
        // B. Handle New Search (Standard or Deep)
    else if (!initialPageToken) {
        let allPlaces: any[] = [];

        // Check for "hybrid" mode or deep search fallback
        if (deepSearch) {
            // If a global deep-cache already exists for this query, use it directly.
            // This avoids doing an extra "city viewport probe" call per user, which adds up quickly.
            const rawGlobal = await redis.get(listDataCacheKey);
            const parsedGlobal = safeJsonParse<any>(rawGlobal);
            if (parsedGlobal) {
                allPlaces = Array.isArray(parsedGlobal) ? parsedGlobal : (parsedGlobal?.places || []);
            }

            if (allPlaces.length > 0) {
                // No need to call Google again; proceed to slicing/persisting below.
            } else {
            // 1. Get Viewport (using a cheap TextSearch for city)
            const cityResult = await googlePlacesGateway.searchText(city, {
                pageSize: 5,
                billing: { userId, tier },
            });

            // Prefer localities (cities) over broader administrative areas or countries
            const preferredTypes = ['locality', 'administrative_area_level_3', 'administrative_area_level_2', 'administrative_area_level_1'];
            let cityPlace = cityResult.places.find((p: any) =>
                p.types?.some((t: string) => preferredTypes.includes(t))
            ) || cityResult.places[0];

            console.log(`[Deep Search] Viewport check for "${city}":`, {
                hasPlace: !!cityPlace,
                hasViewport: !!cityPlace?.viewport,
                placeTypes: cityPlace?.types,
                placeName: cityPlace?.displayName?.text || cityPlace?.name
            });

            const cityViewport = cityPlace?.viewport ? {
                northeast: {
                    lat: Number((cityPlace.viewport as any).northeast?.latitude || (cityPlace.viewport as any).high?.latitude || 0),
                    lng: Number((cityPlace.viewport as any).northeast?.longitude || (cityPlace.viewport as any).high?.longitude || 0)
                },
                southwest: {
                    lat: Number((cityPlace.viewport as any).southwest?.latitude || (cityPlace.viewport as any).low?.latitude || 0),
                    lng: Number((cityPlace.viewport as any).southwest?.longitude || (cityPlace.viewport as any).low?.longitude || 0)
                }
            } : null;

            if (!cityViewport || (cityViewport.northeast.lat === 0 && cityViewport.northeast.lng === 0)) {
                console.log("Deep Search fallback: No viewport found for city.");
                const result = await googlePlacesGateway.searchText(`${keyword} in ${city}`, {
                    billing: { userId, tier },
                });
                allPlaces = result.places;
                // Persist & Publish Fallback Batch
                const persistedBatch = await persistAndPublish(allPlaces);
                enrichedPlaces.push(...persistedBatch);
            } else {
                // Optional "hybrid" mode via explicit prefix, but default deep search uses API only.
                if (keyword.startsWith("scrape:")) {
                    try {
                        const cleanKeyword = keyword.replace("scrape:", "").trim();
                        console.log(`[Search] HYBRID MODE: Scraping for "${cleanKeyword}" in ${city}...`);
                        const { scraperGateway } = await import('@/lib/gateway/scraper-gateway');
                        const scrapedPlaces = await scraperGateway.scanRegion(`${cleanKeyword} in ${city}`, cityViewport);

                        if (scrapedPlaces.length > 0) {
                            allPlaces = scrapedPlaces.map(p => ({
                                place_id: p.googleId || `scrape:${shortHash(p.name + p.latitude)}`,
                                name: p.name,
                                formatted_address: p.address,
                                rating: p.rating,
                                user_ratings_total: p.userRatingsTotal,
                                formatted_phone_number: p.phone,
                                website: p.website,
                                photos: [],
                                icon: p.imgUrl,
                                geometry: { location: { lat: p.latitude, lng: p.longitude } },
                                location: { latitude: p.latitude, longitude: p.longitude },
                                types: p.types
                            }));

                            const persistedBatch = await persistAndPublish(allPlaces);
                            enrichedPlaces.push(...persistedBatch);
                        }
                    } catch (e) {
                        console.error("[Search] Scraper failed, falling back to API:", e);
                    }
                }

                // API deep search should be incremental: do not pre-scan the whole city.
                if (allPlaces.length === 0) {
                    // Budgeted Google API calls for the initial deep scan.
                    // Keep aligned with unit economics (see KARLILIK_ANALIZI.md).
                    const deepInitialApiBudgetByTier: Record<SubscriptionTier, number> = {
                        FREE: 8,
                        STARTER: 10,
                        PRO: 15,
                        BUSINESS: 20,
                    };

                    // Prefill multiple pages up-front to keep "Load more" cheap (cache-only).
                    // This avoids re-triggering external API calls on every pagination click.
                    const prefillPagesByTier: Record<SubscriptionTier, number> = {
                        FREE: 1,
                        STARTER: 2,
                        PRO: 3,
                        BUSINESS: 5,
                    };
                    const prefillMaxResultsRaw = Number(process.env.DEEP_SEARCH_PREFILL_MAX_RESULTS || 300);
                    const prefillMaxResults = Math.max(DEEP_PAGE_SIZE, Math.min(3000, prefillMaxResultsRaw));
                    const prefillTargetCount = Math.min(
                        prefillMaxResults,
                        DEEP_PAGE_SIZE * (prefillPagesByTier[tier] || 1)
                    );

                    await fillDeepCacheToTarget({
                        normalizedCity,
                        normalizedKeyword,
                        keyword,
                        cityViewport,
                        billingUserId: userId,
                        billingTier: tier,
                        baseGridSize: gridSize,
                        maxPagesPerGrid,
                        maxDepth,
                        pageSize: DEEP_PAGE_SIZE,
                        listCacheKey,
                        listDataCacheKey,
                        ttlSeconds: LONG_TERM_TTL,
                        targetCount: prefillTargetCount,
                        apiCallBudget: deepInitialApiBudgetByTier[tier] || 16,
                    });

                    const raw = await redis.get(listDataCacheKey);
                    const parsed = safeJsonParse<any>(raw);
                    allPlaces = Array.isArray(parsed) ? parsed : (parsed?.places || []);
                }
            }
            }

            // Limit for First Page Return
            limitedPlaces = allPlaces.slice(0, DEEP_PAGE_SIZE);
            if (allPlaces.length > DEEP_PAGE_SIZE) nextToken = `deep:${DEEP_PAGE_SIZE}`;

            // Persist & Publish THE FIRST PAGE immediately (or all?)
            // If we persist ALL, it might be slow.
            // Let's persist the cached page (limitedPlaces) so user sees them.
            // What about the rest? They stay in Redis ID list but not in DB?
            // "Lead" creation usually happens when viewed?
            // If we want "Deep Search" to populate DB with 1000 leads instantly, that's heavy.
            // Usual pattern: Only persist what we show/return.
            // So we persist `limitedPlaces`.

            // Wait, if fallback path above ran `persistAndPublish`, we might double save?
            // Fallback path added to `enrichedPlaces`.
            // Standard Deep Search (API-based) - Only run if allPlaces is empty (meaning scraper didn't run or found nothing)
            if (allPlaces.length === 0) {
                // 1. Get Viewport (using a cheap TextSearch for city)
                const cityResult = await googlePlacesGateway.searchText(city, { pageSize: 5 });
            }
            if (enrichedPlaces.length === 0) {
                const batch = await persistAndPublish(limitedPlaces);
                enrichedPlaces = batch;
            }

        } else {
            // Standard Search Logic
            const query = `${keyword} in ${city}`;
            console.log(`[Search] Executing query: "${query}"`);

            let fetchCount = 0;
            const MAX_FETCHES = Math.ceil(STANDARD_PAGE_SIZE / 20) + 1;
            let currentToken = undefined;

            while (fetchCount < MAX_FETCHES && allPlaces.length < STANDARD_PAGE_SIZE) {
                const result = await googlePlacesGateway.searchText(query, {
                    pageToken: currentToken,
                    billing: { userId, tier },
                });
                const newPlaces = result.places;

                // Incremental Publish!
                if (newPlaces.length > 0) {
                    const batch = await persistAndPublish(newPlaces);
                    enrichedPlaces.push(...batch); // Collect for final return/cache
                }

                allPlaces = [...allPlaces, ...newPlaces];
                currentToken = result.nextPageToken;
                fetchCount++;
                if (!currentToken) break;
            }

            limitedPlaces = allPlaces.slice(0, STANDARD_PAGE_SIZE); // We might have fetched slightly more
            // Re-slice enrichedPlaces to match STANDARD_PAGE_SIZE if needed, though collecting all is fine for cache
            enrichedPlaces = enrichedPlaces.slice(0, STANDARD_PAGE_SIZE);

            if (!currentToken) {
                // If Google gave no token, we are done.
                // Note: Standard Text Search often limits at 60.
                nextToken = allPlaces.length >= 60 ? "google_limit_reached" : undefined;
            } else {
                nextToken = limitedPlaces.length < allPlaces.length ? "plan_limit_reached" : currentToken;
            }
        }

        // --- BILLING TRANSACTION ---
        const searchDescription = deepSearch
            ? `"${keyword}" için ${city} bölgesinde derin arama`
            : `"${keyword}" için ${city} bölgesinde arama`;

        const totalCost = requiredCredits;

        await prisma.$transaction(async (tx: any) => {
            const updated = await tx.user.updateMany({
                where: { id: userId, credits: { gte: totalCost } },
                data: { credits: { decrement: totalCost } }
            });
            if (updated.count === 0) throw new Error("Yetersiz bakiye.");

            await tx.creditTransaction.create({
                data: {
                    userId,
                    amount: -requiredCredits,
                    type: deepSearch && !isPagination ? "DEEP_SEARCH" : (isPagination ? "PAGE_LOAD" : "SEARCH"),
                    description: searchDescription,
                    metadata: {
                        city: normalizedCity,
                        keyword: normalizedKeyword,
                        resultCount: limitedPlaces.length,
                        deepSearch,
                        timestamp: new Date().toISOString()
                    }
                }
            });

            // Only log history for new searches, not pagination
            if (!isPagination) {
                await tx.searchHistory.create({
                    data: {
                        userId,
                        // Store user-facing values (not normalized) for nicer history UX.
                        city: city.trim(),
                        keyword: keyword.trim(),
                        resultCount: deepSearch ? 999 : limitedPlaces.length // Indicator for deep search?
                    }
                });
            }
        });

        const finalResult = { places: enrichedPlaces, nextPageToken: nextToken };
        const cacheResult = { places: enrichedPlaces.map(stripPlaceForCache), nextPageToken: nextToken };
        await Promise.all([
            redis.set(cacheKey, JSON.stringify(cacheResult), "EX", LONG_TERM_TTL),
            prisma.searchCache.upsert({
                where: { queryKey: cacheKey },
                update: { results: cacheResult as any, expiresAt: new Date(Date.now() + LONG_TERM_TTL * 1000) },
                create: { queryKey: cacheKey, results: cacheResult as any, expiresAt: new Date(Date.now() + LONG_TERM_TTL * 1000) }
            })
        ]);

        return finalResult;
    }
    // C. Handle Google Token Pagination (Legacy/Standard)
    else {
        // Existing Logic for standard paging
        const query = `${keyword} in ${city}`;
        const result = await googlePlacesGateway.searchText(query, {
            pageToken: initialPageToken,
            billing: { userId, tier },
        });
        limitedPlaces = result.places; // Google returns 20
        nextToken = result.nextPageToken;

        await prisma.$transaction(async (tx: any) => {
            const updated = await tx.user.updateMany({
                where: { id: userId, credits: { gte: requiredCredits } },
                data: { credits: { decrement: requiredCredits } }
            });
            if (updated.count === 0) throw new Error("Yetersiz bakiye.");
            await tx.creditTransaction.create({
                data: {
                    userId,
                    amount: -requiredCredits,
                    type: "PAGE_LOAD",
                    description: `"${keyword}" araması sayfa yüklemesi`,
                    metadata: {
                        city: normalizedCity,
                        keyword: normalizedKeyword,
                        pageToken: initialPageToken,
                        timestamp: new Date().toISOString()
                    }
                }
            });
        });

        // Persist & Publish
        enrichedPlaces = await persistAndPublish(limitedPlaces);

        const finalResult = { places: enrichedPlaces, nextPageToken: nextToken };
        const cacheResult = { places: enrichedPlaces.map(stripPlaceForCache), nextPageToken: nextToken };
        await Promise.all([
            redis.set(cacheKey, JSON.stringify(cacheResult), "EX", LONG_TERM_TTL),
            prisma.searchCache.upsert({
                where: { queryKey: cacheKey },
                update: { results: cacheResult as any, expiresAt: new Date(Date.now() + LONG_TERM_TTL * 1000) },
                create: { queryKey: cacheKey, results: cacheResult as any, expiresAt: new Date(Date.now() + LONG_TERM_TTL * 1000) }
            })
        ]);

        return finalResult;
    }
}

export async function searchPlacesInternal(
    city: string,
    keyword: string,
    apiKey?: string,
    initialPageToken?: string,
    userId?: string,
    deepSearch: boolean = false,
    jobId?: string
) {
    const normalizedCity = normalizeSearchInput(city);
    const normalizedKeyword = normalizeSearchInput(keyword);
    const effectiveUserId = userId || "default-user";

    if (!normalizedCity || !normalizedKeyword) {
        throw new Error("Şehir ve anahtar kelime zorunludur.");
    }

    console.log(`[DEBUG] searchPlaces called for city: ${normalizedCity}, keyword: ${normalizedKeyword}, deepSearch: ${deepSearch}`);

    const cacheKey = buildSearchCacheKey({
        userId: effectiveUserId,
        normalizedCity,
        normalizedKeyword,
        deepSearch,
        initialPageToken,
    });
    const lockKey = `lock:${cacheKey}`;

    // 1) Redis cache
    const cachedResults = await redis.get(cacheKey);
    if (cachedResults) {
        const parsed = stripJobId(JSON.parse(cachedResults)) as any;
        parsed.places = await hydratePlacesForUser(effectiveUserId, parsed.places || []);
        const { ip, userAgent } = await getRequestMeta();
        await logAuditEvent({
            userId: effectiveUserId,
            action: "SEARCH_CACHE_HIT",
            ip,
            userAgent,
            metadata: { city: normalizedCity, keyword: normalizedKeyword, deepSearch, hasPageToken: Boolean(initialPageToken) },
        });
        return parsed;
    }

    // 2) DB cache (fallback)
    const dbCache = await prisma.searchCache.findUnique({
        where: { queryKey: cacheKey }
    });

    if (dbCache && dbCache.expiresAt > new Date()) {
        const ttlSeconds = Math.max(1, Math.floor((dbCache.expiresAt.getTime() - Date.now()) / 1000));
        const safe = stripJobId(dbCache.results as any);
        await redis.set(cacheKey, JSON.stringify(safe), "EX", ttlSeconds);
        const parsed = safe as any;
        parsed.places = await hydratePlacesForUser(effectiveUserId, parsed.places || []);
        const { ip, userAgent } = await getRequestMeta();
        await logAuditEvent({
            userId: effectiveUserId,
            action: "SEARCH_CACHE_HIT_DB",
            ip,
            userAgent,
            metadata: { city: normalizedCity, keyword: normalizedKeyword, deepSearch, hasPageToken: Boolean(initialPageToken) },
        });
        return parsed;
    }

    let lockToken: string | null = null;
    try {
        lockToken = await acquireLock(lockKey, LOCK_TTL_MS);
        if (!lockToken) {
            const cachedFromWait = await waitForValue(cacheKey, WAIT_FOR_CACHE_MS, WAIT_POLL_MS);
            if (cachedFromWait) {
                const parsed = stripJobId(JSON.parse(cachedFromWait)) as any;
                parsed.places = await hydratePlacesForUser(effectiveUserId, parsed.places || []);
                return parsed;
            }
            lockToken = await acquireLock(lockKey, LOCK_TTL_MS);
            if (!lockToken) throw new Error("Sistem şu an bu aramayı gerçekleştiriyor.");
        }

        return await executeSearchCore(city, keyword, effectiveUserId, initialPageToken, deepSearch, jobId);
    } finally {
        if (lockToken) await releaseLock(lockKey, lockToken);
    }
}

// Authenticated wrapper for UI usage (prevents userId spoofing from the client).
export async function searchPlaces(
    city: string,
    keyword: string,
    initialPageToken?: string,
    deepSearch: boolean = false
) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Oturum açmanız gerekiyor.");
    }

    const userId = session.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tier = (user?.subscriptionTier as SubscriptionTier) || "FREE";
    const plan = PLANS[tier] || PLANS.FREE;

    {
        const { ip, userAgent } = await getRequestMeta();
        await logAuditEvent({
            userId,
            action: "SEARCH_REQUEST",
            ip,
            userAgent,
            metadata: { city, keyword, deepSearch, hasPageToken: Boolean(initialPageToken), tier },
        });
    }

    // Queue only the heavy "new search" work; pagination should stay inline for snappy UX.
    const useBackgroundWorker =
        Boolean(deepSearch) &&
        !initialPageToken &&
        plan.features.backgroundWorker &&
        process.env.BACKGROUND_WORKER_ENABLED === 'true';

    if (useBackgroundWorker) {
        try {
            const asyncRes = await searchPlacesAsyncInternal(city, keyword, userId, initialPageToken, deepSearch);

            if (asyncRes.type === "CACHED") {
                return {
                    success: true,
                    data: asyncRes.results?.places || [],
                    nextPageToken: asyncRes.results?.nextPageToken,
                    credits: user?.credits || 0,
                };
            }

            {
                const { ip, userAgent } = await getRequestMeta();
                await logAuditEvent({
                    userId,
                    action: "SEARCH_JOB_ENQUEUED",
                    ip,
                    userAgent,
                    metadata: { jobId: asyncRes.jobId, city, keyword, deepSearch, tier },
                });
            }

            return {
                success: true,
                jobId: asyncRes.jobId,
                message: asyncRes.message || "Arama işlemi arka planda başlatıldı.",
                data: [],
                nextPageToken: undefined,
                credits: user?.credits || 0,
            };
        } catch (e) {
            console.error("Failed to enqueue job:", e);
            // Fallback to inline execution if queue fails?
            // Or throw?
            // Let's fallback to inline for resilience.
        }
    }

    const res = await searchPlacesInternal(city, keyword, undefined, initialPageToken, userId, deepSearch);

    {
        const { ip, userAgent } = await getRequestMeta();
        await logAuditEvent({
            userId,
            action: "SEARCH_COMPLETED_INLINE",
            ip,
            userAgent,
            metadata: { city, keyword, deepSearch, hasPageToken: Boolean(initialPageToken), resultCount: (res?.places || []).length, nextPageToken: res?.nextPageToken || null },
        });
    }

    return {
        success: true,
        data: res.places || [],
        nextPageToken: res.nextPageToken,
        credits: user?.credits || 0 // approximate, actual credits deducted in internal
    };
}

export async function searchPlacesAsyncInternal(city: string, keyword: string, userId: string = "default-user", initialPageToken?: string, deepSearch: boolean = false) {
    // 1. Validate Input
    const validated = SearchSchema.safeParse({ city, keyword, deepSearch });
    if (!validated.success) {
        throw new Error(validated.error.issues[0].message);
    }

    const { city: validatedCity, keyword: validatedKeyword } = validated.data;
    const normalizedCity = normalizeSearchInput(validatedCity);
    const normalizedKeyword = normalizeSearchInput(validatedKeyword);
    const cacheKey = buildSearchCacheKey({
        userId,
        normalizedCity,
        normalizedKeyword,
        deepSearch,
        initialPageToken,
    });
    const jobLockKey = `lock:job:${cacheKey}`;

    // 2. Check Cache First (Skipped for Deep Search initiation? Or check deep cache?)
    // For simplicity, standard cache check.
    const cachedResults = await redis.get(cacheKey);
    if (cachedResults) {
        const parsed = stripJobId(JSON.parse(cachedResults)) as any;
        parsed.places = await hydratePlacesForUser(userId, parsed.places || []);
        return { type: "CACHED", results: parsed };
    }

    // 3. Thundering Herd Protection:
    // Only one request should trigger a job for a non-cached query
    let lockToken = await acquireLock(jobLockKey, 10000);

    if (!lockToken) {
        // If we can't get the lock, wait a bit and check if a job was created by another process
        for (let i = 0; i < 5; i++) {
            await new Promise(r => setTimeout(r, 300));
            const existingJobId = await redis.get(`active-job:${cacheKey}`);
            if (existingJobId) {
                return { type: "JOB", jobId: existingJobId, message: "Arama zaten devrededir." };
            }
        }
        // If after 1.5s still no job ID, try to acquire lock one last time
        lockToken = await acquireLock(jobLockKey, 10000);
        if (!lockToken) {
            throw new Error("Sistem şu an çok yoğun, lütfen az sonra tekrar deneyin.");
        }
    }

    try {
        // Re-check cache inside lock
        const secondCacheCheck = await redis.get(cacheKey);
        if (secondCacheCheck) {
            const parsed = stripJobId(JSON.parse(secondCacheCheck)) as any;
            parsed.places = await hydratePlacesForUser(userId, parsed.places || []);
            return { type: "CACHED", results: parsed };
        }

        // Double check active-job tracker inside lock too
        const activeJobId = await redis.get(`active-job:${cacheKey}`);
        if (activeJobId) return { type: "JOB", jobId: activeJobId, message: "Arama zaten devrededir." };

        // 4. Add to Queue
        const jobId = await addSearchJob({ city: validatedCity, keyword: validatedKeyword, userId, initialPageToken, deepSearch });

        // 5. Set status and tracker in Redis
        await redis.set(`job:${jobId}:status`, "pending", "EX", 3600);
        await redis.set(`job:${jobId}:userId`, userId, "EX", 3600);
        await redis.set(`active-job:${cacheKey}`, jobId || "pending", "EX", 60); // Tracker for concurrent requests

        return { type: "JOB", jobId };
    } finally {
        if (lockToken) await releaseLock(jobLockKey, lockToken);
    }
}

export async function searchPlacesAsync(
    city: string,
    keyword: string,
    initialPageToken?: string,
    deepSearch: boolean = false
) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Oturum açmanız gerekiyor.");
    }
    return searchPlacesAsyncInternal(city, keyword, session.user.id, initialPageToken, deepSearch);
}
