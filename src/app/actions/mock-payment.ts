"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PLANS, SubscriptionTier } from "@/lib/plans";

/**
 * Mock payment handler — simulates a Stripe checkout completion.
 * Only works when NEXT_PUBLIC_ENABLE_STRIPE_MOCK=true.
 */
export async function processMockPayment(params: {
    type: "subscription" | "topup";
    tier?: SubscriptionTier;
    credits?: number;
    packId?: string;
}) {
    if (process.env.NEXT_PUBLIC_ENABLE_STRIPE_MOCK !== "true") {
        throw new Error("Mock payments are disabled.");
    }

    const session = await auth();
    if (!session?.user?.id) throw new Error("Oturum açmanız gerekiyor.");
    const userId = session.user.id;

    if (params.type === "subscription" && params.tier) {
        const plan = PLANS[params.tier];
        if (!plan || params.tier === "FREE") {
            throw new Error("Geçersiz plan.");
        }

        await prisma.$transaction(async (tx: any) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    subscriptionTier: params.tier,
                    credits: plan.credits,
                    stripeCustomerId: `mock_cus_${userId.slice(0, 8)}`,
                    stripeSubscriptionId: `mock_sub_${Date.now()}`,
                    stripePriceId: `mock_price_${params.tier?.toLowerCase()}`,
                    stripeCurrentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
            });

            await tx.creditTransaction.create({
                data: {
                    userId,
                    amount: plan.credits,
                    type: "SUBSCRIPTION_RENEWAL",
                    description: `[MOCK] ${plan.name} planına yükseltme (+${plan.credits} kredi)`,
                    metadata: {
                        mock: true,
                        tier: params.tier,
                        stripeSessionId: `mock_sess_${Date.now()}`,
                    },
                },
            });
        });

        return { success: true, redirectUrl: "/dashboard/settings?success=true" };
    }

    if (params.type === "topup" && params.credits && params.credits > 0) {
        await prisma.$transaction(async (tx: any) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    credits: { increment: params.credits! },
                    stripeCustomerId: `mock_cus_${userId.slice(0, 8)}`,
                },
            });

            await tx.creditTransaction.create({
                data: {
                    userId,
                    amount: params.credits!,
                    type: "PURCHASE",
                    description: `[MOCK] Kredi yükleme (+${params.credits})`,
                    metadata: {
                        mock: true,
                        kind: "CREDIT_TOPUP",
                        packId: params.packId,
                        credits: params.credits,
                        stripeSessionId: `mock_sess_${Date.now()}`,
                    },
                },
            });
        });

        return { success: true, redirectUrl: "/dashboard/settings?topup=success" };
    }

    throw new Error("Geçersiz ödeme parametreleri.");
}
