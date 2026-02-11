"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { addVisualExportJob } from "@/lib/queue/visual-export-queue";
import { CREDIT_COSTS } from "@/lib/constants/pricing";
import { logAuditEvent } from "@/lib/auth/audit";
import { getRequestMeta } from "@/lib/auth/request-meta";

export async function startVisualExport(args: { placeIds: string[]; format: "png" | "pdf" }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum açmanız gerekiyor.");
  const userId = session.user.id;

  const uniqueIds = Array.from(new Set((args.placeIds || []).filter(Boolean))).slice(0, 3000);
  if (uniqueIds.length === 0) throw new Error("Harita export için en az 1 kayıt gerekli.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, credits: true },
  });

  const tier = (user?.subscriptionTier as SubscriptionTier) || "FREE";
  const plan = PLANS[tier] || PLANS.FREE;

  const format = args.format;
  const visual = plan.features.visualExport;

  {
    const { ip, userAgent } = await getRequestMeta();
    await logAuditEvent({
      userId,
      action: "VISUAL_EXPORT_REQUEST",
      ip,
      userAgent,
      metadata: { format, placeCount: uniqueIds.length, tier },
    });
  }

  if (!visual || visual.monthlyLimit <= 0 || !visual.formats.includes(format)) {
    throw new Error("Harita (PNG/PDF) export bu planınızda yok. Growth veya Business'a geçin.");
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usedThisMonth = await prisma.creditTransaction.count({
    where: {
      userId,
      type: "VISUAL_EXPORT",
      createdAt: { gte: startOfMonth },
    },
  });

  if (usedThisMonth >= visual.monthlyLimit) {
    throw new Error(`Bu ayki harita export limitine ulaştınız (${usedThisMonth}/${visual.monthlyLimit}).`);
  }

  const cost = format === "png" ? CREDIT_COSTS.EXPORT_PNG : CREDIT_COSTS.EXPORT_PDF;
  if ((user?.credits ?? 0) < cost) {
    throw new Error(`Yetersiz bakiye. Bu işlem için ${cost} kredi gerekiyor.`);
  }

  await prisma.$transaction(async (tx: any) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, credits: { gte: cost } },
      data: { credits: { decrement: cost } },
    });
    if (updated.count === 0) throw new Error("Yetersiz bakiye.");

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -cost,
        type: "VISUAL_EXPORT",
        description: `Heatmap export (${format.toUpperCase()})`,
        metadata: {
          placeCount: uniqueIds.length,
          format,
          cost,
          limit: visual.monthlyLimit,
        },
      },
    });
  });

  const jobId = await addVisualExportJob({ placeIds: uniqueIds, format, userId });
  {
    const { ip, userAgent } = await getRequestMeta();
    await logAuditEvent({
      userId,
      action: "VISUAL_EXPORT_JOB_ENQUEUED",
      ip,
      userAgent,
      metadata: { jobId, format, placeCount: uniqueIds.length, cost },
    });
  }
  return { jobId, used: usedThisMonth + 1, limit: visual.monthlyLimit };
}
