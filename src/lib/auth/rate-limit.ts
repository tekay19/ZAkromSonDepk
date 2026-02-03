import { redis } from "@/lib/redis";

type RateLimitState = {
    count: number;
    resetAt: number;
};

const store = new Map<string, RateLimitState>();

type RateLimitOptions = {
    limit: number;
    windowMs: number;
};

export async function rateLimit(key: string, { limit, windowMs }: RateLimitOptions) {
    if (!Number.isFinite(limit) || limit <= 0) {
        return { allowed: true, retryAfter: Math.ceil(windowMs / 1000) };
    }

    try {
        const now = Date.now();
        const currentCount = await redis.incr(key);
        if (currentCount === 1) {
            await redis.pexpire(key, windowMs);
        }
        const ttlMs = await redis.pttl(key);
        const allowed = currentCount <= limit;
        const safeTtl = ttlMs && ttlMs > 0 ? ttlMs : windowMs;
        const retryAfter = Math.max(0, Math.ceil(safeTtl / 1000));
        return { allowed, retryAfter };
    } catch {
        const now = Date.now();
        const current = store.get(key);

        if (!current || now > current.resetAt) {
            const nextState = { count: 1, resetAt: now + windowMs };
            store.set(key, nextState);
            return { allowed: true, retryAfter: Math.ceil(windowMs / 1000) };
        }

        const count = current.count + 1;
        current.count = count;
        store.set(key, current);

        const allowed = count <= limit;
        const retryAfter = Math.max(0, Math.ceil((current.resetAt - now) / 1000));
        return { allowed, retryAfter };
    }
}
