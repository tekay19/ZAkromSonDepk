import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { getAppUrl, getClientId, getUserAgent } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/rate-limit";
import { logAuditEvent } from "@/lib/auth/audit";

export async function GET(req: Request) {
    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`verify:${clientId}`, { limit: 10, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (!token) {
        return NextResponse.redirect(`${getAppUrl()}/auth/signin?verified=0`);
    }

    const tokenHash = hashToken(token);
    const verification = await prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
    });

    if (!verification || verification.usedAt || verification.expires < new Date()) {
        return NextResponse.redirect(`${getAppUrl()}/auth/signin?verified=0`);
    }

    await prisma.$transaction([
        prisma.user.update({
            where: { id: verification.userId },
            data: { emailVerified: new Date() },
        }),
        prisma.emailVerificationToken.update({
            where: { tokenHash },
            data: { usedAt: new Date() },
        }),
    ]);
    await logAuditEvent({
        userId: verification.userId,
        action: "EMAIL_VERIFIED",
        ip: clientId,
        userAgent,
    });

    return NextResponse.redirect(`${getAppUrl()}/auth/signin?verified=1`);
}
