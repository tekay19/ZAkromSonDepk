import { redis } from "@/lib/redis";
import { withCircuitBreaker, withInflightLimiter, sleep } from "@/lib/traffic-control";
import { GridGenerator, Viewport } from "@/lib/grid-generator";

function readGoogleApiKeys(): string[] {
    const raw =
        (process.env.GOOGLE_PLACES_API_KEYS ||
            process.env.GOOGLE_API_KEYS ||
            process.env.GOOGLE_PLACES_API_KEY ||
            process.env.GOOGLE_MAPS_API_KEY ||
            "").trim();
    if (!raw) return [];
    return raw
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
}

const GOOGLE_API_KEYS = readGoogleApiKeys();
if (process.env.GOOGLE_PLACES_DEBUG_KEYS === "true" && process.env.NODE_ENV !== "production") {
    // Avoid printing full keys. Suffix is enough to confirm which env value is in use.
    const suffixes = GOOGLE_API_KEYS.map((k) => k.slice(-6));
    console.info("[GooglePlaces] API keys loaded", { count: GOOGLE_API_KEYS.length, suffixes });
}
const FETCH_TIMEOUT_MS = Number(process.env.GOOGLE_PLACES_FETCH_TIMEOUT_MS || 10000);
// Keep this conservative by default; high concurrency can spike costs and trigger quota issues.
const MAX_CONCURRENCY = Number(process.env.GOOGLE_PLACES_MAX_CONCURRENCY || 20);
const MOCK_MODE = process.env.GOOGLE_PLACES_MOCK === "1" || process.env.GOOGLE_PLACES_MOCK === "true";
const MOCK_WEBSITE_BASE = (process.env.GOOGLE_PLACES_MOCK_WEBSITE_BASE || "").trim();

export interface GatewayResponse {
    places: any[];
    nextPageToken?: string;
}

type BillingContext = {
    userId?: string;
    tier?: string;
};

class GooglePlacesGateway {
    private static instance: GooglePlacesGateway;
    private currentKeyIndex = 0;

    private constructor() { }

    public static getInstance() {
        if (!GooglePlacesGateway.instance) {
            GooglePlacesGateway.instance = new GooglePlacesGateway();
        }
        return GooglePlacesGateway.instance;
    }

    private getNextApiKey(): string {
        if (MOCK_MODE) return "mock-key";
        if (GOOGLE_API_KEYS.length === 0) throw new Error("Google API Keys configuration is missing.");
        const key = GOOGLE_API_KEYS[this.currentKeyIndex];
        this.currentKeyIndex = (this.currentKeyIndex + 1) % GOOGLE_API_KEYS.length;
        return key;
    }

