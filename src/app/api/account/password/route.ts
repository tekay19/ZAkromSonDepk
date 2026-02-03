import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getClientId, getUserAgent } from "@/lib/auth/request";
import { isStrongPassword } from "@/lib/auth/validation";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { logAuditEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ ok: false, message: "Yetkisiz." }, { status: 401 });
    }

    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`password:${userId}`, { limit: 5, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    let body: { currentPassword?: string; newPassword?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";
    if (!isStrongPassword(newPassword)) {
        return NextResponse.json(
            { ok: false, message: "Yeni sifre yeterince guclu degil." },
            { status: 400 }
        );
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
    });

    if (user?.passwordHash) {
        const isValid = await verifyPassword(currentPassword, user.passwordHash);
        if (!isValid) {
            await logAuditEvent({
                userId,
                action: "PASSWORD_CHANGE_FAILED",
                ip: clientId,
                userAgent,
                metadata: { reason: "invalid_current_password" },
            });
            return NextResponse.json({ ok: false, message: "Mevcut sifre hatali." }, { status: 401 });
        }
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
        where: { id: userId },
        data: {
            passwordHash,
            failedLoginCount: 0,
            lockUntil: null,
        },
    });

    await logAuditEvent({
        userId,
        action: "PASSWORD_CHANGE_SUCCESS",
        ip: clientId,
        userAgent,
    });

    return NextResponse.json({ ok: true });
}
