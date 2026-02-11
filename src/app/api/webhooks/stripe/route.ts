import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from "@/lib/stripe";
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { PLANS, SubscriptionTier } from '@/lib/plans';

function tierFromPriceId(priceId?: string | null): SubscriptionTier | null {
    if (!priceId) return null;
    if (process.env.STRIPE_STARTER_PRICE_ID && priceId === process.env.STRIPE_STARTER_PRICE_ID) return "STARTER";
    if (process.env.STRIPE_PRO_PRICE_ID && priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO";
    if (process.env.STRIPE_BUSINESS_PRICE_ID && priceId === process.env.STRIPE_BUSINESS_PRICE_ID) return "BUSINESS";
    return null;
}

export async function POST(req: NextRequest) {
    const stripe = getStripe();
    const body = await req.text();
    const signature = req.headers.get('stripe-signature') as string;

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch (err: any) {
        return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) {
            return new NextResponse(null, { status: 200 });
        }

        // 1) Subscription checkout (plans)
        if (session.mode === "subscription") {
            const subId = session.subscription as string | null;
            if (!subId) {
                return new NextResponse(null, { status: 200 });
            }

            const sub = await stripe.subscriptions.retrieve(subId) as any;
            const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
            const tierFromMeta = session.metadata?.tier as SubscriptionTier | undefined;
            const resolvedTier = tierFromMeta || tierFromPriceId(priceId) || "FREE";

            await prisma.user.update({
                where: { id: userId },
                data: {
                    subscriptionTier: resolvedTier,
                    stripeSubscriptionId: sub.id,
                    stripeCustomerId: sub.customer as string,
                    stripePriceId: priceId || null,
                    stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
                    credits: PLANS[resolvedTier]?.credits ?? PLANS.FREE.credits,
                },
            });
        }

        // 2) One-time payment checkout (credit top-ups)
        if (session.mode === "payment") {
            const kind = session.metadata?.kind;
            if (kind !== "CREDIT_TOPUP") {
                return new NextResponse(null, { status: 200 });
            }

            const credits = Number(session.metadata?.credits || 0);
            if (!Number.isFinite(credits) || credits <= 0) {
                return new NextResponse(null, { status: 200 });
            }

            // Idempotency: avoid incrementing credits twice for the same Checkout Session.
            const alreadyApplied = await prisma.creditTransaction.findFirst({
                where: {
                    userId,
                    type: "PURCHASE",
                    metadata: {
                        path: ["stripeSessionId"],
                        equals: session.id,
                    },
                },
                select: { id: true },
            });
            if (alreadyApplied) {
                return new NextResponse(null, { status: 200 });
            }

            await prisma.$transaction(async (tx: any) => {
                await tx.user.update({
                    where: { id: userId },
                    data: {
                        credits: { increment: credits },
                        stripeCustomerId: session.customer ? String(session.customer) : undefined,
                    },
                });

                await tx.creditTransaction.create({
                    data: {
                        userId,
                        amount: credits,
                        type: "PURCHASE",
                        description: `Kredi yükleme (+${credits})`,
                        metadata: {
                            kind,
                            credits,
                            packId: session.metadata?.packId || null,
                            stripeSessionId: session.id,
                            stripeCustomerId: session.customer ? String(session.customer) : null,
                        },
                    },
                });
            });
        }
    }

    if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as any;
        const invoiceId = invoice?.id as string | undefined;
        const subId = invoice?.subscription as string | undefined;
        if (!invoiceId || !subId) {
            return new NextResponse(null, { status: 200 });
        }

        const sub = await stripe.subscriptions.retrieve(subId) as any;
        const user = await prisma.user.findFirst({
            where: { stripeSubscriptionId: sub.id },
            select: { id: true, subscriptionTier: true },
        });
        if (!user) {
            return new NextResponse(null, { status: 200 });
        }

        const tier = (user.subscriptionTier as SubscriptionTier) || "FREE";
        const plan = PLANS[tier] || PLANS.FREE;
        const refill = plan.credits;

        // Idempotency: avoid applying the same invoice twice.
        const alreadyApplied = await prisma.creditTransaction.findFirst({
            where: {
                userId: user.id,
                type: "SUBSCRIPTION_RENEWAL",
                metadata: {
                    path: ["stripeInvoiceId"],
                    equals: invoiceId,
                },
            },
            select: { id: true },
        });
        if (alreadyApplied) {
            return new NextResponse(null, { status: 200 });
        }

        await prisma.$transaction(async (tx: any) => {
            await tx.user.update({
                where: { id: user.id },
                data: {
                    stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
                    // Monthly credits reset: unused credits should not carry over to the next billing period.
                    credits: refill,
                },
            });

            await tx.creditTransaction.create({
                data: {
                    userId: user.id,
                    amount: refill,
                    type: "SUBSCRIPTION_RENEWAL",
                    description: `Aylık kredi yüklemesi (+${refill})`,
                    metadata: {
                        stripeInvoiceId: invoiceId,
                        stripeSubscriptionId: sub.id,
                        tier,
                        refill,
                    },
                },
            });
        });
    }

    if (event.type === 'customer.subscription.updated') {
        // Handle plan changes if they happen directly in Stripe Dashboard or Customer Portal
        const sub = event.data.object as any;
        const subId = sub?.id as string | undefined;
        if (!subId) {
            return new NextResponse(null, { status: 200 });
        }

        const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
        const nextTier = tierFromPriceId(priceId);

        await prisma.user.updateMany({
            where: { stripeSubscriptionId: subId },
            data: {
                stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
                stripePriceId: priceId || null,
                ...(nextTier ? { subscriptionTier: nextTier } : {}),
            },
        });
    }

    if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object as any;
        const subId = sub?.id as string | undefined;
        if (!subId) {
            return new NextResponse(null, { status: 200 });
        }

        await prisma.user.updateMany({
            where: { stripeSubscriptionId: subId },
            data: {
                subscriptionTier: 'FREE',
                stripeSubscriptionId: null,
                stripePriceId: null,
                stripeCurrentPeriodEnd: null,
            },
        });
    }

    return new NextResponse(null, { status: 200 });
}
