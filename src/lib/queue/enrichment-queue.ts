
import { Queue } from 'bullmq';
import { redisConnection } from './config';
import '@/lib/worker/enrichment-worker'; // Ensure worker starts

const QUEUE_NAME = 'enrichment-jobs';

export const enrichmentQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: true, // Keep cleaner Redis
        removeOnFail: 5,       // Keep last 5 failures for debug
    },
});

export async function addEnrichmentJob(data: { placeId: string; website?: string; name: string; address: string; jobId?: string }) {
    const job = await enrichmentQueue.add('enrich-place', data);
    return job.id;
}
