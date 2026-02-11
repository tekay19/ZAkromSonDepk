import { Worker, Job } from 'bullmq';
import { redisConnection } from '../queue/config';
import { searchPlacesInternal } from '@/app/actions/search-places';
import { redis } from '../redis';

const QUEUE_NAME = 'search-queue';

export const setupWorker = () => {
    console.log('👷 Search Worker starting...');

    const worker = new Worker(
        QUEUE_NAME,
        async (job: Job) => {
            const { city, keyword, userId, initialPageToken, deepSearch } = job.data;
            const jobId = String(job.id);

            console.log(`[Job ${jobId}] Processing search for ${city}: ${keyword} (PageToken: ${initialPageToken ? 'Yes' : 'No'}, Deep: ${deepSearch})`);

            try {
                // 1. Update status to processing
                await redis.set(`job:${jobId}:status`, 'processing', 'EX', 3600);

                // 2. Execute actual search
                const results = await searchPlacesInternal(
                    city,
                    keyword,
                    undefined,
                    initialPageToken,
                    userId,
                    deepSearch,
                    jobId
                );

                // 3. Store result and update status to completed
                await redis.set(`job:${jobId}:result`, JSON.stringify(results), 'EX', 3600);
                await redis.set(`job:${jobId}:status`, 'completed', 'EX', 3600);

                console.log(`[Job ${jobId}] Search completed successfully.`);
                return results;
            } catch (error: any) {
                console.error(`[Job ${jobId}] Search failed:`, error.message);
                await redis.set(`job:${jobId}:status`, 'failed', 'EX', 3600);
                await redis.set(`job:${jobId}:error`, error.message, 'EX', 3600);
                throw error;
            }
        },
        {
            connection: redisConnection,
            concurrency: parseInt(process.env.SEARCH_CONCURRENCY || '10') // Configurable concurrency
        }
    );

    worker.on('completed', (job) => {
        console.log(`[Job ${job.id}] Worker finished job.`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[Job ${job?.id}] Worker failed job:`, err.message);
    });

    return worker;
};

// Global singleton for the worker to avoid multiple instances in Next.js HMR
const globalForWorker = global as unknown as { searchWorker: Worker | undefined };

export const searchWorker =
    globalForWorker.searchWorker ||
    (process.env.NODE_ENV !== 'test' ? setupWorker() : undefined);

if (!globalForWorker.searchWorker && searchWorker) {
    globalForWorker.searchWorker = searchWorker;
}

export default searchWorker;