    private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }
    }

    private async checkBudgets(ctx?: BillingContext) {
        if (MOCK_MODE) return;

        // Default low to protect unit economics. Override via env for production.
        const globalDailyLimit = Number(
            process.env.GOOGLE_PLACES_GLOBAL_DAILY_BUDGET_USD ??
            process.env.GOOGLE_PLACES_DAILY_BUDGET ??
            10
        ); // Default $10/day

        const globalMonthlyLimit = Number(process.env.GOOGLE_PLACES_GLOBAL_MONTHLY_BUDGET_USD || 0); // 0 = disabled

        const tier = (ctx?.tier || "").toUpperCase();
        const perUserMonthlyLimitByTier: Record<string, number> = {
            FREE: Number(process.env.GOOGLE_PLACES_MONTHLY_BUDGET_FREE_USD ?? 2),
            STARTER: Number(process.env.GOOGLE_PLACES_MONTHLY_BUDGET_STARTER_USD ?? 10),
            PRO: Number(process.env.GOOGLE_PLACES_MONTHLY_BUDGET_PRO_USD ?? 60),
            BUSINESS: Number(process.env.GOOGLE_PLACES_MONTHLY_BUDGET_BUSINESS_USD ?? 220),
        };
        const userMonthlyLimit = perUserMonthlyLimitByTier[tier] ?? 0; // 0 = disabled/unknown tier

        const date = new Date().toISOString().split("T")[0];
        const month = date.slice(0, 7); // YYYY-MM

        const globalDailyKey = `google:spend:global:day:${date}`;
        const globalMonthlyKey = `google:spend:global:month:${month}`;
        const userMonthlyKey = ctx?.userId ? `google:spend:user:${ctx.userId}:month:${month}` : null;

        const [globalDailySpendRaw, globalMonthlySpendRaw, userMonthlySpendRaw] = await Promise.all([
            redis.get(globalDailyKey),
            redis.get(globalMonthlyKey),
            userMonthlyKey ? redis.get(userMonthlyKey) : Promise.resolve(null),
        ]);

        const globalDailySpend = Number(globalDailySpendRaw || 0);
        const globalMonthlySpend = Number(globalMonthlySpendRaw || 0);
        const userMonthlySpend = Number(userMonthlySpendRaw || 0);

        if (Number.isFinite(globalDailyLimit) && globalDailyLimit > 0 && globalDailySpend >= globalDailyLimit) {
            throw new Error(
                `Günlük Google API bütçesi ($${globalDailyLimit}) aşıldı. Lütfen yarın tekrar deneyin veya limiti artırın.`
            );
        }
        if (Number.isFinite(globalMonthlyLimit) && globalMonthlyLimit > 0 && globalMonthlySpend >= globalMonthlyLimit) {
            throw new Error(
                `Bu ayki Google API bütçesi ($${globalMonthlyLimit}) aşıldı. Lütfen gelecek ay tekrar deneyin veya limiti artırın.`
            );
        }
        if (userMonthlyKey && Number.isFinite(userMonthlyLimit) && userMonthlyLimit > 0 && userMonthlySpend >= userMonthlyLimit) {
            throw new Error(
                `Bu ayki plan bazlı Google API limitinize ulaştınız ($${userMonthlyLimit}). Lütfen gelecek ay tekrar deneyin veya plan yükseltin.`
            );
        }
    }

    private async incrementSpend(cost: number, ctx?: BillingContext) {
        if (MOCK_MODE) return;
        const date = new Date().toISOString().split("T")[0];
        const month = date.slice(0, 7);

        const globalDailyKey = `google:spend:global:day:${date}`;
        const globalMonthlyKey = `google:spend:global:month:${month}`;
        const userMonthlyKey = ctx?.userId ? `google:spend:user:${ctx.userId}:month:${month}` : null;

        // Keep for ~45 days to cover month boundary + audits.
        const ttlSeconds = 60 * 60 * 24 * 45;

        const ops: Promise<any>[] = [
            redis.incrbyfloat(globalDailyKey, cost),
            redis.expire(globalDailyKey, ttlSeconds),
            redis.incrbyfloat(globalMonthlyKey, cost),
            redis.expire(globalMonthlyKey, ttlSeconds),
        ];
        if (userMonthlyKey) {
            ops.push(redis.incrbyfloat(userMonthlyKey, cost), redis.expire(userMonthlyKey, ttlSeconds));
        }
        await Promise.all(ops);
    }

    public async scanCity(
        query: string,
        viewport: Viewport,
        options: {
            gridSize?: number;
            maxPagesPerGrid?: number;
            maxApiCalls?: number;
            depth?: number;
            maxDepth?: number;
            onApiCall?: () => Promise<void>;
            onRecursion?: (info: { depth: number; cellIndex: number; cellResults: number }) => boolean | Promise<boolean>;
            apiCallCounter?: { count: number };
        } = {}
    ): Promise<any[]> {
        if (MOCK_MODE) {
            return mockScanCity(query, viewport, options);
        }

        const gridSize = options.gridSize || 3; // Default 3x3
        // If deep recursion (depth > 0), simple 2x2 grid is usually enough for sub-quadrants
        const effectiveGridSize = (options.depth || 0) > 0 ? 2 : gridSize;

        const gridPoints = GridGenerator.generateGrid(viewport, effectiveGridSize);
        const MAX_PAGES_PER_GRID = options.maxPagesPerGrid || 3;
        const MAX_API_CALLS = options.maxApiCalls || 60; // Global safety limit
        const CURRENT_DEPTH = options.depth || 0;
        const MAX_DEPTH = options.maxDepth || 0; // Default 0 (no recursion)

        let localResults: any[] = [];
        const counter = options.apiCallCounter || { count: 0 };

        console.log(`[Grid Scan] Depth: ${CURRENT_DEPTH}/${MAX_DEPTH}. Grid: ${effectiveGridSize}x${effectiveGridSize}. Viewport:`, JSON.stringify(viewport));

        for (let index = 0; index < gridPoints.length; index++) {
            // Check global safety limit if provided (covers recursion too via shared counter)
            if (MAX_API_CALLS && counter.count >= MAX_API_CALLS) break;

            const point = gridPoints[index];
            const locationBias = {
                circle: {
                    center: { latitude: point.lat, longitude: point.lng },
                    radius: point.radius
                }
            };

            let cellPlaces: any[] = [];
            let nextPageToken: string | undefined = undefined;
            let pageCount = 0;

            try {
                // 1. Scan this cell
                do {
                    if (options.onApiCall) await options.onApiCall(); // Deduct credit/track usage

                    const response: GatewayResponse = await this.searchText(query, {
                        locationBias,
                        pageToken: nextPageToken
                    });
                    counter.count++;

                    if (response.places && response.places.length > 0) {
                        cellPlaces.push(...response.places);
                    }
                    nextPageToken = response.nextPageToken;
                    pageCount++;

                    if (pageCount > 0) await sleep(500); // Politeness delay

                } while (nextPageToken && pageCount < MAX_PAGES_PER_GRID && (!MAX_API_CALLS || counter.count < MAX_API_CALLS));

                // 2. Check for Recursion Trigger (Magic Number 60)
                // If we hit 60 results, Google is likely hiding more data in this specific cell.
                // If we haven't reached max depth, divide and conquer this specific cell's viewport.
                if (cellPlaces.length >= 60 && CURRENT_DEPTH < MAX_DEPTH) {
                    console.log(`[Grid Scan] Cell ${index} hit 60 limit! Recursing to depth ${CURRENT_DEPTH + 1}...`);

                    let shouldRecurse = true;
                    if (options.onRecursion) {
                        try {
                            shouldRecurse = await options.onRecursion({
                                depth: CURRENT_DEPTH,
                                cellIndex: index,
                                cellResults: cellPlaces.length,
                            });
                        } catch {
                            shouldRecurse = false;
                        }
                    }

                    if (!shouldRecurse) {
                        localResults.push(...cellPlaces);
                        continue;
                    }

                    // Calculate sub-viewport for this point
                    // Approximation: Point radius covers the cell. We need the bounding box of this cell.
                    // GridGenerator doesn't return bounds, but we can infer: 
                    // lat span = roughly radius * 2 / 111000... 
                    // Better approach: Simply create a small box around the center point.
                    const latOffset = (viewport.northeast.lat - viewport.southwest.lat) / effectiveGridSize / 2;
                    const lngOffset = (viewport.northeast.lng - viewport.southwest.lng) / effectiveGridSize / 2;

                    const subViewport: Viewport = {
                        northeast: { lat: point.lat + latOffset, lng: point.lng + lngOffset },
                        southwest: { lat: point.lat - latOffset, lng: point.lng - lngOffset }
                    };

                    const subResults = await this.scanCity(query, subViewport, {
                        ...options,
                        gridSize: 2, // 2x2 for sub-grid
                        depth: CURRENT_DEPTH + 1,
                        apiCallCounter: counter,
                        // Pass reference to avoid duplicate counting? 
                        // Actually, options.maxApiCalls is fixed limit. 
                        // The callback handles the billing.
                    });

                    // Add subResults to localResults instead of the truncated 60
                    // But maybe some of the 60 are unique? 
                    // Safe bet: Combine cellPlaces + subResults and depend on deduplication later.
                    localResults.push(...cellPlaces, ...subResults);

                } else {
                    localResults.push(...cellPlaces);
                }

            } catch (e) {
                console.error(`[Grid Scan] Error at depth ${CURRENT_DEPTH}:`, e);
            }
        }

        // Deduplicate local results
        const uniquePlaces = new Map();
        localResults.forEach(p => uniquePlaces.set(p.place_id, p));
        return Array.from(uniquePlaces.values());
    }

    public async searchText(
        query: string,
        options: { pageToken?: string; pageSize?: number; locationBias?: any; billing?: BillingContext } = {}
    ): Promise<GatewayResponse> {
        if (MOCK_MODE) {
            return mockSearchText(query, options);
        }

        // Check budget before making the call
        await this.checkBudgets(options.billing);

        const url = "https://places.googleapis.com/v1/places:searchText";
        const fieldMask = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.businessStatus,places.location,places.viewport,places.photos,places.types,nextPageToken";

        // Estimated cost per call (USD). Default matches our profitability analysis; override via env if pricing changes.
        const raw = Number(process.env.GOOGLE_PLACES_ESTIMATED_COST_PER_CALL_USD ?? 0.017);
        const ESTIMATED_COST_PER_CALL = Number.isFinite(raw) && raw > 0 ? raw : 0.017;

        return withCircuitBreaker("google-places", { resetTimeoutSec: 60 }, async () => {
            return withInflightLimiter("google-places:inflight", MAX_CONCURRENCY, 30, async () => {
                let attempt = 0;
                const maxAttempts = 3;

                while (attempt < maxAttempts) {
                    const apiKey = this.getNextApiKey();
                    try {
                        const body: any = {
                            textQuery: query,
                            languageCode: "tr",
                            pageSize: options.pageSize || 20,
                            pageToken: options.pageToken,
                        };

                        if (options.locationBias) {
                            body.locationBias = options.locationBias;
                        }

                        const response = await this.fetchWithTimeout(
                            url,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "X-Goog-Api-Key": apiKey,
                                    "X-Goog-FieldMask": fieldMask,
                                },
                                body: JSON.stringify(body),
                            },
                            FETCH_TIMEOUT_MS
                        );

                        if (!response.ok) {
                            const errorText = await response.text();
                            // Handle Quota Errors specifically
                            if (response.status === 429) {
                                console.error("Google API Quota Exceeded:", errorText);
                                throw new Error("Google API kotası aşıldı. Lütfen daha sonra tekrar deneyin.");
                            }

                            const isRetryable = [500, 502, 503, 504].includes(response.status);

                            if (isRetryable && attempt < maxAttempts - 1) {
                                const backoff = Math.min(1000 * 2 ** attempt, 4000);
                                await sleep(backoff);
                                attempt++;
                                continue;
                            }
                            throw new Error(`Google Places API Error: ${response.status} - ${errorText}`);
                        }

                        const data = await response.json();

                        // Track spend on success
                        await this.incrementSpend(ESTIMATED_COST_PER_CALL, options.billing);

                        return {
                            places: (data.places || []).map(this.transformPlace),
                            nextPageToken: data.nextPageToken
                        };
                    } catch (error: any) {
                        if (error.name === 'AbortError' && attempt < maxAttempts - 1) {
                            attempt++;
                            continue;
                        }
                        throw error;
                    }
                }
                throw new Error("Google Places API: Max retries exceeded.");
            });
        });
    }

    private transformPlace(place: any) {
        return {
            place_id: place.id,
            name: place.displayName?.text || "",
            rating: place.rating,
            user_ratings_total: place.userRatingCount,
            formatted_address: place.formattedAddress,
            formatted_phone_number: place.nationalPhoneNumber,
            website: place.websiteUri,
            business_status: place.businessStatus,
            location: place.location,
            viewport: place.viewport,
            photos: place.photos || [],
            types: place.types || [],
            opening_hours: {
                open_now: place.regularOpeningHours?.openNow
            }
        };
    }
}

