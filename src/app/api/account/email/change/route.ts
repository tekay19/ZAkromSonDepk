import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getAppUrl, getClientId, getUserAgent } from "@/lib/auth/request";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import { verifyPassword } from "@/lib/auth/password";
import { issueEmailOtp, verifyEmailOtp } from "@/lib/auth/email-otp";
import { decryptSecret } from "@/lib/auth/encryption";
import { verifyTotp } from "@/lib/auth/totp";
import { generateToken } from "@/lib/auth/tokens";
import { sendEmailChangeEmail } from "@/lib/auth/email";
import { logAuditEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ ok: false, message: "Yetkisiz." }, { status: 401 });
    }

    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`email:change:${userId}`, { limit: 5, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    let body: { newEmail?: string; password?: string; otp?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const newEmailRaw = body.newEmail ?? "";
    const newEmail = normalizeEmail(newEmailRaw);
    if (!isValidEmail(newEmail)) {
        return NextResponse.json({ ok: false, message: "Gecersiz e-posta adresi." }, { status: 400 });
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

    if (user?.email && normalizeEmail(user.email) === newEmail) {
        return NextResponse.json({ ok: false, message: "Yeni e-posta mevcut ile ayni." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing) {
        return NextResponse.json({ ok: false, message: "Bu e-posta zaten kayitli." }, { status: 409 });
    }

    let verified = false;
    if (user.passwordHash && body.password) {
        verified = await verifyPassword(body.password, user.passwordHash);
        if (!verified) {
            return NextResponse.json({ ok: false, message: "Mevcut sifre hatali." }, { status: 401 });
        }
    } else if (body.otp) {
        const otp = body.otp;
        if (user.twoFactorTotpEnabled && user.totpSecretEnc) {
            try {
                const secret = decryptSecret(user.totpSecretEnc);
                if (verifyTotp(otp, secret)) {
                    verified = true;
                }
            } catch {
                // fall back to email OTP
            }
        }
        if (!verified && user.twoFactorEmailEnabled) {
            verified = await verifyEmailOtp(userId, otp);
        }
        if (!verified) {
            return NextResponse.json({ ok: false, message: "Dogrulama kodu hatali." }, { status: 401 });
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
    } else if (!user.passwordHash) {
        return NextResponse.json(
            { ok: false, message: "Once bir sifre belirleyin veya 2FA etkinlestirin." },
            { status: 400 }
        );
    }

    if (!verified) {
        return NextResponse.json(
            { ok: false, message: user.passwordHash ? "Mevcut sifre gerekli." : "Dogrulama gerekli." },
            { status: 401 }
        );
    }

    await prisma.emailChangeToken.deleteMany({ where: { userId } });
    const { token, tokenHash } = generateToken();
    await prisma.emailChangeToken.create({
        data: {
            userId,
            newEmail,
            tokenHash,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
    });

    const verifyUrl = `${getAppUrl()}/api/account/email/verify?token=${encodeURIComponent(token)}`;
    await sendEmailChangeEmail(newEmail, verifyUrl);
    await logAuditEvent({
        userId,
        action: "EMAIL_CHANGE_REQUESTED",
        ip: clientId,
        userAgent,
        metadata: { newEmail },
    });

    return NextResponse.json({ ok: true, message: "Yeni e-posta adresine dogrulama gonderildi." });
}
