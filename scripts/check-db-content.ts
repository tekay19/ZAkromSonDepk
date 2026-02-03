
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Checking last 10 places in DB...");
    const places = await prisma.place.findMany({
        take: 10,
        orderBy: { updatedAt: 'desc' }
    });

    console.log(`Found ${places.length} places.`);
    places.forEach(p => {
        console.log(`[${p.id}] ${p.name}`);
        console.log(`   - Google ID: ${p.googleId}`);
        console.log(`   - Website: ${p.website}`);
        console.log(`   - Scrape Status: ${p.scrapeStatus}`);
        console.log(`   - Emails: ${JSON.stringify(p.emails)}`);
        console.log(`   - Socials: ${JSON.stringify(p.socials)}`);
        console.log("------------------------------------------------");
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
