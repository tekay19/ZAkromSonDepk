import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth/tokens";
import { getAppUrl, getClientId, getUserAgent } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import { sendPasswordResetEmail } from "@/lib/auth/email";
import { logAuditEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`forgot:${clientId}`, { limit: 5, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    let body: { email?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const emailRaw = body.email ?? "";
    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) {
        return NextResponse.json({ ok: true, message: "Eger kayitliysa e-posta gonderildi." });
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true },
    });

    if (user?.id && user.passwordHash) {
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        const { token, tokenHash } = generateToken();
        await prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                tokenHash,
                expires: new Date(Date.now() + 60 * 60 * 1000),
            },
        });
        const resetUrl = `${getAppUrl()}/auth/reset?token=${encodeURIComponent(token)}`;
        await sendPasswordResetEmail(email, resetUrl);
        await logAuditEvent({
            userId: user.id,
            action: "PASSWORD_RESET_REQUEST",
            ip: clientId,
            userAgent,
        });
    }

    return NextResponse.json({ ok: true, message: "Eger kayitliysa e-posta gonderildi." });
}
