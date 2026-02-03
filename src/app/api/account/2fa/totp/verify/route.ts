import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getClientId, getUserAgent } from "@/lib/auth/request";
import { verifyTotp } from "@/lib/auth/totp";
import { encryptSecret } from "@/lib/auth/encryption";
import { logAuditEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ ok: false, message: "Yetkisiz." }, { status: 401 });
    }

    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`2fa:totp:verify:${userId}`, { limit: 8, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    let body: { secret?: string; code?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const secret = body.secret ?? "";
    const code = body.code ?? "";
    if (!secret || !code) {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const isValid = verifyTotp(code, secret);
    if (!isValid) {
        return NextResponse.json({ ok: false, message: "Kod dogrulanamadi." }, { status: 400 });
    }

    let encryptedSecret: string;
    try {
        encryptedSecret = encryptSecret(secret);
    } catch (error) {
        return NextResponse.json(
            { ok: false, message: "TOTP sifreleme anahtari eksik." },
            { status: 500 }
        );
    }

    await prisma.user.update({
        where: { id: userId },
        data: {
            totpSecretEnc: encryptedSecret,
            twoFactorTotpEnabled: true,
            twoFactorEnabled: true,
        },
    });

    await logAuditEvent({
        userId,
        action: "2FA_TOTP_ENABLED",
        ip: clientId,
        userAgent,
    });

    return NextResponse.json({ ok: true });
}
