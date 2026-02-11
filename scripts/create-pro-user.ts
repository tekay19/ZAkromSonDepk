import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

async function createProUser() {
    const email = "pro@zakrom.pro";
    const password = "ZakromPro123!";
    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            passwordHash: hashedPassword,
            emailVerified: new Date(), // skip email verification for this user
            subscriptionTier: "PRO",
            credits: 2500,
            twoFactorEnabled: false,
            twoFactorEmailEnabled: false,
            twoFactorTotpEnabled: false,
            name: "Pro User",
        },
        create: {
            email,
            name: "Pro User",
            passwordHash: hashedPassword,
            emailVerified: new Date(),
            subscriptionTier: "PRO",
            credits: 2500,
            twoFactorEnabled: false,
            twoFactorEmailEnabled: false,
            twoFactorTotpEnabled: false,
        },
        select: {
            id: true,
            email: true,
            subscriptionTier: true,
            credits: true,
            emailVerified: true,
            twoFactorEmailEnabled: true,
            twoFactorTotpEnabled: true,
        },
    });

    console.log("✅ PRO user created/updated successfully.");
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Tier: ${user.subscriptionTier}`);
    console.log(`Credits: ${user.credits}`);
    console.log(`EmailVerified: ${user.emailVerified ? "YES" : "NO"}`);
    console.log(`2FA Email Enabled: ${user.twoFactorEmailEnabled}`);
    console.log(`2FA TOTP Enabled: ${user.twoFactorTotpEnabled}`);
    console.log("");
    console.log("Credentials:");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
}

createProUser()
    .catch((e) => {
        console.error("❌ Error creating PRO user:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
