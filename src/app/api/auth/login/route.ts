import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { getClientId, getUserAgent } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import { issueEmailOtp } from "@/lib/auth/email-otp";
import { logAuditEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`login:${clientId}`, { limit: 8, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    let body: { email?: string; password?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const emailRaw = body.email ?? "";
    const password = body.password ?? "";
    const email = normalizeEmail(emailRaw);

    if (!isValidEmail(email) || !password) {
        return NextResponse.json({ ok: false, message: "Gecersiz kimlik bilgileri." }, { status: 400 });
    }

    const emailLimit = await rateLimit(`login:email:${email}`, { limit: 5, windowMs: 60_000 });
    if (!emailLimit.allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${emailLimit.retryAfter}` } }
        );
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            emailVerified: true,
            passwordHash: true,
            twoFactorEmailEnabled: true,
            twoFactorTotpEnabled: true,
            totpSecretEnc: true,
            failedLoginCount: true,
            lockUntil: true,
            lastLoginIp: true,
            lastLoginUserAgent: true,
        },
    });

    if (!user?.passwordHash) {
        await logAuditEvent({
            action: "LOGIN_FAILED",
            ip: clientId,
            userAgent,
            metadata: { reason: "user_not_found" },
        });
        return NextResponse.json({ ok: false, message: "E-posta veya sifre hatali." }, { status: 401 });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
        await logAuditEvent({
            userId: user.id,
            action: "LOGIN_BLOCKED_LOCKED",
            ip: clientId,
            userAgent,
            metadata: { lockUntil: user.lockUntil.toISOString() },
        });
        return NextResponse.json(
            { ok: false, message: "Hesap gecici olarak kilitlendi. Lutfen biraz sonra tekrar deneyin." },
            { status: 423 }
        );
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
        const nextCount = user.failedLoginCount + 1;
        const shouldLock = nextCount >= 5;
        const lockUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : user.lockUntil ?? null;
        await prisma.user.update({
            where: { id: user.id },
            data: {
                failedLoginCount: nextCount,
                lockUntil,
            },
        });
        await logAuditEvent({
            userId: user.id,
            action: "LOGIN_FAILED",
            ip: clientId,
            userAgent,
            metadata: {
                reason: "bad_password",
                failedLoginCount: nextCount,
                lockUntil: lockUntil?.toISOString() ?? null,
            },
        });
        return NextResponse.json({ ok: false, message: "E-posta veya sifre hatali." }, { status: 401 });
    }

    if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerified) {
        await logAuditEvent({
            userId: user.id,
            action: "LOGIN_BLOCKED_UNVERIFIED",
            ip: clientId,
            userAgent,
        });
        return NextResponse.json(
            { ok: false, message: "Giris basarisiz veya e-posta dogrulanmamis." },
            { status: 403 }
        );
    }

    const requireTwoFactor =
        process.env.REQUIRE_2FA === "true" || user.twoFactorEmailEnabled || user.twoFactorTotpEnabled;
    if (requireTwoFactor) {
        const methods: Array<"email" | "totp"> = [];
        const hasTotp = user.twoFactorTotpEnabled && user.totpSecretEnc;
        if (hasTotp) {
            methods.push("totp");
        }
        const shouldUseEmail =
            user.twoFactorEmailEnabled || (process.env.REQUIRE_2FA === "true" && !hasTotp);
        if (shouldUseEmail) {
            await issueEmailOtp(user.id, email);
            methods.push("email");
        }
        await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: 0, lockUntil: null },
        });
        await logAuditEvent({
            userId: user.id,
            action: "LOGIN_2FA_REQUIRED",
            ip: clientId,
            userAgent,
        });
        return NextResponse.json({ ok: true, requiresTwoFactor: true, methods });
    }

    try {
        const redirectUrl = await signIn("credentials", {
            email,
            password,
            redirect: false,
            redirectTo: "/dashboard",
        });
        const redirectValue = typeof redirectUrl === "string" ? redirectUrl : "/dashboard";
        if (redirectValue.includes("error=")) {
            return NextResponse.json(
                { ok: false, message: "E-posta veya sifre hatali." },
                { status: 401 }
            );
        }
        await prisma.user.update({
            where: { id: user.id },
            data: {
                failedLoginCount: 0,
                lockUntil: null,
                lastLoginAt: new Date(),
                lastLoginIp: clientId,
                lastLoginUserAgent: userAgent,
            },
        });
        if (user.lastLoginIp && user.lastLoginIp !== clientId) {
            await logAuditEvent({
                userId: user.id,
                action: "ANOMALY_NEW_IP",
                ip: clientId,
                userAgent,
                metadata: { previousIp: user.lastLoginIp },
            });
        }
        if (user.lastLoginUserAgent && user.lastLoginUserAgent !== userAgent) {
            await logAuditEvent({
                userId: user.id,
                action: "ANOMALY_NEW_USER_AGENT",
                ip: clientId,
                userAgent,
                metadata: { previousUserAgent: user.lastLoginUserAgent },
            });
        }
        await logAuditEvent({
            userId: user.id,
            action: "LOGIN_SUCCESS",
            ip: clientId,
            userAgent,
        });
        return NextResponse.json({ ok: true, redirectUrl: redirectValue });
    } catch (error) {
        if (error instanceof AuthError) {
            await logAuditEvent({
                userId: user.id,
                action: "LOGIN_FAILED",
                ip: clientId,
                userAgent,
                metadata: { reason: "auth_error" },
            });
            return NextResponse.json(
                { ok: false, message: "E-posta veya sifre hatali." },
                { status: 401 }
            );
        }
        throw error;
    }
}
