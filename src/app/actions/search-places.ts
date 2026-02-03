"use server";

import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { acquireLock, releaseLock, waitForValue, rateLimitSlidingWindow } from "@/lib/traffic-control";
import { googlePlacesGateway } from "@/lib/gateway/google-places";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { z } from "zod";
import { randomUUID } from "crypto";
import { addSearchJob } from "@/lib/queue/search-queue";
import { addEnrichmentJob } from "@/lib/queue/enrichment-queue";

const CACHE_TTL_SECONDS = 86400;
const LOCK_TTL_MS = 30000;
const WAIT_FOR_CACHE_MS = 8000;
const WAIT_POLL_MS = 200;
const GLOBAL_RATE_LIMIT_PER_MIN = Number(process.env.GOOGLE_PLACES_GLOBAL_RPM || 0);
const USER_RATE_LIMIT_PER_MIN = Number(process.env.GOOGLE_PLACES_USER_RPM || 0);

const SearchSchema = z.object({
    city: z.string().trim().min(2, "Şehir adı en az 2 karakter olmalıdır.").max(50, "Şehir adı çok uzun."),
    keyword: z.string().trim().min(2, "Anahtar kelime en az 2 karakter olmalıdır.").max(50, "Anahtar kelime çok uzun."),
    deepSearch: z.boolean().optional().default(false),
});

function normalizeInput(value: string) {
    return value.trim().toLowerCase();
}

