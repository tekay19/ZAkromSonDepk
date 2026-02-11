"use server";

import { auth } from "@/auth";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function createCustomerPortalSession() {
    // Mock mode — just redirect back to settings
    if (process.env.NEXT_PUBLIC_ENABLE_STRIPE_MOCK === "true") {
        return { url: "/dashboard/settings" };
    }

    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Yetkisiz erişim. Lütfen giriş yapın." };
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
    });

    if (!user?.stripeCustomerId) {
        return { error: "Abonelik bulunamadı. Lütfen önce bir plan seçin." };
    }

    try {
        const stripe = getStripe();
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${process.env.NEXTAUTH_URL}/dashboard/settings`,
        });

        return { url: portalSession.url };
    } catch (error: any) {
        console.error("Stripe Portal Error:", error);
        return { error: "Portal oturumu oluşturulamadı. Lütfen daha sonra tekrar deneyin." };
    }
}
