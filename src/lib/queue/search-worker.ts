
import { Worker, Job } from "bullmq";
import { searchPlacesInternal } from "@/app/actions/search-places";
import { redis } from "@/lib/redis";

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
    username: process.env.REDIS_USERNAME,
};

// Define Worker
export const searchWorker = new Worker("search-queue", async (job: Job) => {
    const { userId, city, keyword, deepSearch, initialPageToken } = job.data;

    console.log(`[Worker] Processing Job ${job.id}: ${keyword} in ${city} (User: ${userId})`);

    // Update job progress (0% - Started)
    await job.updateProgress(10);

    // We need to pass the Job ID to searchPlacesInternal so it can publish real-time updates via Redis
    // searchPlacesInternal(..., jobId)
    // But searchPlacesInternal signature needs update.

    // For now, let's call it and assume it completes or throws
    // We modify searchPlacesInternal to stream updates?
    // Actually, searchPlacesInternal is already massive.

    // Let's pass the jobId to searchPlacesInternal in the next step.
    const result = await searchPlacesInternal(city, keyword, undefined, initialPageToken, userId, deepSearch, String(job.id));

    await job.updateProgress(100);
    return result;

}, {
    connection,
    concurrency: 2
});

searchWorker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed!`);
});

searchWorker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err);
});
