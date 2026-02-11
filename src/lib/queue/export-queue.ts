import { Queue } from "bullmq";
import { redisConnection } from "./config";
import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";

const EXPORT_QUEUE_NAME = "export-jobs";

export const exportQueue = new Queue(EXPORT_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
        removeOnComplete: true,
    },
});

export async function addExportJob(data: {
    placeIds: string[];
    format: "csv" | "xlsx" | "json";
    userId: string;
    includeEmails?: boolean;
}) {
    // Exposed to the client; keep it unguessable.
    const jobId = `export-${randomUUID()}`;
    await redis.set(`export:${jobId}:format`, data.format, "EX", 3600);
    await redis.set(`export:${jobId}:status`, "pending", "EX", 3600);
    await redis.set(`export:${jobId}:userId`, data.userId, "EX", 3600);
    await exportQueue.add("process-export", { ...data, jobId });
    return jobId;
}