export const googlePlacesGateway = GooglePlacesGateway.getInstance();

function hashToSeed(value: string) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
        a += 0x6D2B79F5;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function resolveMockCenter(query: string, options: { locationBias?: any }) {
    const q = (query || "").toLowerCase();
    const circle = options.locationBias?.circle;
    if (circle?.center?.latitude && circle?.center?.longitude) {
        return { lat: Number(circle.center.latitude), lng: Number(circle.center.longitude) };
    }

    if (q.includes("istanbul")) return { lat: 41.0082, lng: 28.9784 };
    if (q.includes("ankara")) return { lat: 39.9334, lng: 32.8597 };
    if (q.includes("izmir") || q.includes("i̇zmir")) return { lat: 38.4237, lng: 27.1428 };
    if (q.includes("london")) return { lat: 51.5074, lng: -0.1278 };
    if (q.includes("new york")) return { lat: 40.7128, lng: -74.0060 };

    return { lat: 39.0, lng: 35.0 };
}

function isCityViewportProbe(query: string, options: { pageSize?: number }) {
    // Deep search probes the "city" only with pageSize 1, and it is usually not "keyword in city".
    return (options.pageSize !== undefined && options.pageSize <= 5) && !query.toLowerCase().includes(" in ");
}

function mockSearchText(query: string, options: { pageToken?: string; pageSize?: number; locationBias?: any }): GatewayResponse {
    const pageSize = clamp(options.pageSize || 20, 1, 20);

    // City viewport probe for deep search.
    if (isCityViewportProbe(query, options)) {
        const center = resolveMockCenter(query, options);
        const viewport = {
            northeast: { latitude: center.lat + 0.35, longitude: center.lng + 0.55 },
            southwest: { latitude: center.lat - 0.35, longitude: center.lng - 0.55 },
        };

        return {
            places: [
                {
                    place_id: `mock_city_${hashToSeed(query)}`,
                    name: query,
                    formatted_address: `${query} (Mock)`,
                    location: { latitude: center.lat, longitude: center.lng },
                    viewport,
                    rating: 4.2,
                    user_ratings_total: 999,
                    business_status: "OPERATIONAL",
                    photos: [],
                    opening_hours: { open_now: true },
                },
            ],
        };
    }

    const seed = hashToSeed(`${query}|${options.pageToken || ""}|${JSON.stringify(options.locationBias || {})}`);
    const rand = mulberry32(seed);
    const center = resolveMockCenter(query, options);

    // Keep it realistic: Google often caps at ~60 results for text search.
    const total = 60;

    let page = 1;
    const tok = options.pageToken || "";
    const match = tok.match(/mock:([^:]+):p(\d+)/);
    if (match) {
        const p = Number(match[2]);
        if (Number.isFinite(p) && p > 0) page = p;
    }

    const start = (page - 1) * 20;
    const end = Math.min(total, start + 20);
    const places = [];

    for (let i = start; i < end; i++) {
        const id = `mock_${hashToSeed(query)}_${i}`;
        const jitterLat = (rand() - 0.5) * 0.18;
        const jitterLng = (rand() - 0.5) * 0.26;

        const rating = Math.round((3.2 + rand() * 1.7) * 10) / 10;
        const reviews = Math.floor(10 + rand() * 900);
        const hasWebsite = rand() > 0.45;
        const hasPhone = rand() > 0.25;

        const websiteBase = MOCK_WEBSITE_BASE || "https://iana.org";
        const website = hasWebsite ? `${websiteBase.replace(/\/$/, "")}/biz/${encodeURIComponent(id)}` : undefined;

        places.push({
            place_id: id,
            name: `${query} • İşletme ${i + 1}`,
            formatted_address: `Mock Address ${i + 1}`,
            nationalPhoneNumber: hasPhone ? `+90 212 ${Math.floor(1000000 + rand() * 8999999)}` : undefined,
            formatted_phone_number: hasPhone ? `+90 212 ${Math.floor(1000000 + rand() * 8999999)}` : undefined,
            websiteUri: website,
            website,
            rating,
            userRatingCount: reviews,
            user_ratings_total: reviews,
            businessStatus: "OPERATIONAL",
            business_status: "OPERATIONAL",
            location: { latitude: center.lat + jitterLat, longitude: center.lng + jitterLng },
            viewport: undefined,
            photos: [],
            types: ["point_of_interest", "establishment"],
            opening_hours: { open_now: rand() > 0.4 },
        });
    }

    const nextPageToken = end < total ? `mock:${hashToSeed(query)}:p${page + 1}` : undefined;
    return { places, nextPageToken };
}

