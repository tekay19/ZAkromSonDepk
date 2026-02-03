// This file ensures that workers are initialized once
import { Job } from "bullmq";
import "./worker/search-worker"; // Side-effect import to start search worker
import exportWorker from "./worker/export-worker";

let initialized = false;

export function initWorkers() {
    if (initialized) return;

    console.log("🚀 Initializing BullMQ Workers...");

    exportWorker.on("completed", (job: Job) => {
        console.log(`✅ Export Job ${job.id} completed`);
    });

    initialized = true;
}
