import { redis } from "./src/lib/redis";

async function main() {
    console.log("Clearing search cache...");
    const keys = await redis.keys("search:*");
    if (keys.length > 0) {
        await redis.del(keys);
        console.log(`Deleted ${keys.length} keys.`);
    } else {
        console.log("No search keys found.");
    }
    console.log("Done.");
    process.exit(0);
}

main().catch(console.error);
