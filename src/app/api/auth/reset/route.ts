import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { getClientId, getUserAgent } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/rate-limit";
import { isStrongPassword } from "@/lib/auth/validation";
import { logAuditEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`reset:${clientId}`, { limit: 5, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    let body: { token?: string; password?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const token = body.token ?? "";
    const password = body.password ?? "";
    if (!token || !isStrongPassword(password)) {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const resetToken = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expires < new Date()) {
        return NextResponse.json(
            { ok: false, message: "Sifirlama linki gecersiz veya suresi dolmus." },
            { status: 400 }
        );
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
        prisma.user.update({
            where: { id: resetToken.userId },
            data: {
                passwordHash,
            },
        }),
        prisma.passwordResetToken.update({
            where: { tokenHash },
            data: { usedAt: new Date() },
        }),
    ]);
    await logAuditEvent({
        userId: resetToken.userId,
        action: "PASSWORD_RESET_SUCCESS",
        ip: clientId,
        userAgent,
    });

    return NextResponse.json({ ok: true, message: "Sifreniz guncellendi." });
}
