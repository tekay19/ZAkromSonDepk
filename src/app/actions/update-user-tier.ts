"use server";

import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import { revalidatePath } from "next/cache";

export async function updateUserTier(userId: string, tier: string) {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                subscriptionTier: tier,
                // Top up credits based on the plan definition
                credits: (PLANS[tier as keyof typeof PLANS] || PLANS.FREE).credits
            }
        });
        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Failed to update user tier:", error);
        return { success: false, error: "Tier güncelleme hatası." };
    }
}
