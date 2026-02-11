// This file ensures that workers are initialized once
import { Job } from "bullmq";

let initialized = false;

export function initWorkers() {
    if (initialized) return;

    // Avoid starting workers during `next build` where multiple static workers may run.
    if (process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build") {
        return;
    }
    if (process.env.DISABLE_WORKERS === "true") {
        return;
    }

    console.log("🚀 Initializing BullMQ Workers...");

    // Lazy-import workers to avoid side-effects during `next build`.
    void import("./worker/search-worker");
    void import("./worker/enrichment-worker");
    void import("./worker/export-worker").then(({ default: exportWorker }) => {
        exportWorker.on("completed", (job: Job) => {
            console.log(`✅ Export Job ${job.id} completed`);
        });
    });
    void import("./worker/visual-export-worker").then(({ default: visualExportWorker }) => {
        visualExportWorker.on("completed", (job: Job) => {
            console.log(`✅ Visual Export Job ${job.id} completed`);
        });
    });

    initialized = true;
}
