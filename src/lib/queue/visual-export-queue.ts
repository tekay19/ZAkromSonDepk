import { Queue } from "bullmq";
import { redisConnection } from "./config";
import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";

const QUEUE_NAME = "visual-export-jobs";

export const visualExportQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: 5,
  },
});

export async function addVisualExportJob(data: {
  placeIds: string[];
  format: "png" | "pdf";
  userId: string;
}) {
  // Exposed to the client; keep it unguessable.
  const jobId = `visual-${randomUUID()}`;
  await redis.set(`visual:${jobId}:format`, data.format, "EX", 3600);
  await redis.set(`visual:${jobId}:status`, "pending", "EX", 3600);
  await redis.set(`visual:${jobId}:userId`, data.userId, "EX", 3600);
  await visualExportQueue.add("process-visual-export", { ...data, jobId });
  return jobId;
}