export async function executeSearchCore(city: string, keyword: string, userId: string = "default-user", initialPageToken?: string, deepSearch: boolean = false, jobId?: string) {
    const normalizedCity = normalizeInput(city);
    const normalizedKeyword = normalizeInput(keyword);
    // Ensure we have a Job ID for streaming updates (even for sync searches)
    const effectiveJobId = jobId || randomUUID();

    // Unique cache key distinguishes deep search results list
    const listCacheKey = `search:list:${normalizedCity}:${normalizedKeyword}`;
    const cacheKey = `search:${normalizedCity}:${normalizedKeyword}:${initialPageToken || 'p1'}`;
    const LONG_TERM_TTL = 2592000;

    // Helper to Persist & Publish
    const persistAndPublish = async (placesToSave: any[]) => {
        if (placesToSave.length === 0) return [];

        // 1. Upsert Places and Collect Results
        const enrichedBatch = await Promise.all(placesToSave.map(async (place: any) => {
            // Upsert Place
            const location = place.geometry?.location || {};
            const savedPlace = await prisma.place.upsert({
                where: { googleId: place.place_id },
                update: {
                    name: place.name,
                    address: place.formatted_address,
                    rating: place.rating,
                    userRatingsTotal: place.user_ratings_total,
                    latitude: location.lat,
                    longitude: location.lng,
                    types: place.types || [],
                    website: place.website || null,
                },
                create: {
                    googleId: place.place_id,
                    name: place.name,
                    address: place.formatted_address,
                    rating: place.rating,
                    userRatingsTotal: place.user_ratings_total,
                    latitude: location.lat,
                    longitude: location.lng,
                    types: place.types || [],
                    website: place.website || null,
                }
            });

            // Upsert Lead for User
            await prisma.lead.upsert({
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
                }
            });

            // 3. Trigger Scraping Job if website exists and not already scraped
            // 3. Trigger Scraping Job if (website exists OR missing) and not already scraped
            if ((!savedPlace.emails || savedPlace.emails.length === 0) && savedPlace.scrapeStatus === 'PENDING') {
                await addEnrichmentJob({
                    placeId: savedPlace.id,
                    website: place.website || "", // Pass empty string if missing, worker handles fallback
                    name: place.name,
                    address: place.formatted_address,
                    jobId: effectiveJobId
                });
            }

            // Return Enriched Object for Frontend
            return {
                ...place, // Keep original Google props
                name: savedPlace.name,
                emails: savedPlace.emails || [],
                socials: savedPlace.socials,
                place_id: savedPlace.googleId,
                website: savedPlace.website,
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
                    credits: 100,
                    subscriptionTier: "FREE"
                }
            });
        } catch (e) {
            user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw new Error("Kullanıcı oluşturulamadı.");
        }
    }

    // Determine Cost
    // Deep Search Init: 10 credits
    // Paid Pagination (page > 1 & deep logic): 1 credit
    let requiredCredits = 1;
    let isPaidPagination = false;

    if (!initialPageToken && deepSearch) {
        requiredCredits = 10;
    } else if (initialPageToken && initialPageToken.startsWith("deep:")) {
        requiredCredits = 1;
        isPaidPagination = true;
    }

    if (user.credits < requiredCredits) throw new Error(`Yetersiz bakiye. Bu işlem için ${requiredCredits} kredi gerekiyor.`);

    const plan = PLANS[user.subscriptionTier as SubscriptionTier] || PLANS.FREE;
    // For Deep Search, we use the plan's page size, but allow infinite scrolling via credits
    const PAGE_SIZE = plan.resultsPerSearch;

    // --- EXECUTION OR RETRIEVAL ---
    let limitedPlaces: any[] = [];
    let nextToken: string | undefined = undefined;
    let enrichedPlaces: any[] = [];

    // A. Handle "Next Page" of Deep Search
    if (initialPageToken && initialPageToken.startsWith("deep:")) {
        const startIndex = parseInt(initialPageToken.split(":")[1]);
        if (isNaN(startIndex)) throw new Error("Geçersiz sayfa tokenı.");

        // Fetch from Redis List
        const allIdsParam = await redis.get(listCacheKey);
        if (!allIdsParam) throw new Error("Arama süresi dolmuş, lütfen tekrar arayın.");
        const allIds = JSON.parse(allIdsParam);

        const sliceIds = allIds.slice(startIndex, startIndex + PAGE_SIZE);

        // Fetch details from DB
        const placesFromDb = await prisma.place.findMany({
            where: { googleId: { in: sliceIds } }
        });

        // Map DB objects to Google-like for uniformity
        limitedPlaces = placesFromDb.map(p => ({
            place_id: p.googleId,
            name: p.name,
            formatted_address: p.address,
            rating: p.rating,
            user_ratings_total: p.userRatingsTotal,
            photos: [],
            geometry: { location: { lat: p.latitude, lng: p.longitude } },
            website: p.website,
            emails: p.emails,
            socials: p.socials
        }));

        // This path is already "persisted", just need to publish/return?
        // Actually, if we are loading from DB, they are already persisted.
        // We might just want to publish them as "instant load" for consistency?
        // Or just return them. For "Load More", frontend usually awaits the promise anyway.
        // But let's publish for consistency if needed, though usually Load More is synchronous-like.

        enrichedPlaces = limitedPlaces; // Already enriched from DB basically

        if (startIndex + PAGE_SIZE < allIds.length) {
            nextToken = `deep:${startIndex + PAGE_SIZE}`;
        }

    }
    // B. Handle New Search (Standard or Deep)
    else if (!initialPageToken) {
        let allPlaces: any[] = [];

        if (deepSearch) {
            // 1. Get Viewport (using a cheap TextSearch for city)
            const cityResult = await googlePlacesGateway.searchText(city, { pageSize: 1 });
            const cityViewport = cityResult.places[0]?.location ? {
                northeast: (cityResult.places[0] as any).viewport?.northeast || { lat: 0, lng: 0 },
                southwest: (cityResult.places[0] as any).viewport?.southwest || { lat: 0, lng: 0 }
            } : null;

            if (!cityViewport || (cityViewport.northeast.lat === 0 && cityViewport.northeast.lng === 0)) {
                console.log("Deep Search fallback: No viewport found for city.");
                const result = await googlePlacesGateway.searchText(`${keyword} in ${city}`);
                allPlaces = result.places;
                // Persist & Publish Fallback Batch
                const persistedBatch = await persistAndPublish(allPlaces);
                enrichedPlaces.push(...persistedBatch);
            } else {
                console.log(`[Deep Search] Scanning grid for ${city}...`);
                // Note: scanCity might return a LOT. We might want to pass a callback to scanCity to stream?
                // For now, scanCity returns all at once. If it takes too long, we might need to refactor scanCity too.
                // Assuming scanCity is reasonably fast or we process its result here.

                // If scanCity is internal, we can't easily hook into it without refactoring it.
                // Let's assume we get the big list and then process/publish it.
                // *Critique*: If scanCity takes 2 mins, user waits 2 mins.
                // Ideal: scanCity yields chunks.
                // Current constrained scope: Process result of scanCity.

                allPlaces = await googlePlacesGateway.scanCity(keyword, cityViewport);

                // Incremental processing for the stored result?
                // We receive `allPlaces`.
            }

            // Deduplicate by place_id
            const uniqueMap = new Map();
            allPlaces.forEach(p => uniqueMap.set(p.place_id, p));
            allPlaces = Array.from(uniqueMap.values());
            console.log(`[Deep Search] Found ${allPlaces.length} unique places.`);

            // Store Logic for Deep Search
            // Save ALL IDs to Redis for pagination
            const allIds = allPlaces.map(p => p.place_id);
            await redis.set(listCacheKey, JSON.stringify(allIds), "EX", LONG_TERM_TTL);

            // Limit for First Page Return
            limitedPlaces = allPlaces.slice(0, PAGE_SIZE);
            if (allPlaces.length > PAGE_SIZE) {
                nextToken = `deep:${PAGE_SIZE}`;
            }

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
            // Let's clear enrichedPlaces if we are re-slicing or manage flow carefully.

            if (enrichedPlaces.length === 0) {
                const batch = await persistAndPublish(limitedPlaces);
                enrichedPlaces = batch;
            }

        } else {
            // Standard Search Logic
            const query = `${keyword} in ${city}`;
            console.log(`[Search] Executing query: "${query}"`);

            let fetchCount = 0;
            const MAX_FETCHES = Math.ceil(PAGE_SIZE / 20) + 1;
            let currentToken = undefined;

            while (fetchCount < MAX_FETCHES && allPlaces.length < PAGE_SIZE) {
                const result = await googlePlacesGateway.searchText(query, { pageToken: currentToken });
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

            limitedPlaces = allPlaces.slice(0, PAGE_SIZE); // We might have fetched slightly more
            // Re-slice enrichedPlaces to match PAGE_SIZE if needed, though collecting all is fine for cache
            enrichedPlaces = enrichedPlaces.slice(0, PAGE_SIZE);

            if (!currentToken) {
                // If Google gave no token, we are done.
                // Note: Standard Text Search often limits at 60.
                nextToken = undefined;
            } else {
                nextToken = limitedPlaces.length < allPlaces.length ? "plan_limit_reached" : currentToken;
            }
        }

        // --- BILLING TRANSACTION ---
        const searchDescription = deepSearch
            ? `"${keyword}" için ${city} bölgesinde derin arama`
            : `"${keyword}" için ${city} bölgesinde arama`;

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
                    type: deepSearch ? "DEEP_SEARCH" : (isPaidPagination ? "PAGE_LOAD" : "SEARCH"),
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
            if (!isPaidPagination) {
                await tx.searchHistory.create({
                    data: {
                        userId,
                        city: normalizedCity,
                        keyword: normalizedKeyword,
                        resultCount: deepSearch ? 999 : limitedPlaces.length // Indicator for deep search?
                    }
                });
            }
        });

        // Cache the specific page result
        const finalResult = { places: enrichedPlaces, nextPageToken: nextToken, jobId: effectiveJobId };
        await Promise.all([
            redis.set(cacheKey, JSON.stringify(finalResult), "EX", LONG_TERM_TTL),
            prisma.searchCache.upsert({
                where: { queryKey: cacheKey },
                update: { results: finalResult as any, expiresAt: new Date(Date.now() + LONG_TERM_TTL * 1000) },
                create: { queryKey: cacheKey, results: finalResult as any, expiresAt: new Date(Date.now() + LONG_TERM_TTL * 1000) }
            })
        ]);

        return finalResult;
    }
    // C. Handle Google Token Pagination (Legacy/Standard)
    else {
        // Existing Logic for standard paging
        const query = `${keyword} in ${city}`;
        const result = await googlePlacesGateway.searchText(query, { pageToken: initialPageToken });
        limitedPlaces = result.places; // Google returns 20
        nextToken = result.nextPageToken;

        await prisma.$transaction(async (tx: any) => {
            await tx.user.updateMany({ where: { id: userId }, data: { credits: { decrement: 1 } } });
            await tx.creditTransaction.create({
                data: {
                    userId,
                    amount: -1,
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
    }

    const finalResult = {
        places: enrichedPlaces,
        nextPageToken: nextToken,
        jobId: effectiveJobId
    };

    return finalResult;
}

export async function searchPlaces(
    city: string,
    keyword: string,
    apiKey?: string,
    initialPageToken?: string,
    userId?: string,
    deepSearch: boolean = false
) {
    const normalizedCity = normalizeInput(city);
    const normalizedKeyword = normalizeInput(keyword);

    if (!normalizedCity || !normalizedKeyword) {
        throw new Error("Şehir ve anahtar kelime zorunludur.");
    }

    const cacheKey = `search:${normalizedCity}:${normalizedKeyword}`;
    const lockKey = `lock:${cacheKey}`;

    if (!initialPageToken) {
        const cachedResults = await redis.get(cacheKey);
        if (cachedResults) return JSON.parse(cachedResults);

        const dbCache = await prisma.searchCache.findUnique({
            where: { queryKey: cacheKey }
        });

        if (dbCache && dbCache.expiresAt > new Date()) {
            const ttlSeconds = Math.max(1, Math.floor((dbCache.expiresAt.getTime() - Date.now()) / 1000));
            await redis.set(cacheKey, JSON.stringify(dbCache.results), "EX", ttlSeconds);
            return dbCache.results as any;
        }
    }

    let lockToken: string | null = null;
    try {
        if (!initialPageToken) {
            lockToken = await acquireLock(lockKey, LOCK_TTL_MS);
            if (!lockToken) {
                const cachedFromWait = await waitForValue(cacheKey, WAIT_FOR_CACHE_MS, WAIT_POLL_MS);
                if (cachedFromWait) return JSON.parse(cachedFromWait);
                lockToken = await acquireLock(lockKey, LOCK_TTL_MS);
                if (!lockToken) throw new Error("Sistem şu an bu aramayı gerçekleştiriyor.");
            }
        }

        return await executeSearchCore(city, keyword, userId || "default-user", initialPageToken, deepSearch);
    } finally {
        if (lockToken) await releaseLock(lockKey, lockToken);
    }
}

export async function searchPlacesAsync(city: string, keyword: string, userId: string = "default-user", initialPageToken?: string, deepSearch: boolean = false) {
    // 1. Validate Input
    const validated = SearchSchema.safeParse({ city, keyword, deepSearch });
    if (!validated.success) {
        throw new Error(validated.error.issues[0].message);
    }

    const { city: validatedCity, keyword: validatedKeyword } = validated.data;
    const normalizedCity = normalizeInput(validatedCity);
    const normalizedKeyword = normalizeInput(validatedKeyword);
    // Include pageToken in cache key to avoid collisions between pages
    const cacheKey = `search:${normalizedCity}:${normalizedKeyword}:${initialPageToken || 'p1'}`;
    const jobLockKey = `lock:job:${cacheKey}`;

    // 2. Check Cache First (Skipped for Deep Search initiation? Or check deep cache?)
    // For simplicity, standard cache check.
    const cachedResults = await redis.get(cacheKey);
    if (cachedResults) return { type: "CACHED", results: JSON.parse(cachedResults) };

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
        if (secondCacheCheck) return { type: "CACHED", results: JSON.parse(secondCacheCheck) };

        // Double check active-job tracker inside lock too
        const activeJobId = await redis.get(`active-job:${cacheKey}`);
        if (activeJobId) return { type: "JOB", jobId: activeJobId, message: "Arama zaten devrededir." };

        // 4. Add to Queue
        const jobId = await addSearchJob({ city: validatedCity, keyword: validatedKeyword, userId, initialPageToken, deepSearch });

        // 5. Set status and tracker in Redis
        await redis.set(`job:${jobId}:status`, "pending", "EX", 3600);
        await redis.set(`active-job:${cacheKey}`, jobId || "pending", "EX", 60); // Tracker for concurrent requests

        return { type: "JOB", jobId };
    } finally {
        if (lockToken) await releaseLock(jobLockKey, lockToken);
    }
}
