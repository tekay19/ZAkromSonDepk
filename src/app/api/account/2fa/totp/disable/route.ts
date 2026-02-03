import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getClientId, getUserAgent } from "@/lib/auth/request";
import { logAuditEvent } from "@/lib/auth/audit";

export async function POST(req: NextRequest) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ ok: false, message: "Yetkisiz." }, { status: 401 });
    }

    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`2fa:totp:disable:${userId}`, { limit: 5, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorEmailEnabled: true },
    });

    if (process.env.REQUIRE_2FA === "true" && !user?.twoFactorEmailEnabled) {
        return NextResponse.json(
            { ok: false, message: "Global 2FA zorunlu. E-posta 2FA acik olmali." },
            { status: 400 }
        );
    }

    await prisma.user.update({
        where: { id: userId },
        data: {
            totpSecretEnc: null,
            twoFactorTotpEnabled: false,
            twoFactorEnabled: Boolean(user?.twoFactorEmailEnabled),
        },
    });

    await logAuditEvent({
        userId,
        action: "2FA_TOTP_DISABLED",
        ip: clientId,
        userAgent,
    });

    return NextResponse.json({ ok: true });
}
