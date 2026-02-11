
import { Queue } from "bullmq";
import { randomUUID } from "crypto";
import { redisConnection } from "./config";

export const SEARCH_QUEUE_NAME = "search-queue";

function createSearchQueue() {
    return new Queue(SEARCH_QUEUE_NAME, {
        connection: redisConnection,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 1000,
            },
            removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
            removeOnFail: { count: 50 }, // Keep last 50 failed jobs
        },
    });
}

const globalForQueues = global as unknown as { searchQueue?: Queue };

export function getSearchQueue() {
    if (!globalForQueues.searchQueue) {
        globalForQueues.searchQueue = createSearchQueue();
    }
    return globalForQueues.searchQueue;
}

export interface SearchJobData {
    userId: string;
    city: string;
    keyword: string;
    deepSearch: boolean;
    initialPageToken?: string;
}

export async function addSearchJob(data: SearchJobData) {
    // Use an unguessable job id because it is exposed to the client for polling.
    // Deduplication is handled by API-level locks.
    const jobId = randomUUID();

    await getSearchQueue().add("search-task", data, { jobId });

    return jobId;
}
