"use server";

import { auth } from "@/auth";
import { addExportJob } from "@/lib/queue/export-queue";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logAuditEvent } from "@/lib/auth/audit";
import { getRequestMeta } from "@/lib/auth/request-meta";

const EXPORT_COST_PER_ROW = 0; // CSV/Excel/JSON export ücretsiz (rakiplerle rekabet)
const EMAIL_UNLOCK_COST_PER_PLACE = 3;

export async function startExport(args: {
    placeIds: string[];
    format: "csv" | "xlsx" | "json";
    includeEmails?: boolean;
}) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Oturum açmanız gerekiyor.");
    const userId = session.user.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tier = (user?.subscriptionTier as SubscriptionTier) || "FREE";
    const plan = PLANS[tier] || PLANS.FREE;

    const format = args.format;
    const includeEmails = Boolean(args.includeEmails);
    const uniqueIds = Array.from(new Set(args.placeIds.filter(Boolean))).slice(0, 2000);
    if (uniqueIds.length === 0) throw new Error("Dışa aktarılacak kayıt bulunamadı.");

    {
        const { ip, userAgent } = await getRequestMeta();
        await logAuditEvent({
            userId,
            action: "EXPORT_REQUEST",
            ip,
            userAgent,
            metadata: { format, includeEmails, placeCount: uniqueIds.length, tier },
        });
    }

    if (!plan.features.export.includes(format)) {
        throw new Error(`${format.toUpperCase()} dışa aktarma işlemi ${tier} planında desteklenmiyor.`);
    }

    let unlockCost = 0;
    let lockedLeadIds: string[] = [];

    if (includeEmails) {
        if (!plan.features.emailEnrichment) {
            throw new Error("Maillerle dışa aktarma için Growth veya Business planı gerekir.");
        }
        const lockedLeads = await prisma.lead.findMany({
            where: {
                userId,
                emailUnlocked: false,
                place: { googleId: { in: uniqueIds } },
            },
            select: { id: true },
        });
        lockedLeadIds = lockedLeads.map(l => l.id);
        unlockCost = lockedLeadIds.length * EMAIL_UNLOCK_COST_PER_PLACE;
    }

    // Satır başına kredi maliyeti
    const exportCost = uniqueIds.length * EXPORT_COST_PER_ROW;
    const totalCost = exportCost + unlockCost;
    if ((user?.credits ?? 0) < totalCost) {
        throw new Error(
            `Yetersiz bakiye. Bu işlem için ${totalCost} kredi gerekiyor (Export: ${exportCost}, Mail kilidi: ${unlockCost}).`
        );
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.user.updateMany({
            where: { id: userId, credits: { gte: totalCost } },
            data: { credits: { decrement: totalCost } },
        });
        if (updated.count === 0) throw new Error("Yetersiz bakiye.");

        if (lockedLeadIds.length > 0) {
            await tx.lead.updateMany({
                where: { id: { in: lockedLeadIds } },
                data: { emailUnlocked: true, emailUnlockedAt: new Date() },
            });
        }

        await tx.creditTransaction.create({
            data: {
                userId,
                amount: -totalCost,
                type: "EXPORT",
                description: includeEmails
                    ? `${format.toUpperCase()} dışa aktarma (mailler dahil)`
                    : `${format.toUpperCase()} dışa aktarma`,
                metadata: {
                    format,
                    includeEmails,
                    placeCount: uniqueIds.length,
                    exportCost,
                    unlockCost,
                },
            },
        });
    });

    const jobId = await addExportJob({ placeIds: uniqueIds, format, userId, includeEmails });
    {
        const { ip, userAgent } = await getRequestMeta();
        await logAuditEvent({
            userId,
            action: "EXPORT_JOB_ENQUEUED",
            ip,
            userAgent,
            metadata: { jobId, format, includeEmails, placeCount: uniqueIds.length, unlockCost, exportCost: 0, totalCost },
        });
    }
    return { jobId };
}
