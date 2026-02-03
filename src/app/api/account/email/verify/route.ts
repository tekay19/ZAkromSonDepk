import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { getAppUrl, getClientId, getUserAgent } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/rate-limit";
import { logAuditEvent } from "@/lib/auth/audit";

export async function GET(req: Request) {
    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`email:verify:${clientId}`, { limit: 10, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (!token) {
        return NextResponse.redirect(`${getAppUrl()}/auth/signin?emailChanged=0`);
    }

    const tokenHash = hashToken(token);
    const change = await prisma.emailChangeToken.findUnique({
        where: { tokenHash },
    });

    if (!change || change.usedAt || change.expires < new Date()) {
        return NextResponse.redirect(`${getAppUrl()}/auth/signin?emailChanged=0`);
    }

    const existing = await prisma.user.findUnique({ where: { email: change.newEmail } });
    if (existing && existing.id !== change.userId) {
        return NextResponse.redirect(`${getAppUrl()}/auth/signin?emailChanged=0`);
    }

    await prisma.$transaction([
        prisma.user.update({
            where: { id: change.userId },
            data: { email: change.newEmail, emailVerified: new Date() },
        }),
        prisma.emailChangeToken.update({
            where: { tokenHash },
            data: { usedAt: new Date() },
        }),
    ]);

    await logAuditEvent({
        userId: change.userId,
        action: "EMAIL_CHANGE_VERIFIED",
        ip: clientId,
        userAgent,
        metadata: { newEmail: change.newEmail },
    });

    return NextResponse.redirect(`${getAppUrl()}/auth/signin?emailChanged=1`);
}
