"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function getSearchHistory(limit: number = 10) {
    const session = await auth();
    const userId = session?.user?.id || "default-user";

    try {
        const history = await (prisma.user as any).findUnique({
            where: { id: userId }
        }).searchHistory({
            orderBy: { createdAt: "desc" },
            take: limit
        });
        return history || [];
    } catch (error) {
        console.error("Failed to fetch search history:", error);
        return [];
    }
}
