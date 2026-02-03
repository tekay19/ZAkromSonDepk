import { NextResponse } from "next/server";
import { searchPlaces } from "@/app/actions/search-places";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const city = searchParams.get("city") || "İstanbul";
    const keyword = searchParams.get("keyword") || "Kafe";
    const pageToken = searchParams.get("pageToken") || undefined;
    const deepSearch = searchParams.get("deepSearch") === "true";
    const targetTier = searchParams.get("targetTier");

    if (!email) {
        return NextResponse.json({ error: "Email parameter required" }, { status: 400 });
    }

    try {
        let user = await prisma.user.findFirst({ where: { email } });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (targetTier) {
            const tierEnum = targetTier as any; // Simple cast
            await prisma.user.update({
                where: { id: user.id },
                data: { subscriptionTier: tierEnum }
            });
            user = await prisma.user.findUnique({ where: { id: user.id } });
            if (!user) {
                return NextResponse.json({ error: "User re-fetch failed" }, { status: 500 });
            }
            console.log(`Updated user tier to ${targetTier}`);
        }

        console.log(`Testing search for user ${user.email} (${user.id}). Credits: ${user.credits}, Tier: ${user.subscriptionTier}`);

        try {
            const results = await searchPlaces(city, keyword, undefined, pageToken, user.id, deepSearch);

            // Re-fetch user to check credit deduction
            const updatedUser = await prisma.user.findFirst({ where: { id: user.id } });

            return NextResponse.json({
                success: true,
                user: {
                    email: updatedUser?.email,
                    creditsBefore: user.credits,
                    creditsAfter: updatedUser?.credits,
                    creditsDeducted: (user.credits || 0) - (updatedUser?.credits || 0)
                },
                search: {
                    city,
                    keyword,
                    resultCount: results.places.length,
                    nextPageToken: results.nextPageToken,
                    jobId: results.jobId
                },
                results: results.places.map((p: any) => ({ name: p.name, id: p.place_id }))
            });
        } catch (searchError: any) {
            return NextResponse.json({
                error: "Search execution failed",
                details: searchError.message
            }, { status: 500 });
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
