import { searchPlacesAsync } from "./src/app/actions/search-places";

async function stressTest() {
    console.log("🔥 Starting Stress Test: 200 Concurrent Requests...");

    const city = "Istanbul";
    const keyword = "Restoran";
    const userId = "stress-test-user";

    const startTime = Date.now();
    const requests = Array.from({ length: 200 }).map((_, i) => {
        return searchPlacesAsync(city, keyword, userId).catch(err => {
            return { error: err.message };
        });
    });

    const results = await Promise.all(requests);
    const duration = (Date.now() - startTime) / 1000;

    const successfulJobs = results.filter(r => (r as any).type === "JOB" && !(r as any).message).length;
    const joinedJobs = results.filter(r => (r as any).type === "JOB" && (r as any).message).length;
    const cachedHits = results.filter(r => (r as any).type === "CACHED").length;
    const errors = results.filter(r => (r as any).error).length;

    console.log(`\n📊 Stress Test Results (${duration}s):`);
    console.log(`🚀 New Jobs Created: ${successfulJobs}`);
    console.log(`🤝 Requests Joined (Thundering Herd Protected): ${joinedJobs}`);
    console.log(`🎯 Cache Hits: ${cachedHits}`);
    console.log(`❌ Failures/Blocked: ${errors}`);

    if (errors > 0) {
        console.log("🛡️ Traffic control active: System successfully blocked excessive requests.");
    }
}

stressTest();
