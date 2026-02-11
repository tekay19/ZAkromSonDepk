
import 'dotenv/config'; // Load .env
import searchWorker from '../src/lib/worker/search-worker';

console.log('[Worker] Starting Background Job Processor...');
if (!searchWorker) {
    throw new Error("Search worker failed to initialize.");
}
const worker = searchWorker;
console.log(`[Worker] Listening to queue: ${worker.name}`);

// Keep process alive
process.on('SIGTERM', async () => {
    console.log('[Worker] SIGTERM received. Closing worker...');
    await worker.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[Worker] SIGINT received. Closing worker...');
    await worker.close();
    process.exit(0);
});
