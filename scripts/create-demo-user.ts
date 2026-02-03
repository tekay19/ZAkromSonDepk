import { prisma } from "./src/lib/prisma";
import { hashPassword } from "./src/lib/auth/password";

async function createDemoUser() {
    const email = "demo@zakrom.pro";
    const password = "ZakromDemo123!";
    const hashedPassword = await hashPassword(password);

    await prisma.user.upsert({
        where: { email },
        update: {
            passwordHash: hashedPassword,
            emailVerified: new Date(),
            credits: 10,
            subscriptionTier: "FREE"
        },
        create: {
            email,
            name: "Demo User",
            passwordHash: hashedPassword,
            emailVerified: new Date(),
            credits: 10,
            subscriptionTier: "FREE"
        }
    });

    console.log("✅ Demo user created/updated successfully.");
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);
}

createDemoUser();
