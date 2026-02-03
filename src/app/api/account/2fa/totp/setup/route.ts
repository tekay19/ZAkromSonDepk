import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { rateLimit } from "@/lib/auth/rate-limit";
import { generateTotpSecret, getTotpUri } from "@/lib/auth/totp";
import QRCode from "qrcode";

export async function POST() {
    const session = await auth();
    const userId = session?.user?.id;
    const email = session?.user?.email;
    if (!userId || !email) {
        return NextResponse.json({ ok: false, message: "Yetkisiz." }, { status: 401 });
    }

    const { allowed, retryAfter } = await rateLimit(`2fa:totp:setup:${userId}`, { limit: 5, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    const issuer = process.env.TOTP_ISSUER ?? "Zakrom";
    const secret = generateTotpSecret();
    const otpauthUrl = getTotpUri(email, issuer, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    return NextResponse.json({ ok: true, secret, otpauthUrl, qrDataUrl });
}
