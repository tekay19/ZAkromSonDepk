/**
 * Stripe Price ID Otomatik Kurulum Scripti
 * 
 * Bu script Stripe'ta yeni planlar için Price ID'leri oluşturur
 * ve .env dosyasını otomatik günceller.
 * 
 * Kullanım:
 *   1. .env dosyasına STRIPE_SECRET_KEY ekleyin
 *   2. npx tsx scripts/stripe-setup-prices.ts
 */

import Stripe from "stripe";
import * as fs from "fs";
import * as path from "path";

const PLANS = [
    {
        name: "Zakrom Starter",
        envKey: "STRIPE_STARTER_PRICE_ID",
        amount: 3900, // $39.00 in cents
        interval: "month" as const,
        description: "500 Kredi / Ay — Girişimciler için",
    },
    {
        name: "Zakrom Growth",
        envKey: "STRIPE_PRO_PRICE_ID",
        amount: 12900, // $129.00 in cents
        interval: "month" as const,
        description: "2,500 Kredi / Ay — Büyüyen ekipler için",
    },
    {
        name: "Zakrom Business",
        envKey: "STRIPE_BUSINESS_PRICE_ID",
        amount: 34900, // $349.00 in cents
        interval: "month" as const,
        description: "7,500 Kredi / Ay — Büyük operasyonlar için",
    },
];

const TOPUP_PACKS = [
    {
        name: "Zakrom 1.000 Kredi",
        envKey: "STRIPE_TOPUP_1000_PRICE_ID",
        amount: 1500, // $15.00
        description: "1,000 Kredi yükleme",
    },
    {
        name: "Zakrom 5.000 Kredi",
        envKey: "STRIPE_TOPUP_5000_PRICE_ID",
        amount: 5900, // $59.00
        description: "5,000 Kredi yükleme",
    },
    {
        name: "Zakrom 20.000 Kredi",
        envKey: "STRIPE_TOPUP_20000_PRICE_ID",
        amount: 19900, // $199.00
        description: "20,000 Kredi yükleme",
    },
];

async function main() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey || secretKey.includes("BURAYA")) {
        console.error("❌ STRIPE_SECRET_KEY .env dosyasında tanımlı değil.");
        console.error("   Stripe Dashboard → Developers → API Keys → Secret key");
        process.exit(1);
    }

    const stripe = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });
    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = fs.readFileSync(envPath, "utf-8");

    console.log("🚀 Stripe Price ID'leri oluşturuluyor...\n");

    // --- Subscription Plans ---
    for (const plan of PLANS) {
        console.log(`📦 ${plan.name} ($${(plan.amount / 100).toFixed(2)}/ay)...`);

        const product = await stripe.products.create({
            name: plan.name,
            description: plan.description,
        });

        const price = await stripe.prices.create({
            product: product.id,
            unit_amount: plan.amount,
            currency: "usd",
            recurring: { interval: plan.interval },
        });

        console.log(`   ✅ Price ID: ${price.id}`);
        envContent = envContent.replace(
            new RegExp(`^${plan.envKey}=.*$`, "m"),
            `${plan.envKey}=${price.id}`
        );
    }

    // --- Top-up Packs ---
    console.log("\n💰 Kredi paketleri oluşturuluyor...\n");

    for (const pack of TOPUP_PACKS) {
        console.log(`📦 ${pack.name} ($${(pack.amount / 100).toFixed(2)})...`);

        const product = await stripe.products.create({
            name: pack.name,
            description: pack.description,
        });

        const price = await stripe.prices.create({
            product: product.id,
            unit_amount: pack.amount,
            currency: "usd",
        });

        console.log(`   ✅ Price ID: ${price.id}`);
        envContent = envContent.replace(
            new RegExp(`^${pack.envKey}=.*$`, "m"),
            `${pack.envKey}=${price.id}`
        );
    }

    // Write updated .env
    fs.writeFileSync(envPath, envContent, "utf-8");

    console.log("\n──────────────────────────────────────");
    console.log("✅ Tümü oluşturuldu! .env dosyası güncellendi.");
    console.log("──────────────────────────────────────\n");
    console.log("Sonraki adımlar:");
    console.log("  1. NEXT_PUBLIC_ENABLE_STRIPE_MOCK=false olarak güncelleyin");
    console.log("  2. Stripe Dashboard → Webhooks → Endpoint ekleyin:");
    console.log("     URL: https://yourdomain.com/api/webhooks/stripe");
    console.log("     Events: checkout.session.completed, invoice.payment_succeeded,");
    console.log("             customer.subscription.updated, customer.subscription.deleted");
    console.log("  3. Webhook signing secret'ı .env'e STRIPE_WEBHOOK_SECRET olarak ekleyin");
    console.log("  4. Uygulamayı yeniden başlatın: npm run dev");
}

main().catch((err) => {
    console.error("❌ Hata:", err.message);
    process.exit(1);
});
