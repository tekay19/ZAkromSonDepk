import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@/lib/traffic-control", () => ({
  acquireLock: jest.fn().mockResolvedValue("mock-token"),
  releaseLock: jest.fn(),
}));

jest.mock("@/lib/queue/search-queue", () => ({
  addSearchJob: jest.fn().mockResolvedValue("job-uuid-123"),
}));

import { redis } from "@/lib/redis";
import { searchPlacesAsyncInternal } from "../search-places";

describe("Async Search Job Enqueue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redis.get as any).mockResolvedValue(null);
  });

  it("should create job status keys in Redis and return JOB", async () => {
    const res = await searchPlacesAsyncInternal("Istanbul", "Kebab", "u1", undefined, true);
    expect(res.type).toBe("JOB");
    expect(res.jobId).toBe("job-uuid-123");

    const setCalls = (redis.set as any).mock.calls as any[];
    const hasPending = setCalls.some((c) => c[0] === "job:job-uuid-123:status" && c[1] === "pending");
    expect(hasPending).toBe(true);

    const hasActiveJob = setCalls.some((c) => String(c[0]).startsWith("active-job:search:global:"));
    expect(hasActiveJob).toBe(true);
  });
});
