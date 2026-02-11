import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/queue/export-queue", () => ({
  addExportJob: jest.fn().mockResolvedValue("export-job-1"),
}));

jest.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    lead: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    creditTransaction: {
      create: jest.fn(),
    },
  };
  (prisma as any).$transaction = jest.fn((cb: any) => cb(prisma));
  return { prisma };
});

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addExportJob } from "@/lib/queue/export-queue";
import { startExport } from "../start-export";

describe("Export Is Free But Email Unlock Is Charged", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
  });

  it("should charge only unlockCost when includeEmails=true", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "u1",
      subscriptionTier: "PRO",
      credits: 100,
    });
    // 2 locked leads => 2 * 3 = 6 credits
    (prisma.lead.findMany as any).mockResolvedValue([{ id: "l1" }, { id: "l2" }]);

    const res = await startExport({ placeIds: ["g1", "g2"], format: "csv", includeEmails: true });
    expect(res.jobId).toBe("export-job-1");
    expect(addExportJob).toHaveBeenCalled();

    const tx = (prisma.creditTransaction.create as any).mock.calls[0][0].data;
    expect(tx.amount).toBe(-6);
    expect(tx.type).toBe("EXPORT");
    expect(tx.metadata.unlockCost).toBe(6);
    expect(tx.metadata.exportCost).toBe(0);
  });
});

