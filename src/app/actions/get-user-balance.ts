"use server";

import { prisma } from "@/lib/prisma";

export async function getUserBalance(userId?: string) {
    if (!userId) {
        return 0;
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true }
    });

    return user?.credits ?? 0;
}
