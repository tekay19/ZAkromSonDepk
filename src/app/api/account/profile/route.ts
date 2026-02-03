import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getClientId, getUserAgent } from "@/lib/auth/request";
import { logAuditEvent } from "@/lib/auth/audit";

export async function PATCH(req: Request) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ ok: false, message: "Yetkisiz." }, { status: 401 });
    }

    const clientId = getClientId(req);
    const userAgent = getUserAgent(req);
    const { allowed, retryAfter } = await rateLimit(`profile:${userId}`, { limit: 10, windowMs: 60_000 });
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
            { status: 429, headers: { "Retry-After": `${retryAfter}` } }
        );
    }

    let body: { name?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, message: "Gecersiz istek." }, { status: 400 });
    }

    const name = (body.name ?? "").trim();
    if (name.length > 80) {
        return NextResponse.json({ ok: false, message: "Isim cok uzun." }, { status: 400 });
    }

    await prisma.user.update({
        where: { id: userId },
        data: { name: name || null },
    });

    await logAuditEvent({
        userId,
        action: "PROFILE_UPDATED",
        ip: clientId,
        userAgent,
        metadata: { fields: ["name"] },
    });

    return NextResponse.json({ ok: true });
}
