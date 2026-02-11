"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlaceResult } from "@/lib/types";
import { maskEmail } from "@/lib/masking";

export async function getLeads(limit: number = 100): Promise<PlaceResult[]> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Oturum açmanız gerekiyor.");
    }
    const userId = session.user.id;

    try {
        const leads = await prisma.lead.findMany({
            where: {
                userId,
            },
            include: {
                place: true
            },
            orderBy: {
                updatedAt: 'desc'
            },
            take: Math.min(Math.max(1, limit), 500) // Keep payload bounded
        });

        // Map to PlaceResult interface
        return leads.map(lead => {
            const p = lead.place;
            const emailUnlocked = Boolean(lead.emailUnlocked);
            const emails = Array.isArray(p.emails) ? p.emails : [];
            const emailCount = emails.length;
            return {
                place_id: p.googleId,
                name: p.name,
                formatted_address: p.address || "",
                formatted_phone_number: p.phone || undefined,
                website: p.website || undefined,
                rating: p.rating || undefined,
                user_ratings_total: p.userRatingsTotal || undefined,
                types: p.types,
                location: (p.latitude && p.longitude) ? {
                    latitude: p.latitude,
                    longitude: p.longitude
                } : undefined,
                emails: emailUnlocked ? emails : [],
                maskedEmails: !emailUnlocked && emailCount > 0 ? emails.slice(0, 1).map(maskEmail) : [],
                emailCount,
                emailUnlocked,
                scrapeStatus: (p as any).scrapeStatus,
                socials: p.socials as any || undefined, // Typesafe casting if needed
                // We might not have photos or extensive details stored in Place yet, 
                // or we rely on them being optional in PlaceResult
                // If we saved photos in Place, we would map them here. 
                // For now, Place model doesn't seem to store photos explicitly in schema? 
                // Checking schema: Place has no 'photos' field. OK.
            };
        });
    } catch (error) {
        console.error("Failed to fetch leads:", error);
        return [];
    }
}
