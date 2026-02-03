
import { searchPlaces } from './src/app/actions/search-places';
import { scrapeWebsite } from './src/lib/scraper';
import { prisma } from './src/lib/prisma';

// Mock specific parts if necessary or strict run
// We will run this with ts-node

async function testLimits() {
    console.log("--- Testing Standard Search ---");
    try {
        // Need a valid user ID or mock one
        // We will assume 'default-user' exists or is created by searchPlaces
        // Use a city/keyword that has many results
        const res = await searchPlaces('Istanbul', 'Cafe', undefined, undefined, 'test-user-business', false);
        // We need to ensure 'test-user-business' has credits and Business tier in DB?
        // Actually searchPlaces creates default FREE user if not exists.
        // We might need to manually set user tier to BUSINESS to test limit > 10
        console.log(`Standard Search Result Count: ${res.places.length}`);
        console.log(`Next Page Token: ${res.nextPageToken}`);
    } catch (e) {
        console.error("Standard Search Error:", e);
    }

    console.log("\n--- Testing Deep Search ---");
    try {
        const resDeep = await searchPlaces('Istanbul', 'Cafe', undefined, undefined, 'test-user-business', true);
        console.log(`Deep Search Result Count: ${resDeep.places.length}`);
    } catch (e) {
        console.error("Deep Search Error:", e);
    }
}

async function testScraper() {
    console.log("\n--- Testing Scraper ---");
    const testUrl = "https://www.google.com"; // Bad example for emails, need a real one?
    // Let's try a realistic one that might have info
    const target = "https://www.simit-sarayi.com";
    try {
        const data = await scrapeWebsite(target);
        console.log(`Scraped Data for ${target}:`, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Scraper Error:", e);
    }
}

async function run() {
    await testLimits();
    await testScraper();
    // process.exit(0);
}

run();
