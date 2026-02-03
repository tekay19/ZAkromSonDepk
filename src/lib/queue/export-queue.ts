import { Queue } from "bullmq";
import { redisConnection } from "./config";

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

export async function addExportJob(data: { results: any[], format: string, userId: string }) {
    const jobId = `export-${Date.now()}-${data.userId}`;
    await exportQueue.add("process-export", { ...data, jobId });
    return jobId;
}
