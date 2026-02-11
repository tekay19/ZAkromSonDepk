"use server";

import { auth } from "@/auth";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

type CreditPackId = "pack_1000" | "pack_5000" | "pack_20000";

const CREDIT_PACKS: Record<CreditPackId, { credits: number; priceIdEnv: string }> = {
  pack_1000: { credits: 1000, priceIdEnv: "STRIPE_TOPUP_1000_PRICE_ID" },
  pack_5000: { credits: 5000, priceIdEnv: "STRIPE_TOPUP_5000_PRICE_ID" },
  pack_20000: { credits: 20000, priceIdEnv: "STRIPE_TOPUP_20000_PRICE_ID" },
};

export async function createTopupCheckoutSession(packId: CreditPackId) {
  // Mock mode — skip Stripe entirely
  if (process.env.NEXT_PUBLIC_ENABLE_STRIPE_MOCK === "true") {
    const pack = CREDIT_PACKS[packId];
    if (!pack) throw new Error("Geçersiz kredi paketi.");
    return { url: `/checkout/mock?packId=${packId}&credits=${pack.credits}` };
  }

  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new Error("Kredi yüklemek için giriş yapmanız gerekiyor.");
  }

  const userId = session.user.id;
  const userEmail = session.user.email;

  const pack = CREDIT_PACKS[packId];
  if (!pack) throw new Error("Geçersiz kredi paketi.");

  const priceId = (process.env[pack.priceIdEnv] || "").trim();
  if (!priceId || priceId.startsWith("price_dummy")) {
    throw new Error(`${pack.priceIdEnv} eksik. Stripe kredi paketi için Price ID tanımlayın.`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const stripe = getStripe();
  const stripeSession = await stripe.checkout.sessions.create({
    customer: user.stripeCustomerId || undefined,
    customer_email: user.stripeCustomerId ? undefined : userEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "payment",
    success_url: `${process.env.NEXTAUTH_URL}/dashboard/settings?topup=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/dashboard/settings?topup=canceled`,
    metadata: {
      userId,
      kind: "CREDIT_TOPUP",
      packId,
      credits: String(pack.credits),
    },
  });

  return { url: stripeSession.url };
}

