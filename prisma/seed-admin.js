// Seed script to create BUSINESS tier admin user
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@zakrom.com';
    const password = 'Admin123!';

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create or update admin user
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            subscriptionTier: 'BUSINESS',
            credits: 999999,
            twoFactorEnabled: false,
            twoFactorEmailEnabled: false,
            twoFactorTotpEnabled: false,
            emailVerified: new Date(),
        },
        create: {
            email,
            name: 'Admin',
            passwordHash,
            subscriptionTier: 'BUSINESS',
            credits: 999999,
            twoFactorEnabled: false,
            twoFactorEmailEnabled: false,
            twoFactorTotpEnabled: false,
            emailVerified: new Date(),
        },
    });

    console.log('✅ Admin user created/updated:');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('   Tier:', user.subscriptionTier);
    console.log('   Credits:', user.credits);
    console.log('   2FA:', user.twoFactorEnabled ? 'Enabled' : 'Disabled');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
