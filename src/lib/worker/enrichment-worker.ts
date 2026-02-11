
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../queue/config';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { Scraper } from '@/lib/scraper';
import { validateEmails } from '@/lib/email-validator';
import { scraperGateway } from "@/lib/gateway/scraper-gateway";

const scraper = new Scraper();

const worker = new Worker('enrichment-jobs', async (job: Job) => {
    const { placeId, jobId } = job.data;
    console.log(`[Enrichment Worker] Processing job ${job.id} for place ${placeId}`);

    try {
        const place = await prisma.place.findUnique({
            where: { id: placeId },
            select: { id: true, googleId: true, website: true, phone: true, address: true }
        });
        if (!place) {
            throw new Error(`Place not found: ${placeId}`);
        }

        await prisma.place.update({
            where: { id: placeId },
            data: { scrapeStatus: 'PROCESSING' }
        });

        let enrichmentData: any = { emails: [], emailScores: {}, socials: {} };
        let scrapeFailed = false;

        // Optional: If we don't have a website yet, try extracting it from Google Maps place page
        // using the API-provided place ID (no additional "search" step).
        let effectiveWebsite = place.website || "";
        if (!effectiveWebsite && process.env.MAPS_DETAILS_SCRAPER_ENABLED === "true") {
            const details = await scraperGateway.scrapePlaceDetailsByGoogleId(place.googleId);
            const patch: any = {};
            if (details.website && typeof details.website === "string") patch.website = details.website;
            if (!place.phone && details.phone && typeof details.phone === "string") patch.phone = details.phone;
            if (!place.address && details.address && typeof details.address === "string") patch.address = details.address;
            if (Object.keys(patch).length > 0) {
                const updated = await prisma.place.update({ where: { id: placeId }, data: patch });
                effectiveWebsite = updated.website || "";
            }
        }

        if (effectiveWebsite) {
            try {
                const result = await scraper.scrapeWebsite(effectiveWebsite);
                const validated = await validateEmails(result.emails || [], effectiveWebsite, 40);
                enrichmentData = {
                    emails: validated.map(v => v.email),
                    emailScores: validated.reduce((acc: Record<string, number>, curr) => {
                        acc[curr.email] = curr.score;
                        return acc;
                    }, {}),
                    socials: result.socials || {}
                };
            } catch (scrapeError) {
                console.error(`[Enrichment Worker] Scraping failed for ${effectiveWebsite}:`, scrapeError);
                scrapeFailed = true;
            }
        }

        // Update DB
        const updatedPlace = await prisma.place.update({
            where: { id: placeId },
            data: {
                emails: enrichmentData.emails || [],
                emailScores: enrichmentData.emailScores || {},
                socials: enrichmentData.socials || {}, // Assuming JSON field
                scrapeStatus: !effectiveWebsite ? 'SKIPPED' : (scrapeFailed ? 'FAILED' : 'COMPLETED')
            }
        });

        // Publish update if part of a live search job
        if (jobId) {
            await redis.publish(
                `search:updates:${jobId}`,
                JSON.stringify([
                    {
                        place_id: updatedPlace.googleId,
                        emails: updatedPlace.emails || [],
                        emailScores: updatedPlace.emailScores || {},
                        socials: updatedPlace.socials || {},
                        website: updatedPlace.website,
                        scrapeStatus: updatedPlace.scrapeStatus,
                    },
                ])
            );
        }

        return enrichmentData;

    } catch (error) {
        console.error(`[Enrichment Worker] Job failed:`, error);
        await prisma.place.update({
            where: { id: placeId },
            data: { scrapeStatus: 'FAILED' }
        });
        throw error;
    }
}, {
    connection: redisConnection,
    concurrency: 5 // Process 5 scraping jobs in parallel
});

export default worker;
