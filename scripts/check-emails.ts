
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Fetching places with emails...");
    const places = await prisma.place.findMany({
        where: {
            emails: {
                isEmpty: false
            }
        },
        select: {
            name: true,
            website: true,
            emails: true
        },
        take: 20
    });

    console.log(`Found ${places.length} places with emails:`);
    places.forEach(p => {
        console.log(`- ${p.name} (${p.website || 'No Website'}): ${p.emails.join(", ")}`);
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
