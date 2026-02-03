import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from "@/lib/stripe";
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { PLANS, SubscriptionTier } from '@/lib/plans';

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

    const session = event.data.object as Stripe.Checkout.Session;
    const subscription = event.data.object as Stripe.Subscription;

    if (event.type === 'checkout.session.completed') {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string) as any;
        const userId = session.metadata?.userId;
        const tier = session.metadata?.tier as SubscriptionTier;

        if (userId && tier) {
            await prisma.user.update({
                where: { id: userId },
                data: {
                    subscriptionTier: tier,
                    stripeSubscriptionId: sub.id,
                    stripeCustomerId: sub.customer as string,
                    stripePriceId: sub.items.data[0].price.id,
                    stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
                    credits: PLANS[tier].credits,
                },
            });
        }
    }

    if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as any; // Cast to any to avoid type errors

        // Retrieve the subscription details from Stripe
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string) as any;

        // Find user by Stripe Subscription ID
        const user = await prisma.user.findFirst({
            where: { stripeSubscriptionId: sub.id }
        });

        if (user) {
            // Determine tier based on the last known tier or by querying Stripe Price ID
            // For simplicity, we trust the current user tier if valid, or fallback to FREE
            // In a more complex app, you'd map Price ID -> Tier
            const tier = user.subscriptionTier as SubscriptionTier;
            const plan = PLANS[tier];

            if (plan) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
                        credits: { increment: plan.credits } // Refill/Increment credits on successful payment
                    }
                });
            }
        }
    }

    if (event.type === 'customer.subscription.updated') {
        // Handle plan changes if they happen directly in Stripe Dashboard or Customer Portal
        const sub = event.data.object as any;
        const user = await prisma.user.findUnique({
            where: { stripeSubscriptionId: sub.id }
        });

        if (user) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
                }
            });
        }
    }

    if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object as any;
        await prisma.user.updateMany({
            where: { stripeSubscriptionId: sub.id },
            data: {
                subscriptionTier: 'FREE',
                stripePriceId: null,
                stripeCurrentPeriodEnd: null,
            },
        });
    }

    return new NextResponse(null, { status: 200 });
}
