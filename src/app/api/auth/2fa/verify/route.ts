import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getClientId, getUserAgent } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`2fa:${clientId}`, { limit: 8, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    let body: { email?: string; code?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const emailRaw = body.email ?? "";
    const code = body.code ?? "";
    const email = normalizeEmail(emailRaw);

    if (!isValidEmail(email) || !code) {
        return NextResponse.json({ ok: false, message: "Gecersiz kod." }, { status: 400 });
    }

    const emailLimit = await rateLimit(`2fa:email:${email}`, { limit: 6, windowMs: 60_000 });
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
            lastLoginIp: true,
            lastLoginUserAgent: true,
        },
    });

    try {
        const redirectUrl = await signIn("credentials", {
            email,
            otp: code,
            redirect: false,
            redirectTo: "/dashboard",
        });
        const redirectValue = typeof redirectUrl === "string" ? redirectUrl : "/dashboard";
        if (redirectValue.includes("error=")) {
            return NextResponse.json(
                { ok: false, message: "Kod hatali veya suresi dolmus." },
                { status: 401 }
            );
        }
        if (user?.id) {
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
                action: "LOGIN_2FA_SUCCESS",
                ip: clientId,
                userAgent,
            });
        }
        return NextResponse.json({ ok: true, redirectUrl: redirectValue });
    } catch (error) {
        if (error instanceof AuthError) {
            if (user?.id) {
                await logAuditEvent({
                    userId: user.id,
                    action: "LOGIN_2FA_FAILED",
                    ip: clientId,
                    userAgent,
                });
            }
            return NextResponse.json(
                { ok: false, message: "Kod hatali veya suresi dolmus." },
                { status: 401 }
            );
        }
        throw error;
    }
}
