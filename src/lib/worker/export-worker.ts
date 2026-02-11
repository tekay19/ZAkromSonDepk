import { Worker, Job } from "bullmq";
import { redisConnection } from "../queue/config";
import ExcelJS from "exceljs";
import { redis } from "../redis";
import { prisma } from "@/lib/prisma";
import { Scraper } from "@/lib/scraper";
import { validateEmails } from "@/lib/email-validator";
import { PLANS, SubscriptionTier } from "@/lib/plans";

const EXPORT_QUEUE_NAME = "export-jobs";

const worker = new Worker(EXPORT_QUEUE_NAME, async (job: Job) => {
    const { placeIds, format, userId, jobId, includeEmails } = job.data as {
        placeIds: string[];
        format: "csv" | "xlsx" | "json";
        userId: string;
        jobId: string;
        includeEmails?: boolean;
    };

    console.log(`Processing export for user ${userId}, job ${job.id}`);

    await redis.set(`export:${jobId}:status`, "processing", "EX", 3600);
    await redis.set(`export:${jobId}:format`, format, "EX", 3600);

    const scraper = new Scraper();
    try {
        const uniqueIds = Array.from(new Set((placeIds || []).filter(Boolean))).slice(0, 2000);
        if (uniqueIds.length === 0) {
            throw new Error("Dışa aktarılacak kayıt bulunamadı.");
        }

        const [user, leads] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: { subscriptionTier: true },
            }),
            prisma.lead.findMany({
                where: { userId, place: { googleId: { in: uniqueIds } } },
                select: {
                    emailUnlocked: true,
                    place: {
                        select: {
                            id: true,
                            googleId: true,
                            name: true,
                            address: true,
                            phone: true,
                            website: true,
                            rating: true,
                            userRatingsTotal: true,
                            latitude: true,
                            longitude: true,
                            types: true,
                            emails: true,
                            emailScores: true,
                            phones: true,
                            socials: true,
                            scrapeStatus: true,
                        },
                    },
                },
            }),
        ]);

        const tier = (user?.subscriptionTier as SubscriptionTier) || "FREE";
        const plan = PLANS[tier] || PLANS.FREE;
        const maxScrapes = tier === "BUSINESS" ? 500 : 200;
        const shouldIncludeEmails = Boolean(includeEmails);

        const leadByGoogleId = new Map(leads.map((l) => [l.place.googleId, l]));
        const ordered = uniqueIds
            .map((id) => leadByGoogleId.get(id))
            .filter(Boolean) as typeof leads;

        // Best-effort enrichment during export (only for unlocked leads).
        let scrapeCount = 0;
        if (shouldIncludeEmails && plan.features.emailEnrichment) {
            for (const l of ordered) {
                if (!l.emailUnlocked) continue;
                const p = l.place;
                const hasEmails = Array.isArray(p.emails) && p.emails.length > 0;
                const canScrape =
                    !hasEmails &&
                    Boolean(p.website) &&
                    scrapeCount < maxScrapes &&
                    !["PROCESSING"].includes(p.scrapeStatus);

                if (!canScrape) continue;

                try {
                    scrapeCount++;
                    await prisma.place.update({
                        where: { id: p.id },
                        data: { scrapeStatus: "PROCESSING" },
                    });

                    const scrapeRes = await scraper.scrapeWebsite(p.website!);
                    const validated = await validateEmails(scrapeRes.emails || [], p.website, 40);
                    const nextEmails = validated.map((v) => v.email);
                    const nextScores = validated.reduce((acc: Record<string, number>, curr) => {
                        acc[curr.email] = curr.score;
                        return acc;
                    }, {});

                    const updated = await prisma.place.update({
                        where: { id: p.id },
                        data: {
                            emails: nextEmails,
                            emailScores: nextScores,
                            socials: scrapeRes.socials || {},
                            scrapeStatus: "COMPLETED",
                        },
                        select: {
                            emails: true,
                            emailScores: true,
                            socials: true,
                            scrapeStatus: true,
                        },
                    });

                    p.emails = updated.emails as any;
                    (p as any).emailScores = updated.emailScores as any;
                    p.socials = updated.socials as any;
                    p.scrapeStatus = updated.scrapeStatus as any;
                } catch (e) {
                    await prisma.place.update({
                        where: { id: p.id },
                        data: { scrapeStatus: "FAILED" },
                    }).catch(() => { });
                }
            }
        }

        if (format === "xlsx") {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet("Arama Sonuçları");

            sheet.columns = [
                { header: "İşletme Adı", key: "name", width: 30 },
                { header: "Adres", key: "address", width: 50 },
                { header: "Telefon", key: "phone", width: 20 },
                { header: "Web Sitesi", key: "website", width: 30 },
                { header: "E-postalar", key: "emails", width: 40 },
                { header: "Bulunan Telefonlar", key: "scraped_phones", width: 30 },
                { header: "Instagram", key: "instagram", width: 30 },
                { header: "Facebook", key: "facebook", width: 30 },
                { header: "LinkedIn", key: "linkedin", width: 30 },
                { header: "Puan", key: "rating", width: 10 },
                { header: "Yorum Sayısı", key: "reviews", width: 15 },
                { header: "Kategori", key: "category", width: 20 },
            ];

            ordered.forEach((l) => {
                const p = l.place;
                const finalEmails = shouldIncludeEmails && l.emailUnlocked ? (p.emails || []) : [];
                const finalSocials = (p.socials as any) || {};
                const emailsStr = Array.isArray(finalEmails) ? finalEmails.join(", ") : "";

                sheet.addRow({
                    name: p.name,
                    address: p.address || "-",
                    phone: p.phone || "-",
                    website: p.website || "-",
                    emails: emailsStr || "-",
                    scraped_phones: (p.phones || []).join(", ") || "-",
                    instagram: finalSocials.instagram || "-",
                    facebook: finalSocials.facebook || "-",
                    linkedin: finalSocials.linkedin || "-",
                    rating: p.rating ?? "-",
                    reviews: p.userRatingsTotal ?? 0,
                    category: p.types?.[0] || "-",
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            // Store buffer in Redis temporarily (or S3 in production)
            const base64 = (buffer as any).toString("base64");
            await redis.set(`export:${jobId}:result`, base64, "EX", 3600);
            await redis.set(`export:${jobId}:status`, "completed", "EX", 3600);
        } else if (format === "csv") {
            // CSV Logic simplified
            const header = "İşletme Adı,Adres,Telefon,Web Sitesi,E-postalar,Bulunan Telefonlar,Instagram,Facebook,LinkedIn,Puan,Yorum Sayısı,Kategori\n";
            const rows = ordered.map((l) => {
                const p = l.place;
                const finalEmails = shouldIncludeEmails && l.emailUnlocked ? (p.emails || []) : [];
                const finalSocials = (p.socials as any) || {};

                const emails = finalEmails.join("; ");
                const phones = (p.phones || []).join("; ");
                const socialInsta = finalSocials.instagram || "";
                const socialFb = finalSocials.facebook || "";
                const socialLi = finalSocials.linkedin || "";

                return `"${(p.name || "").replace(/\"/g, "\"\"")}","${(p.address || "-").replace(/\"/g, "\"\"")}","${(p.phone || "-").replace(/\"/g, "\"\"")}","${(p.website || "-").replace(/\"/g, "\"\"")}","${emails.replace(/\"/g, "\"\"")}","${phones.replace(/\"/g, "\"\"")}","${socialInsta.replace(/\"/g, "\"\"")}","${socialFb.replace(/\"/g, "\"\"")}","${socialLi.replace(/\"/g, "\"\"")}","${p.rating ?? "-"}","${p.userRatingsTotal ?? 0}","${(p.types?.[0] || "-").replace(/\"/g, "\"\"")}"`;
            }).join("\n");

            await redis.set(`export:${jobId}:result`, header + rows, "EX", 3600);
            await redis.set(`export:${jobId}:status`, "completed", "EX", 3600);
        } else {
            // JSON
            const payload = ordered.map((l) => {
                const p = l.place;
                const finalEmails = shouldIncludeEmails && l.emailUnlocked ? (p.emails || []) : [];
                return {
                    place_id: p.googleId,
                    name: p.name,
                    address: p.address,
                    phone: p.phone,
                    website: p.website,
                    rating: p.rating,
                    reviews: p.userRatingsTotal,
                    types: p.types,
                    location: (p.latitude && p.longitude) ? { latitude: p.latitude, longitude: p.longitude } : null,
                    emails: finalEmails,
                    emailScores: shouldIncludeEmails && l.emailUnlocked ? (p.emailScores || {}) : {},
                    phones: p.phones || [],
                    socials: p.socials || {},
                    scrapeStatus: p.scrapeStatus,
                };
            });

            await redis.set(`export:${jobId}:result`, JSON.stringify(payload, null, 2), "EX", 3600);
            await redis.set(`export:${jobId}:status`, "completed", "EX", 3600);
        }
    } catch (err: any) {
        console.error("Export failed", err);
        await redis.set(`export:${jobId}:status`, "failed", "EX", 3600);
        await redis.set(`export:${jobId}:error`, err.message, "EX", 3600);
    } finally {
        await scraper.close().catch(() => { });
    }
}, { connection: redisConnection });

export default worker;
