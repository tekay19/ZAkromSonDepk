"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export interface CreditHistoryItem {
    id: string;
    amount: number;
    type: string;
    description: string | null;
    metadata: any;
    createdAt: Date;
}

export async function getCreditHistory(limit: number = 50): Promise<CreditHistoryItem[]> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Oturum açmanız gerekiyor.");
    }

    const transactions = await prisma.creditTransaction.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: Math.min(limit, 100),
        select: {
            id: true,
            amount: true,
            type: true,
            description: true,
            metadata: true,
            createdAt: true
        }
    });

    return transactions;
}

export async function getCreditSummary() {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Oturum açmanız gerekiyor.");
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { credits: true, subscriptionTier: true }
    });

    if (!user) throw new Error("Kullanıcı bulunamadı.");

    // Get usage stats for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await prisma.creditTransaction.aggregate({
        where: {
            userId: session.user.id,
            createdAt: { gte: startOfMonth },
            amount: { lt: 0 }
        },
        _sum: { amount: true },
        _count: { id: true }
    });

    // Get usage by type
    const usageByType = await prisma.creditTransaction.groupBy({
        by: ["type"],
        where: {
            userId: session.user.id,
            createdAt: { gte: startOfMonth },
            amount: { lt: 0 }
        },
        _sum: { amount: true },
        _count: { id: true }
    });

    return {
        currentCredits: user.credits,
        subscriptionTier: user.subscriptionTier,
        monthlyUsage: {
            totalSpent: Math.abs(monthlyUsage._sum.amount || 0),
            transactionCount: monthlyUsage._count.id
        },
        usageByType: usageByType.map(t => ({
            type: t.type,
            spent: Math.abs(t._sum.amount || 0),
            count: t._count.id
        }))
    };
}
