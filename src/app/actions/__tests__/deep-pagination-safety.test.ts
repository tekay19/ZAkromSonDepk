import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Prevent importing real NextAuth (ESM) during Jest runs.
jest.mock("@/auth", () => ({
  auth: jest.fn(),
  handlers: { GET: jest.fn(), POST: jest.fn() },
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    creditTransaction: {
      create: jest.fn(),
    },
    searchHistory: {
      create: jest.fn(),
    },
    place: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    lead: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    searchCache: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  (prisma as any).$transaction = jest.fn((cb: any) => cb(prisma));
  return { prisma };
});

jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    publish: jest.fn(),
    incr: jest.fn(),
    pexpire: jest.fn(),
    pttl: jest.fn(),
  },
}));

jest.mock("@/lib/traffic-control", () => ({
  acquireLock: jest.fn(() => Promise.resolve("mock-token")),
  releaseLock: jest.fn(),
  waitForValue: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("@/lib/gateway/google-places", () => ({
  googlePlacesGateway: {
    searchText: jest.fn(),
    scanCity: jest.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { googlePlacesGateway } from "@/lib/gateway/google-places";
import { searchPlacesInternal } from "../search-places";

function makePlaces(n: number) {
  return Array.from({ length: n }).map((_, i) => ({
    place_id: `p-${i + 1}`,
    name: `Place ${i + 1}`,
    formatted_address: `Addr ${i + 1}`,
    rating: 4.5,
    user_ratings_total: 10,
    location: { latitude: 41.0, longitude: 29.0 },
    types: ["establishment"],
  }));
}

describe("Deep Pagination Cost Safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEEP_SEARCH_PAGE_SIZE = "60";

    (prisma.user.findUnique as any).mockResolvedValue({
      id: "u1",
      credits: 100,
      subscriptionTier: "PRO",
    });
    (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.creditTransaction.create as any).mockResolvedValue(null);
    (prisma.searchCache.findUnique as any).mockResolvedValue(null);
    (prisma.searchCache.upsert as any).mockResolvedValue(null);
    (prisma.searchHistory.create as any).mockResolvedValue(null);

    (prisma.place.upsert as any).mockImplementation((args: any) =>
      Promise.resolve({
        id: `db-${args.create.googleId}`,
        googleId: args.create.googleId,
        name: args.create.name,
        emails: [],
        emailScores: {},
        phones: [],
        socials: {},
        website: args.create.website,
        scrapeStatus: "PENDING",
      })
    );
    (prisma.lead.upsert as any).mockResolvedValue({ emailUnlocked: false });

    // Used by rate limiter (we don't care about exact behavior here).
    (redis.incr as any).mockResolvedValue(1);
    (redis.pexpire as any).mockResolvedValue(1);
    (redis.pttl as any).mockResolvedValue(60_000);
  });

  it("should NOT call Google API during deep pagination, but should still charge credits when returning results", async () => {
    const city = "Istanbul";
    const keyword = "Kebab";
    const places = makePlaces(80);

    (redis.get as any).mockImplementation(async (key: string) => {
      if (key === "search:list:data:global:istanbul:kebab") return JSON.stringify({ places, pageSize: 60 });
      // Per-page cache miss (forces executeSearchCore)
      return null;
    });

    const res = await searchPlacesInternal(city, keyword, undefined, "deep:0", "u1", true);

    expect(googlePlacesGateway.searchText).toHaveBeenCalledTimes(0);
    expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
    expect((prisma.user.updateMany as any).mock.calls.length).toBeGreaterThan(0);
    expect((prisma.creditTransaction.create as any).mock.calls.length).toBeGreaterThan(0);

    expect(Array.isArray(res.places)).toBe(true);
    expect(res.places.length).toBe(60);
    expect(res.nextPageToken).toBe("deep:60");
  });

  it("should NOT call Google API and should NOT bill when deep pagination slice is empty", async () => {
    const city = "Istanbul";
    const keyword = "Kebab";
    const places = makePlaces(10);

    (redis.get as any).mockImplementation(async (key: string) => {
      if (key === "search:list:data:global:istanbul:kebab") return JSON.stringify({ places, pageSize: 60 });
      return null;
    });

    const res = await searchPlacesInternal(city, keyword, undefined, "deep:60", "u1", true);

    expect(googlePlacesGateway.searchText).toHaveBeenCalledTimes(0);
    expect((prisma as any).$transaction).toHaveBeenCalledTimes(0);
    expect((prisma.user.updateMany as any).mock.calls.length).toBe(0);
    expect((prisma.creditTransaction.create as any).mock.calls.length).toBe(0);

    expect(res.places).toEqual([]);
    expect(res.nextPageToken).toBeUndefined();
  });

  it("should NOT advertise a nextPageToken when deep cache length equals exactly one page", async () => {
    const city = "Istanbul";
    const keyword = "Kebab";
    const places = makePlaces(60);

    (redis.get as any).mockImplementation(async (key: string) => {
      if (key === "search:list:data:global:istanbul:kebab") return JSON.stringify({ places, pageSize: 60 });
      return null;
    });

    const res = await searchPlacesInternal(city, keyword, undefined, undefined, "u1", true);

    expect(googlePlacesGateway.searchText).toHaveBeenCalledTimes(0);
    expect(res.places.length).toBe(60);
    expect(res.nextPageToken).toBeUndefined();
  });
});
