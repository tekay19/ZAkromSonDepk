'use server';

import { getSearchQueue } from "@/lib/queue/search-queue";
import { Job } from "bullmq";

export type SearchJobStatusResponse =
    | { status: 'pending' | 'active'; progress: number }
    | { status: 'completed'; data: any }
    | { status: 'failed'; error: string }
    | { status: 'unknown' };

export async function getSearchJobStatus(jobId: string): Promise<SearchJobStatusResponse> {
    try {
        const job = await getSearchQueue().getJob(jobId);

        if (!job) {
            return { status: 'unknown' };
        }

        const state = await job.getState();
        const progress = job.progress || 0;

        if (state === 'completed') {
            return { status: 'completed', data: job.returnvalue };
        }

        if (state === 'failed') {
            return { status: 'failed', error: job.failedReason || "İşlem başarısız oldu." };
        }

        return {
            status: state === 'active' ? 'active' : 'pending',
            progress: typeof progress === 'number' ? progress : 0
        };

    } catch (error) {
        console.error("Error fetching job status:", error);
        return { status: 'unknown' };
    }
}
