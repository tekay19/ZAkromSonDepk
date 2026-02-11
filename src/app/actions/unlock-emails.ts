"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { addEnrichmentJob } from "@/lib/queue/enrichment-queue";
import { randomUUID } from "crypto";
import { logAuditEvent } from "@/lib/auth/audit";
import { getRequestMeta } from "@/lib/auth/request-meta";

const EMAIL_UNLOCK_COST_PER_PLACE = 3;

export async function unlockEmails(placeIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Oturum açmanız gerekiyor.");
  }

  const userId = session.user.id;
  const uniqueIds = Array.from(new Set(placeIds.filter(Boolean))).slice(0, 200);
  if (uniqueIds.length === 0) {
    return { ok: true, unlocked: 0, cost: 0, jobId: null };
  }

  {
    const { ip, userAgent } = await getRequestMeta();
    await logAuditEvent({
      userId,
      action: "EMAIL_UNLOCK_REQUEST",
      ip,
      userAgent,
      metadata: { placeCount: uniqueIds.length },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, subscriptionTier: true },
  });
  if (!user) throw new Error("Kullanıcı bulunamadı.");

  const tier = (user.subscriptionTier as SubscriptionTier) || "FREE";
  const plan = PLANS[tier] || PLANS.FREE;

  if (!plan.features.emailEnrichment) {
    throw new Error("E-posta bulma/kurumsal mail çıkarma bu planınızda yok. Growth veya Business'a geçin.");
  }

  // Only unlock for leads that belong to this user.
  const leads = await prisma.lead.findMany({
    where: { userId, place: { googleId: { in: uniqueIds } } },
    select: {
      id: true,
      emailUnlocked: true,
      place: {
        select: {
          id: true,
          googleId: true,
          name: true,
          address: true,
          website: true,
          emails: true,
          scrapeStatus: true,
        },
      },
    },
  });

  const toUnlock = leads.filter((l) => !l.emailUnlocked);
  const cost = toUnlock.length * EMAIL_UNLOCK_COST_PER_PLACE;
  if (cost <= 0) {
    return { ok: true, unlocked: 0, cost: 0, jobId: null };
  }

  if (user.credits < cost) {
    throw new Error(`Yetersiz bakiye. Bu işlem için ${cost} kredi gerekiyor.`);
  }

  const jobId = randomUUID();
  const unlockedAt = new Date();

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
        type: "EMAIL_UNLOCK",
        description: `${toUnlock.length} işletme için e-posta kilidi açıldı`,
        metadata: {
          count: toUnlock.length,
          placeIds: uniqueIds,
          costPerPlace: EMAIL_UNLOCK_COST_PER_PLACE,
        },
      },
    });

    await tx.lead.updateMany({
      where: { id: { in: toUnlock.map((l) => l.id) } },
      data: { emailUnlocked: true, emailUnlockedAt: unlockedAt },
    });
  });

  // Enqueue enrichment only if we actually need to scrape.
  const enrichmentTargets = toUnlock
    .map((l) => l.place)
    .filter((p) => !p.emails || p.emails.length === 0)
    .filter((p) => ["PENDING", "FAILED", "SKIPPED"].includes(p.scrapeStatus));

  await Promise.all(
    enrichmentTargets.map((p) =>
      addEnrichmentJob({
        placeId: p.id,
        website: p.website || "",
        name: p.name,
        address: p.address || "",
        jobId,
      })
    )
  );

  {
    const { ip, userAgent } = await getRequestMeta();
    await logAuditEvent({
      userId,
      action: "EMAIL_UNLOCK_COMPLETED",
      ip,
      userAgent,
      metadata: { unlocked: toUnlock.length, cost, enrichmentJobs: enrichmentTargets.length, jobId },
    });
  }

  return { ok: true, unlocked: toUnlock.length, cost, jobId };
}
