import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/queue/search-queue", () => ({
  addSearchJob: jest.fn(),
}));

jest.mock("@/lib/prisma", () => {
  const mockPrisma = {
    place: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    lead: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      createMany: jest.fn(),
    },
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
    searchCache: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  (mockPrisma as any).$transaction = jest.fn((callback: any) => callback(mockPrisma));

  return { prisma: mockPrisma };
});

jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    publish: jest.fn(),
  },
}));

jest.mock("@/lib/traffic-control", () => ({
  acquireLock: jest.fn(() => Promise.resolve("mock-token")),
  releaseLock: jest.fn(),
  waitForValue: jest.fn(),
}));

jest.mock("@/lib/gateway/google-places", () => ({
  googlePlacesGateway: {
    searchText: jest.fn(),
    scanCity: jest.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { googlePlacesGateway } from "@/lib/gateway/google-places";
import { addSearchJob } from "@/lib/queue/search-queue";
import { searchPlaces } from "../search-places";

describe("searchPlaces wrapper behavior", () => {
  const prevEnv = process.env.BACKGROUND_WORKER_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();

    (auth as any).mockResolvedValue({ user: { id: "test-user-id" } } as any);

    (prisma.user.findUnique as any).mockResolvedValue({
      id: "test-user-id",
      credits: 100,
      subscriptionTier: "PRO",
    });
    (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.searchCache.findUnique as any).mockResolvedValue(null);
    (prisma.searchCache.upsert as any).mockResolvedValue(null);

    (prisma.place.upsert as any).mockImplementation((args: any) =>
      Promise.resolve({
        id: "db-place-id",
        googleId: args.create.googleId,
        name: args.create.name,
        emails: [],
        phones: [],
        socials: {},
        website: args.create.website,
        scrapeStatus: "PENDING",
      })
    );
    (prisma.lead.upsert as any).mockResolvedValue({ emailUnlocked: false });
    (prisma.lead.createMany as any).mockResolvedValue({ count: 0 });
    (prisma.place.findMany as any).mockResolvedValue([]);
    (prisma.lead.findMany as any).mockResolvedValue([]);

    (redis.get as any).mockResolvedValue(null);

    (googlePlacesGateway.searchText as any).mockResolvedValue({
      places: [
        {
          place_id: "place-1",
          name: "Place 1",
          formatted_address: "Addr",
          formatted_phone_number: "+90",
          rating: 4.5,
          user_ratings_total: 10,
          location: { latitude: 41.0, longitude: 29.0 },
          types: ["establishment"],
        },
      ],
      nextPageToken: undefined,
    });
  });

  afterEach(() => {
    process.env.BACKGROUND_WORKER_ENABLED = prevEnv;
  });

  it("should return immediate results (no jobId) when background worker is disabled", async () => {
    delete (process.env as any).BACKGROUND_WORKER_ENABLED;

    const res = await searchPlaces("Istanbul", "Kebab", undefined, false);

    expect(res.success).toBe(true);
    expect(res.jobId).toBeUndefined();
    expect(res.data).toHaveLength(1);
  });

  it("should return cached results (no jobId) even when background worker is enabled", async () => {
    process.env.BACKGROUND_WORKER_ENABLED = "true";

    // Cache hit for the query key.
    (redis.get as any).mockResolvedValue(
      JSON.stringify({ places: [{ place_id: "place-1", name: "Place 1" }], nextPageToken: null })
    );

    const res = await searchPlaces("Istanbul", "Kebab", undefined, true);

    expect(res.success).toBe(true);
    expect(res.jobId).toBeUndefined();
    expect(res.data).toHaveLength(1);
    expect(addSearchJob).not.toHaveBeenCalled();
  });

  it("should enqueue a job (jobId set) when background worker is enabled and cache is missing", async () => {
    process.env.BACKGROUND_WORKER_ENABLED = "true";
    (redis.get as any).mockResolvedValue(null);
    (addSearchJob as any).mockResolvedValue("mock-job-id");

    const res = await searchPlaces("Istanbul", "Kebab", undefined, true);

    expect(res.success).toBe(true);
    expect(res.jobId).toBe("mock-job-id");
    expect(res.data).toEqual([]);
  });
});
