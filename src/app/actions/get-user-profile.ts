"use server";

import { prisma } from "@/lib/prisma";

export async function getUserProfile(userId?: string) {
    if (!userId) return null;

    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    return user;
}
