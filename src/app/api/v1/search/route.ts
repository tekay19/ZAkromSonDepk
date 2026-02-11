import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { searchPlacesInternal } from "@/app/actions/search-places";
import { createHash } from "crypto";
import { z } from "zod";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getRequestMeta } from "@/lib/auth/request-meta";
import { buildGlobalSearchCacheKey, normalizeSearchInput } from "@/lib/search/cache-key";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  city: z.string().trim().min(2).max(100),
  keyword: z.string().trim().min(2).max(100),
  deepSearch: z.boolean().optional().default(false),
  pageToken: z.string().trim().optional(),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return NextResponse.json({ ok: false, message: "Missing Authorization: Bearer <apiKey>" }, { status: 401 });
  }

  const apiKey = match[1].trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, message: "Invalid API key" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { apiKeyHash: hashToken(apiKey) },
    select: { id: true, subscriptionTier: true, credits: true },
  });
  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const tier = (user.subscriptionTier as SubscriptionTier) || "FREE";
  const plan = PLANS[tier] || PLANS.FREE;
  if (!plan.features.apiAccess) {
    return NextResponse.json({ ok: false, message: "API access requires Business plan" }, { status: 403 });
  }

  // Rate-limit API usage to avoid burst abuse even on paid tiers.
  // Credits + Google daily budget are the main safety nets; this is an additional guard.
  const apiRpm = Number(process.env.API_V1_SEARCH_RPM || 120);
  const rl = await rateLimit(`rl:api:v1:search:user:${user.id}`, { limit: apiRpm, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many requests. Please retry shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const meta = await getRequestMeta();
  if (meta.ip) {
    const ipRl = await rateLimit(`rl:api:v1:search:ip:${meta.ip}`, { limit: apiRpm * 2, windowMs: 60_000 });
    if (!ipRl.allowed) {
      return NextResponse.json(
        { ok: false, message: "Too many requests. Please retry shortly." },
        { status: 429, headers: { "Retry-After": String(ipRl.retryAfter) } }
      );
    }
  }

  try {
    // API usage metering:
    // - Cache hits (Redis/DB) do not trigger external Google spend, but can be abused at high volume.
    // - We charge a small credit fee on cache hits for Business API to align usage with billing.
    const cacheHitCost = Math.max(0, Number(process.env.API_V1_CACHE_HIT_COST_CREDITS ?? 1));

    const normalizedCity = normalizeSearchInput(parsed.data.city);
    const normalizedKeyword = normalizeSearchInput(parsed.data.keyword);
    const cacheKey = buildGlobalSearchCacheKey({
      normalizedCity,
      normalizedKeyword,
      deepSearch: parsed.data.deepSearch,
      pageToken: parsed.data.pageToken,
    });

    let isCacheHit = false;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        isCacheHit = true;
      } else {
        const dbCache = await prisma.searchCache.findUnique({ where: { queryKey: cacheKey }, select: { expiresAt: true } });
        if (dbCache && dbCache.expiresAt > new Date()) isCacheHit = true;
      }
    } catch {
      // If cache backend is unavailable, treat as miss (fallback billing remains in searchPlacesInternal on miss).
      isCacheHit = false;
    }

    if (isCacheHit && cacheHitCost > 0) {
      if ((user.credits ?? 0) < cacheHitCost) {
        return NextResponse.json(
          { ok: false, message: `Insufficient credits. This request requires ${cacheHitCost} credits.` },
          { status: 402 }
        );
      }

      await prisma.$transaction(async (tx: any) => {
        const updated = await tx.user.updateMany({
          where: { id: user.id, credits: { gte: cacheHitCost } },
          data: { credits: { decrement: cacheHitCost } },
        });
        if (updated.count === 0) throw new Error("Insufficient credits");

        await tx.creditTransaction.create({
          data: {
            userId: user.id,
            amount: -cacheHitCost,
            type: "API_CACHE_HIT",
            description: "API v1 search (cache hit)",
            metadata: {
              cacheKey,
              city: normalizedCity,
              keyword: normalizedKeyword,
              deepSearch: parsed.data.deepSearch,
              pageToken: parsed.data.pageToken || null,
              cost: cacheHitCost,
            },
          },
        });
      });
    }

    const res = await searchPlacesInternal(
      parsed.data.city,
      parsed.data.keyword,
      undefined,
      parsed.data.pageToken,
      user.id,
      parsed.data.deepSearch
    );

    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "Search failed" }, { status: 500 });
  }
}