function mockScanCity(query: string, viewport: Viewport, options: { gridSize?: number; maxPagesPerGrid?: number; depth?: number; maxDepth?: number; onApiCall?: () => Promise<void> } = {}): Promise<any[]> {
    const gridSize = Math.max(1, Math.min(12, options.gridSize || 5));
    const maxPagesPerGrid = Math.max(1, Math.min(10, options.maxPagesPerGrid || 3));
    const perPage = 20;
    const desired = Math.min(2000, gridSize * gridSize * maxPagesPerGrid * perPage);

    const centerLat = (viewport.northeast.lat + viewport.southwest.lat) / 2;
    const centerLng = (viewport.northeast.lng + viewport.southwest.lng) / 2;

    const seed = hashToSeed(`${query}|scan|${centerLat.toFixed(4)},${centerLng.toFixed(4)}|${gridSize}|${maxPagesPerGrid}`);
    const rand = mulberry32(seed);

    const websiteBase = MOCK_WEBSITE_BASE || "https://iana.org";

    const places = [];
    for (let i = 0; i < desired; i++) {
        const id = `mock_deep_${hashToSeed(query)}_${i}`;
        const latSpan = Math.abs(viewport.northeast.lat - viewport.southwest.lat) || 1;
        const lngSpan = Math.abs(viewport.northeast.lng - viewport.southwest.lng) || 1;
        const lat = viewport.southwest.lat + rand() * latSpan;
        const lng = viewport.southwest.lng + rand() * lngSpan;

        const rating = Math.round((3.0 + rand() * 2.0) * 10) / 10;
        const reviews = Math.floor(5 + rand() * 2500);
        const hasWebsite = rand() > 0.5;
        const website = hasWebsite ? `${websiteBase.replace(/\/$/, "")}/biz/${encodeURIComponent(id)}` : undefined;

        places.push({
            place_id: id,
            name: `${query} • Deep ${i + 1}`,
            formatted_address: `Deep Mock Address ${i + 1}`,
            website,
            rating,
            user_ratings_total: reviews,
            business_status: "OPERATIONAL",
            location: { latitude: lat, longitude: lng },
            photos: [],
            opening_hours: { open_now: rand() > 0.5 },
            types: ["point_of_interest", "establishment"],
        });
    }

    return Promise.resolve(places);
}
