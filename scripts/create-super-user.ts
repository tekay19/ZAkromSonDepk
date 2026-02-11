import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

async function createSuperUser() {
    const email = "super@zakrom.com";
    const password = "SuperPassword123!";

    console.log(`🔐 Hashing password for ${email}...`);
    const hashedPassword = await hashPassword(password);

    console.log(`👤 Creating/Updating super user ${email}...`);
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            passwordHash: hashedPassword,
            emailVerified: new Date(),
            subscriptionTier: "AGENCY", // Assuming AGENCY is a high tier
            credits: 1000000000, // Effectively unlimited
            twoFactorEnabled: false,
            twoFactorEmailEnabled: false,
            twoFactorTotpEnabled: false,
            name: "Super Admin"
        },
        create: {
            email,
            name: "Super Admin",
            passwordHash: hashedPassword,
            emailVerified: new Date(),
            subscriptionTier: "AGENCY",
            credits: 1000000000,
            twoFactorEnabled: false,
            twoFactorEmailEnabled: false,
            twoFactorTotpEnabled: false
        }
    });

    console.log("✅ Super user created successfully.");
    console.log(`Email: ${user.email}`);
    console.log(`Password: ${password}`);
    console.log(`Credits: ${user.credits}`);
    console.log(`2FA Enabled: ${user.twoFactorEnabled}`);
}

createSuperUser()
    .catch((e) => {
        console.error("❌ Error creating super user:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
