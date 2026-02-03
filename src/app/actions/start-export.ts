"use server";

import { auth } from "@/auth";
import { addExportJob } from "@/lib/queue/export-queue";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export async function startExport(results: any[], format: "csv" | "xlsx") {
    const session = await auth();
    const userId = session?.user?.id || "default-user";

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tier = (user?.subscriptionTier as SubscriptionTier) || "FREE";
    const plan = PLANS[tier];

    if (!plan.features.export.includes(format)) {
        throw new Error(`${format.toUpperCase()} dışa aktarma işlemi ${tier} planında desteklenmiyor.`);
    }

    const jobId = await addExportJob({ results, format, userId });
    return { jobId };
}
