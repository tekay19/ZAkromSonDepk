
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Scraper Verification ---');

    // 1. Check Status Distribution
    const statusCounts = await prisma.place.groupBy({
        by: ['scrapeStatus'],
        _count: { id: true }
    });
    console.log('Status Counts:', statusCounts.map((s: { scrapeStatus: string; _count: { id: number; }; }) => `${s.scrapeStatus}: ${s._count.id}`).join(', '));

    // 2. Check Places WITH Website
    const websiteCount = await prisma.place.count({
        where: { website: { not: null } }
    });
    console.log(`Places with Website: ${websiteCount}`);

    // 3. Check for Successful Scrapes (Emails found)
    // Prisma isEmpty is tricky, so let's just fetch some completed ones
    const completedPlaces = await prisma.place.findMany({
        where: { scrapeStatus: 'COMPLETED' },
        select: { name: true, website: true, emails: true, socials: true },
        take: 5
    });

    console.log(`\nSample Completed Scrapes (${completedPlaces.length} found):`);
    if (completedPlaces.length === 0) {
        console.log("No completed scrapes yet. Check queue worker logs.");
    }

    completedPlaces.forEach((p: any) => {
        console.log(`\nBusiness: ${p.name}`);
        console.log(`  Site: ${p.website}`);
        console.log(`  Emails: ${p.emails.length > 0 ? p.emails.join(', ') : 'None found on site'}`);
        console.log(`  Socials: ${JSON.stringify(p.socials)}`);
    });

    // 4. Check for Failures
    const failedPlaces = await prisma.place.findMany({
        where: { scrapeStatus: 'FAILED' },
        take: 3,
        select: { name: true, website: true }
    });

    if (failedPlaces.length > 0) {
        console.log('\nSample Failed Scrapes:');
        failedPlaces.forEach((p: any) => console.log(`- ${p.name} (${p.website})`));
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
