
import 'dotenv/config'; // Load .env
import searchWorker from '../src/lib/worker/search-worker';
import exportWorker from '../src/lib/worker/export-worker';
import enrichmentWorker from '../src/lib/worker/enrichment-worker';
import visualExportWorker from '../src/lib/worker/visual-export-worker';

console.log('[Worker] Starting Background Job Processors...');

const workers = [
    searchWorker,
    exportWorker,
    enrichmentWorker,
    visualExportWorker
];

for (const worker of workers) {
    if (!worker) {
        console.error(`[Worker] Failed to initialize a worker.`);
        continue;
    }
    console.log(`[Worker] Listening to queue: ${worker.name}`);
}

// Keep process alive
process.on('SIGTERM', async () => {
    console.log('[Worker] SIGTERM received. Closing workers...');
    for (const worker of workers) await worker?.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[Worker] SIGINT received. Closing workers...');
    for (const worker of workers) await worker?.close();
    process.exit(0);
});
