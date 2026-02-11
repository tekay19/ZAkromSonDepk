
import { scraperGateway } from "../src/lib/gateway/scraper-gateway";

// Mock viewport for Istanbul
const istanbulViewport = {
    northeast: { lat: 41.1, lng: 29.1 },
    southwest: { lat: 40.9, lng: 28.8 }
};

async function main() {
    console.log("Starting Scraper Test...");
    try {
        const results = await scraperGateway.scanRegion("Kebab", istanbulViewport);
        console.log("Scraping Completed!");
        console.log(`Found ${results.length} places.`);
        if (results.length > 0) {
            console.log("First result:", results[0]);
        }
    } catch (e) {
        console.error("Scraper Failed:", e);
    }
}

main();
