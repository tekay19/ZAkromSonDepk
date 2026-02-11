import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn(),
  },
}));

jest.mock("@/lib/auth/rate-limit", () => ({
  rateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
}));

jest.mock("@/lib/auth/request-meta", () => ({
  getRequestMeta: jest.fn(async () => ({ ip: null, userAgent: null })),
}));

jest.mock("@/app/actions/search-places", () => ({
  searchPlacesInternal: jest.fn(async () => ({ places: [{ place_id: "p1", name: "Place 1" }], nextPageToken: null })),
}));

jest.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    creditTransaction: {
      create: jest.fn(),
    },
    searchCache: {
      findUnique: jest.fn(),
    },
  };
  (prisma as any).$transaction = jest.fn((cb: any) => cb(prisma));
  return { prisma };
});

import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { searchPlacesInternal } from "@/app/actions/search-places";
import { POST } from "../route";

describe("POST /api/v1/search metering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_V1_CACHE_HIT_COST_CREDITS = "1";
    (prisma.user.findFirst as any).mockResolvedValue({
      id: "u1",
      subscriptionTier: "BUSINESS",
      credits: 10,
    });
    (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.creditTransaction.create as any).mockResolvedValue(null);
    (prisma.searchCache.findUnique as any).mockResolvedValue(null);
  });

  it("charges credits on cache hit before calling searchPlacesInternal", async () => {
    (redis.get as any).mockResolvedValue(JSON.stringify({ places: [{ place_id: "p1" }], nextPageToken: null }));

    const req = new Request("http://localhost/api/v1/search", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({ city: "Istanbul", keyword: "Kebab", deepSearch: false }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).toHaveBeenCalled();
    expect(prisma.creditTransaction.create).toHaveBeenCalled();
    expect(searchPlacesInternal).toHaveBeenCalled();
  });

  it("does not charge credits when cache miss (billing happens inside searchPlacesInternal)", async () => {
    (redis.get as any).mockResolvedValue(null);
    (prisma.searchCache.findUnique as any).mockResolvedValue(null);

    const req = new Request("http://localhost/api/v1/search", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({ city: "Istanbul", keyword: "Kebab", deepSearch: false }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    expect((prisma as any).$transaction).toHaveBeenCalledTimes(0);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.creditTransaction.create).not.toHaveBeenCalled();
    expect(searchPlacesInternal).toHaveBeenCalled();
  });

  it("returns 402 when cache hit cost cannot be paid", async () => {
    (prisma.user.findFirst as any).mockResolvedValue({
      id: "u1",
      subscriptionTier: "BUSINESS",
      credits: 0,
    });
    (redis.get as any).mockResolvedValue(JSON.stringify({ places: [{ place_id: "p1" }], nextPageToken: null }));

    const req = new Request("http://localhost/api/v1/search", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({ city: "Istanbul", keyword: "Kebab", deepSearch: false }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(402);
    expect(searchPlacesInternal).not.toHaveBeenCalled();
  });
});

