"use server";

import { getStripe } from "@/lib/stripe";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SubscriptionTier } from "@/lib/plans";

const PRICE_IDS: Record<SubscriptionTier, string> = {
    FREE: "", // Free tier has no price ID
    STARTER: process.env.STRIPE_STARTER_PRICE_ID || "price_dummy_starter",
    PRO: process.env.STRIPE_PRO_PRICE_ID || "price_dummy_pro",
    BUSINESS: process.env.STRIPE_BUSINESS_PRICE_ID || "price_dummy_business",
};

export async function createCheckoutSession(tier: SubscriptionTier) {
    const session = await auth();
    const userId = session?.user?.id || "default-user";
    const userEmail = session?.user?.email || "demo@example.com";

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const priceId = PRICE_IDS[tier];
    if (!priceId) throw new Error("Invalid tier or price ID missing");

    const stripe = getStripe();
    const stripeSession = await stripe.checkout.sessions.create({
        customer: user.stripeCustomerId || undefined,
        customer_email: user.stripeCustomerId ? undefined : userEmail,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${process.env.NEXTAUTH_URL}/dashboard?success=true`,
        cancel_url: `${process.env.NEXTAUTH_URL}/dashboard?canceled=true`,
        metadata: { userId, tier },
    });

    return { url: stripeSession.url };
}
