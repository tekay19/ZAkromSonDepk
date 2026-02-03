"use server";

import { prisma } from "@/lib/prisma";
import { PlaceResult } from "@/components/ResultsTable";

export async function getLeads(userId: string): Promise<PlaceResult[]> {
    try {
        const leads = await prisma.lead.findMany({
            where: {
                userId: userId,
                place: {
                    emails: {
                        isEmpty: false
                    }
                }
            },
            include: {
                place: true
            },
            orderBy: {
                updatedAt: 'desc'
            },
            take: 100 // Limit for now to avoid massive payloads
        });

        // Map to PlaceResult interface
        return leads.map(lead => {
            const p = lead.place;
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
                emails: p.emails,
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
