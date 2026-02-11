
import { config } from 'dotenv';
config();

import http from "http";
import { prisma } from '@/lib/prisma';
import { addEnrichmentJob } from '@/lib/queue/enrichment-queue';
import worker from '@/lib/worker/enrichment-worker'; // Importing starts the worker
import { randomUUID } from 'crypto';


async function startMockWebsite() {
    const server = http.createServer((req, res) => {
        const url = req.url || "/";
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.statusCode = 200;

        if (url.startsWith("/contact")) {
            res.end(`<!doctype html><html><body>
                <h1>Contact</h1>
                <p>Email: hello+contact@iana.org</p>
            </body></html>`);
            return;
        }

        res.end(`<!doctype html><html><body>
            <h1>Mock Biz</h1>
            <p>Email: hello+root@iana.org</p>
            <a href="/contact">Contact</a>
        </body></html>`);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("Failed to start mock server");
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    return {
        baseUrl,
        close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
    };
}

async function main() {
    console.log('[Test] Starting Integration Flow Test...');

    const mockSite = await startMockWebsite();

    // Ensure worker is connected before we enqueue jobs.
    worker.on("completed", (job) => console.log(`[Test] Worker completed job ${job.id}`));
    worker.on("failed", (job, err) => console.error(`[Test] Worker failed job ${job?.id}:`, err?.message || err));
    await worker.waitUntilReady();
    console.log("[Test] Enrichment worker ready.");

    // 1. Create Dummy Place
    const testId = `test-place-${randomUUID()}`;
    const place = await prisma.place.create({
        data: {
            googleId: testId,
            name: "Test Place Integration",
            address: "123 Test St",
            website: `${mockSite.baseUrl}/biz/${encodeURIComponent(testId)}`,
            scrapeStatus: "PENDING"
        }
    });
    console.log(`[Test] Created Place: ${place.id}`);

    // 2. Add Job
    console.log('[Test] Adding Enrichment Job...');
    const jobId = await addEnrichmentJob({
        placeId: place.id,
        website: place.website!,
        name: place.name,
        address: place.address!
    });
    console.log(`[Test] Job Added: ${jobId}`);

    // 3. Wait for Worker
    console.log('[Test] Waiting for worker to process...');

    // Poll DB for status change
    let attempts = 0;
    while (attempts < 60) {
        await new Promise(r => setTimeout(r, 1000));
        const checked = await prisma.place.findUnique({ where: { id: place.id } });

        if (checked?.scrapeStatus === 'COMPLETED') {
            console.log(`[Test] validation passed! Status: ${checked.scrapeStatus}`);
            console.log(`[Test] Emails found: ${checked.emails.length}`);

            if (!checked.emails || checked.emails.length === 0) {
                console.error('[Test] Expected at least 1 email to be extracted.');
                await prisma.place.delete({ where: { id: place.id } });
                await mockSite.close().catch(() => { });
                process.exit(1);
            }

            // Cleanup
            await prisma.place.delete({ where: { id: place.id } });
            await mockSite.close().catch(() => { });
            console.log('[Test] Cleanup done.');
            process.exit(0);
        }
        if (checked?.scrapeStatus === 'FAILED') {
            console.error(`[Test] Worker failed. Status: ${checked.scrapeStatus}`);
            console.error(`[Test] Emails found: ${checked.emails.length}`);
            await prisma.place.delete({ where: { id: place.id } });
            await mockSite.close().catch(() => { });
            process.exit(1);
        }
        process.stdout.write('.');
        attempts++;
    }

    console.error('\n[Test] Timeout waiting for worker.');
    await prisma.place.delete({ where: { id: place.id } });
    await mockSite.close().catch(() => { });
    process.exit(1);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
