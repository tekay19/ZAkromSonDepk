"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PLANS, SubscriptionTier } from "@/lib/plans";

export async function getSearchHistory(limit: number = 10) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        throw new Error("Oturum açmanız gerekiyor.");
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true },
    });

    const tier = (user?.subscriptionTier as SubscriptionTier) || "FREE";
    const plan = PLANS[tier] || PLANS.FREE;

    const fromDate = new Date(Date.now() - plan.maxHistoryDays * 24 * 60 * 60 * 1000);

    return await prisma.searchHistory.findMany({
        where: {
            userId,
            createdAt: { gte: fromDate },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(limit, 50),
    });
}
