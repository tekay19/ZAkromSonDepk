import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getClientId, getUserAgent } from "@/lib/auth/request";
import { verifyPassword } from "@/lib/auth/password";
import { decryptSecret } from "@/lib/auth/encryption";
import { verifyTotp } from "@/lib/auth/totp";
import { issueEmailOtp, verifyEmailOtp } from "@/lib/auth/email-otp";
import { logAuditEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ ok: false, message: "Yetkisiz." }, { status: 401 });
    }

    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`account:delete:${userId}`, { limit: 3, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    let body: { confirm?: string; password?: string; otp?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    if (body.confirm !== "DELETE") {
        return NextResponse.json({ ok: false, message: "Onay metni hatali." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            email: true,
            passwordHash: true,
            twoFactorEmailEnabled: true,
            twoFactorTotpEnabled: true,
            totpSecretEnc: true,
        },
    });

    if (!user) {
        return NextResponse.json({ ok: false, message: "Kullanici bulunamadi." }, { status: 404 });
    }

    let verified = false;
    if (user.passwordHash && body.password) {
        verified = await verifyPassword(body.password, user.passwordHash);
    } else if (body.otp) {
        if (user.twoFactorTotpEnabled && user.totpSecretEnc) {
            try {
                const secret = decryptSecret(user.totpSecretEnc);
                if (verifyTotp(body.otp, secret)) {
                    verified = true;
                }
            } catch {
                // fallback to email OTP
            }
        }
        if (!verified && user.twoFactorEmailEnabled) {
            verified = await verifyEmailOtp(userId, body.otp);
        }
    } else if (!user.passwordHash && (user.twoFactorTotpEnabled || user.twoFactorEmailEnabled)) {
        const methods: Array<"email" | "totp"> = [];
        if (user.twoFactorTotpEnabled && user.totpSecretEnc) {
            methods.push("totp");
        }
        if (user.twoFactorEmailEnabled && user.email) {
            await issueEmailOtp(userId, user.email);
            methods.push("email");
        }
        return NextResponse.json({ ok: true, requiresTwoFactor: true, methods });
    }

    if (!verified) {
        await logAuditEvent({
            userId,
            action: "ACCOUNT_DELETE_FAILED",
            ip: clientId,
            userAgent,
        });
        return NextResponse.json({ ok: false, message: "Dogrulama basarisiz." }, { status: 401 });
    }

    await logAuditEvent({
        userId,
        action: "ACCOUNT_DELETE_REQUESTED",
        ip: clientId,
        userAgent,
    });

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ ok: true });
}
