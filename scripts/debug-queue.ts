
import { Queue } from "bullmq";
import { redis as connection } from "./src/lib/redis";

async function debugQueue() {
    const queue = new Queue("search-jobs", { connection });

    const counts = await queue.getJobCounts();
    console.log("Job Counts:", counts);

    const active = await queue.getActive();
    console.log("Active Jobs:", active.length);
    active.forEach(job => {
        console.log(`Active Job ${job.id}:`, job.data);
    });

    const waiting = await queue.getWaiting();
    console.log("Waiting Jobs:", waiting.length);
    waiting.forEach(job => {
        console.log(`Waiting Job ${job.id}:`, job.data);
    });

    const failed = await queue.getFailed();
    console.log("Failed Jobs:", failed.length);
    failed.forEach(job => {
        console.log(`Failed Job ${job.id}:`, job.failedReason);
    });

    const keys = await connection.keys("job:*:status");
    console.log("Job Status Keys found in Redis:", keys);

    if (keys.length > 0) {
        const statuses = await Promise.all(keys.map(k => connection.get(k)));
        keys.forEach((k, i) => console.log(`${k}: ${statuses[i]}`));
    } else {
        console.log("No job status keys found!");
    }

    process.exit(0);
}

debugQueue();
