import { Queue } from 'bullmq';
import { redisConnection } from './config';
import '@/lib/worker/search-worker'; // Ensure worker starts

const QUEUE_NAME = 'search-jobs';

export const searchQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

export async function addSearchJob(data: { city: string; keyword: string; userId: string; initialPageToken?: string; deepSearch?: boolean }) {
    const job = await searchQueue.add('search-task', data);
    return job.id;
}
