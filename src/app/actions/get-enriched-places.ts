"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { maskEmail } from "@/lib/masking";

export async function getEnrichedPlaces(placeIds: string[]) {
    if (!placeIds || placeIds.length === 0) {
        return [];
    }

    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Oturum açmanız gerekiyor.");
    }
    const userId = session.user.id;

    // Limit to prevent abuse
    const limitedIds = placeIds.slice(0, 200);

    const leads = await prisma.lead.findMany({
        where: { userId, place: { googleId: { in: limitedIds } } },
        select: {
            emailUnlocked: true,
            place: {
                select: {
                    googleId: true,
                    emails: true,
                    emailScores: true,
                    phones: true,
                    socials: true,
                    website: true,
                    scrapeStatus: true,
                },
            },
        },
    });

    return leads.map((l) => {
        const p = l.place;
        const emailUnlocked = Boolean(l.emailUnlocked);
        const emailCount = Array.isArray(p.emails) ? p.emails.length : 0;

        return {
            place_id: p.googleId,
            emailUnlocked,
            emailCount,
            emails: emailUnlocked ? (p.emails || []) : [],
            maskedEmails: !emailUnlocked && emailCount > 0 ? (p.emails || []).slice(0, 1).map(maskEmail) : [],
            emailScores: emailUnlocked ? (p.emailScores || {}) : {},
            phones: p.phones || [],
            socials: p.socials || {},
            website: p.website,
            scrapeStatus: p.scrapeStatus,
        };
    });
}
