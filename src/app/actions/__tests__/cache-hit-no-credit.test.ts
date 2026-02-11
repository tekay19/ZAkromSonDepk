import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      updateMany: jest.fn(),
    },
    creditTransaction: {
      create: jest.fn(),
    },
    place: {
      findMany: jest.fn(),
    },
    lead: {
      findMany: jest.fn(),
      createMany: jest.fn(),
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
import { searchPlacesInternal } from "../search-places";

describe("Cache Hit Should Not Spend Credits", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redis.get as any).mockResolvedValue(
      JSON.stringify({
        places: [{ place_id: "g1", name: "Biz 1" }],
        nextPageToken: null,
        jobId: "should-be-stripped",
      })
    );
    (prisma.searchCache.findUnique as any).mockResolvedValue(null);
    (prisma.place.findMany as any).mockResolvedValue([]);
    (prisma.lead.findMany as any).mockResolvedValue([]);
    (prisma.lead.createMany as any).mockResolvedValue({ count: 0 });
  });

  it("should not decrement credits or create credit transactions on cache hit", async () => {
    const res = await searchPlacesInternal("Istanbul", "Kebab", undefined, undefined, "u1", false);
    expect(res).toBeTruthy();
    expect((prisma.user.updateMany as any).mock.calls.length).toBe(0);
    expect((prisma.creditTransaction.create as any).mock.calls.length).toBe(0);
    expect(res.jobId).toBeUndefined();
  });
});
