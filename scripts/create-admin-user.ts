import { prisma } from "./src/lib/prisma";
import { hashPassword } from "./src/lib/auth/password";

async function createAdminUser() {
    const email = "tekaysemih5@gmail.com";
    // Using a secure default password, user can change it later or use the one provided in plan if they want, 
    // but plan said 'Admin123!'.
    const password = "Admin123!";

    console.log(`🔐 Hashing password for ${email}...`);
    const hashedPassword = await hashPassword(password);

    console.log(`👤 Upserting user ${email}...`);
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            passwordHash: hashedPassword,
            emailVerified: new Date(),
            subscriptionTier: "BUSINESS",
            credits: 50000,
            name: "Semih Tekay"
        },
        create: {
            email,
            name: "Semih Tekay",
            passwordHash: hashedPassword,
            emailVerified: new Date(),
            subscriptionTier: "BUSINESS",
            credits: 50000
        }
    });

    console.log("✅ Admin user created/updated successfully.");
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Tier: ${user.subscriptionTier}`);
    console.log(`Credits: ${user.credits}`);
}

createAdminUser()
    .catch((e) => {
        console.error("❌ Error creating admin user:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
