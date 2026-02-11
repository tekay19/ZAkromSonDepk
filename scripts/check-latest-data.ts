
console.log("Script starting...");
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkLatestData() {
    try {
        const places = await prisma.place.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: {
                name: true,
                emails: true,
                socials: true,
                website: true,
                scrapeStatus: true,
                updatedAt: true
            }
        });

        console.log("--------------- LATEST 5 UPDATED PLACES ---------------");
        places.forEach(p => {
            console.log(`Name: ${p.name}`);
            console.log(`Website: ${p.website}`);
            console.log(`Scrape Status: ${p.scrapeStatus}`);
            console.log(`Emails: ${JSON.stringify(p.emails)}`);
            console.log(`Socials: ${JSON.stringify(p.socials)}`);
            console.log(`Updated At: ${p.updatedAt.toISOString()}`);
            console.log("-------------------------------------------------------");
        });

    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkLatestData();
