import { prisma } from "./src/lib/prisma";

async function main() {
    console.log("=== USERS ===");
    const users = await prisma.user.findMany({
        select: {
            email: true,
            name: true,
            subscriptionTier: true
        }
    });
    users.forEach(u => {
        console.log(`- ${u.name || 'No Name'} (${u.email}) [${u.subscriptionTier}]`);
    });

    console.log("\n=== PLACES (Collected Emails) ===");
    const places = await prisma.place.findMany({
        where: {
            emails: {
                isEmpty: false
            }
        },
        select: {
            name: true,
            emails: true
        }
    });

    let totalEmails = 0;
    places.forEach(p => {
        if (p.emails && p.emails.length > 0) {
            console.log(`- ${p.name}: ${p.emails.join(", ")}`);
            totalEmails += p.emails.length;
        }
    });

    console.log(`\nTotal Users: ${users.length}`);
    console.log(`Total Places with Emails: ${places.length}`);
    console.log(`Total Emails Found in Places: ${totalEmails}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
