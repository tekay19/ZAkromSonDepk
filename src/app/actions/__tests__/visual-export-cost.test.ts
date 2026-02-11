import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/queue/visual-export-queue", () => ({
  addVisualExportJob: jest.fn().mockResolvedValue("visual-job-1"),
}));

jest.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    creditTransaction: {
      count: jest.fn(),
      create: jest.fn(),
    },
  };
  (prisma as any).$transaction = jest.fn((cb: any) => cb(prisma));
  return { prisma };
});

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addVisualExportJob } from "@/lib/queue/visual-export-queue";
import { startVisualExport } from "../start-visual-export";

describe("Visual Export Credit Cost", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (prisma.creditTransaction.count as any).mockResolvedValue(0);
    (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
  });

  it("should decrement credits for PNG export and enqueue job", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      subscriptionTier: "PRO",
      credits: 10,
    });

    const res = await startVisualExport({ placeIds: ["g1", "g2"], format: "png" });
    expect(res.jobId).toBe("visual-job-1");
    expect(addVisualExportJob).toHaveBeenCalled();

    const txCalls = (prisma.creditTransaction.create as any).mock.calls;
    expect(txCalls.length).toBe(1);
    expect(txCalls[0][0].data.amount).toBe(-3);
    expect(txCalls[0][0].data.type).toBe("VISUAL_EXPORT");
  });

  it("should fail when credits are insufficient", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      subscriptionTier: "PRO",
      credits: 0,
    });

    await expect(startVisualExport({ placeIds: ["g1"], format: "png" })).rejects.toThrow(
      /Yetersiz bakiye/
    );
  });
});

