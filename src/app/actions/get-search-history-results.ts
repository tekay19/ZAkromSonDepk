"use server";

import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { maskEmail } from "@/lib/masking";
import { buildGlobalSearchCacheKey, normalizeSearchInput } from "@/lib/search/cache-key";

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

/**
 * Cache'den önceki arama sonuçlarını getirir.
 * Kredi DÜŞMEZ - sadece mevcut cache okunur.
 */
async function hydratePlacesForUser(userId: string, places: any[]) {
    if (!userId) return places;
    if (!Array.isArray(places) || places.length === 0) return places;

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

export async function getSearchHistoryResults(historyId: string) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        throw new Error("Oturum açmanız gerekiyor.");
    }

    // 1. Get history record
    const history = await prisma.searchHistory.findUnique({
        where: { id: historyId },
    });

    if (!history) {
        throw new Error("Arama kaydı bulunamadı.");
    }

    if (history.userId !== userId) {
        throw new Error("Bu aramaya erişim yetkiniz yok.");
    }

    // 2. Build candidate cache keys
    const normalizedCity = normalizeSearchInput(history.city);
    const normalizedKeyword = normalizeSearchInput(history.keyword);

    console.log(`[GetHistoryResults] ID: ${historyId}, User: ${userId}`);
    console.log(`[GetHistoryResults] Query: ${normalizedKeyword} in ${normalizedCity}`);

    // Try both deep and std modes, global and legacy user-specific keys
    const candidates = [
        buildGlobalSearchCacheKey({ normalizedCity, normalizedKeyword, deepSearch: true }),
        buildGlobalSearchCacheKey({ normalizedCity, normalizedKeyword, deepSearch: false }),
        // Fallback for older global keys
        `search:global:${normalizedCity}:${normalizedKeyword}:deep:p1`,
        `search:global:${normalizedCity}:${normalizedKeyword}:std:p1`,
        // Fallback for legacy user-specific keys
        `search:${userId}:${normalizedCity}:${normalizedKeyword}:deep:p1`,
        `search:${userId}:${normalizedCity}:${normalizedKeyword}:std:p1`,
    ];

    const uniqueCandidates = Array.from(new Set(candidates));

    for (const cacheKey of uniqueCandidates) {
        console.log(`[GetHistoryResults] Checking key: ${cacheKey}`);

        // 3. Try Redis cache first
        const cachedResults = await redis.get(cacheKey);
        if (cachedResults) {
            console.log(`[GetHistoryResults] Found in Redis: ${cacheKey}`);
            const parsed = JSON.parse(cachedResults);
            parsed.places = await hydratePlacesForUser(userId, parsed.places || []);
            return {
                success: true,
                fromCache: true,
                city: history.city,
                keyword: history.keyword,
                isDeep: cacheKey.includes(":deep:"),
                results: parsed,
            };
        }

        // 4. Try DB cache fallback
        const dbCache = await prisma.searchCache.findUnique({
            where: { queryKey: cacheKey },
        });

        if (dbCache) {
            const isExpired = dbCache.expiresAt <= new Date();
            console.log(`[GetHistoryResults] Found in DB: ${cacheKey}, Expired: ${isExpired}`);

            if (!isExpired) {
                const parsed = dbCache.results as any;
                parsed.places = await hydratePlacesForUser(userId, parsed.places || []);

                // Refresh Redis cache
                const ttlSeconds = Math.max(1, Math.floor((dbCache.expiresAt.getTime() - Date.now()) / 1000));
                await redis.set(cacheKey, JSON.stringify(dbCache.results), "EX", ttlSeconds);

                return {
                    success: true,
                    fromCache: true,
                    city: history.city,
                    keyword: history.keyword,
                    isDeep: cacheKey.includes(":deep:"),
                    results: parsed,
                };
            }
        }
    }
    console.warn(`[GetHistoryResults] No valid cache found for ${historyId}`);

    // 5. Cache expired / not found - need to re-search
    return {
        success: false,
        expired: true,
        city: history.city,
        keyword: history.keyword,
        isDeep: false,
        message: "Arama cache'i süresi dolmuş. Yeniden arama yapmanız gerekiyor.",
    };
}
