import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const prevEnv = { ...process.env };

jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn(),
    incrbyfloat: jest.fn(),
    expire: jest.fn(),
  },
}));

jest.mock("@/lib/traffic-control", () => ({
  withCircuitBreaker: jest.fn(async (_name: any, _cfg: any, work: any) => work()),
  withInflightLimiter: jest.fn(async (_name: any, _max: any, _ttl: any, work: any) => work()),
  sleep: jest.fn(),
}));

import { redis } from "@/lib/redis";
import { googlePlacesGateway } from "@/lib/gateway/google-places";

describe("Google Places budget guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...prevEnv };
    process.env.GOOGLE_PLACES_MOCK = "false";
    process.env.GOOGLE_PLACES_API_KEYS = "k1";
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it("blocks calls when global daily budget is exceeded (before fetch)", async () => {
    process.env.GOOGLE_PLACES_GLOBAL_DAILY_BUDGET_USD = "1";

    // Simulate spend already above the daily limit.
    (redis.get as any).mockImplementation(async (key: string) => {
      if (key.startsWith("google:spend:global:day:")) return "5";
      if (key.startsWith("google:spend:global:month:")) return "0";
      if (key.startsWith("google:spend:user:")) return "0";
      return "0";
    });

    const fetchSpy = jest.spyOn(globalThis as any, "fetch").mockImplementation(async () => {
      throw new Error("fetch should not be called");
    });

    await expect(
      googlePlacesGateway.searchText("kebab", { billing: { userId: "u1", tier: "BUSINESS" } })
    ).rejects.toThrow(/Günlük Google API bütçesi/);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

