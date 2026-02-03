import { searchPlacesAsync } from "./src/app/actions/search-places";

const CITIES = ["London", "New York", "Paris", "Tokyo", "Berlin", "Dubai", "Istanbul", "Rome", "Madrid", "Toronto"];
const KEYWORDS = ["Restaurant", "Hotel", "Lawyer", "Clinic", "Gym", "Plumber", "Electrician", "Real Estate", "Barber", "Bakery"];

async function chaosTest() {
    console.log("🌪️  Starting Chaos Test: 600 Concurrent Global Requests...");

    const totalRequests = 600;
    const startTime = Date.now();

    const requests = Array.from({ length: totalRequests }).map((_, i) => {
        // Pick random city and keyword to simulate 100 unique query combinations (10*10)
        // Some will overlap (Thundering Herd test), some will be new (Throughput test)
        const city = CITIES[i % CITIES.length];
        const keyword = KEYWORDS[Math.floor(i / CITIES.length) % KEYWORDS.length];
        const userId = `chaos-user-${i}`;

        return searchPlacesAsync(city, keyword, userId).catch(err => {
            return { error: err.message };
        });
    });

    console.log(`📡 Dispatched ${totalRequests} requests to the API... Waiting for responses.`);
    const results = await Promise.all(requests);
    const duration = (Date.now() - startTime) / 1000;

    const newJobs = results.filter(r => (r as any).type === "JOB" && !(r as any).message).length;
    const joinedJobs = results.filter(r => (r as any).type === "JOB" && (r as any).message).length;
    const cachedHits = results.filter(r => (r as any).type === "CACHED").length;
    const errors = results.filter(r => (r as any).error).length;

    console.log(`\n📊 Chaos Test Results (${duration}s):`);
    console.log(`🚀 Unique Jobs Created: ${newJobs}`);
    console.log(`🤝 Requests Consolidated: ${joinedJobs}`);
    console.log(`🎯 Cache Hits: ${cachedHits}`);
    console.log(`❌ Failures/Blocked: ${errors}`);

    console.log("\n💡 Note: 600 requests were reduced to " + newJobs + " actual worker tasks. That's a " +
        (((totalRequests - newJobs) / totalRequests) * 100).toFixed(1) + "% efficiency gain!");
}

chaosTest();
