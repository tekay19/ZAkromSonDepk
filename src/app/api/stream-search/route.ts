
import { redis } from '@/lib/redis';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        return new Response('Job ID is required', { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            // Create a dedicated Redis subscriber for this connection
            // We duplicate the existing client or create a new one because the main client might be used for commands
            // NOTE: redis instance from @/lib/redis is usually an ioredis instance.
            // ioredis needs a dedicated connection for subscriptions.
            const subscriber = redis.duplicate();

            await subscriber.subscribe(`search:updates:${jobId}`);

            const onMessage = (channel: string, message: string) => {
                if (channel === `search:updates:${jobId}`) {
                    const data = `data: ${message}\n\n`;
                    controller.enqueue(encoder.encode(data));
                }
            };

            subscriber.on('message', onMessage);

            // Send initial ping to keep alive
            controller.enqueue(encoder.encode(': connected\n\n'));

            // Check if job is already done? 
            // The frontend might want to know if it finished. 
            // We can subscribe to status updates too? 
            // For now, let's just stream results. Frontend manages "Done" via polling status or separate logic.

            // Clean up on close
            request.signal.addEventListener('abort', async () => {
                await subscriber.unsubscribe(`search:updates:${jobId}`);
                subscriber.quit();
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
