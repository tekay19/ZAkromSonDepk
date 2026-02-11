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
    // Mock mode — skip Stripe entirely
    if (process.env.NEXT_PUBLIC_ENABLE_STRIPE_MOCK === "true") {
        return { url: `/checkout/mock?tier=${tier}` };
    }

    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
        throw new Error("Ödeme başlatmak için giriş yapmanız gerekiyor.");
    }
    const userId = session.user.id;
    const userEmail = session.user.email;

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
        success_url: `${process.env.NEXTAUTH_URL}/dashboard/settings?success=true`,
        cancel_url: `${process.env.NEXTAUTH_URL}/dashboard/settings?canceled=true`,
        metadata: { userId, tier },
    });

    return { url: stripeSession.url };
}
