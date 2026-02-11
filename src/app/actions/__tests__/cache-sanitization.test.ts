import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    publish: jest.fn(),
  },
}));

jest.mock("@/lib/traffic-control", () => ({
  acquireLock: jest.fn().mockResolvedValue("mock-token"),
  releaseLock: jest.fn(),
  waitForValue: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/gateway/google-places", () => ({
  googlePlacesGateway: {
    searchText: jest.fn(),
    scanCity: jest.fn(),
  },
}));

jest.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
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
  (prisma as any).$transaction = jest.fn((cb: any) => cb(prisma));
  return { prisma };
});

import { auth } from "@/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { googlePlacesGateway } from "@/lib/gateway/google-places";
import { searchPlaces } from "../search-places";

describe("Global Cache Sanitization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as any).mockResolvedValue({ user: { id: "u1" } });

    (prisma.user.findUnique as any).mockResolvedValue({
      id: "u1",
      credits: 500,
      subscriptionTier: "PRO",
    });
    (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.place.upsert as any).mockImplementation((args: any) =>
      Promise.resolve({
        id: "p1",
        googleId: args.create.googleId,
        name: args.create.name,
        emails: ["secret@biz.com"],
        emailScores: { "secret@biz.com": 88 },
        phones: [],
        socials: {},
        website: null,
        scrapeStatus: "COMPLETED",
      })
    );
    (prisma.lead.upsert as any).mockResolvedValue({ emailUnlocked: false });
    (prisma.searchCache.findUnique as any).mockResolvedValue(null);
    (redis.get as any).mockResolvedValue(null);

    (googlePlacesGateway.searchText as any).mockResolvedValue({
      places: [{ place_id: "g1", name: "Biz 1" }],
      nextPageToken: undefined,
    });
  });

  it("should not store user-specific fields or jobId in global cache", async () => {
    await searchPlaces("Istanbul", "Kebab", undefined, false);

    const setCalls = (redis.set as any).mock.calls as any[];
    const cacheCall = setCalls.find((c) => String(c[0]).startsWith("search:global:"));
    expect(cacheCall).toBeTruthy();

    const payload = String(cacheCall[1]);
    expect(payload).not.toContain("emailUnlocked");
    expect(payload).not.toContain("maskedEmails");
    expect(payload).not.toContain("emailScores");
    expect(payload).not.toContain("\"emails\"");
    expect(payload).not.toContain("\"jobId\"");
  });
});

