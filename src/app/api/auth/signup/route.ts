import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { generateToken } from "@/lib/auth/tokens";
import { getAppUrl, getClientId, getUserAgent } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/rate-limit";
import { sendVerificationEmail } from "@/lib/auth/email";
import { logAuditEvent } from "@/lib/auth/audit";
import { PLANS } from "@/lib/plans";
import { z } from "zod";

const signupSchema = z.object({
    name: z.string().optional(),
    email: z.string().email("Gecersiz e-posta adresi."),
    password: z
        .string()
        .min(10, "Sifre en az 10 karakter olmalidir.")
        .regex(/[a-z]/, "Sifre kucuk harf icermelidir.")
        .regex(/[A-Z]/, "Sifre buyuk harf icermelidir.")
        .regex(/\d/, "Sifre rakam icermelidir.")
        .regex(/[^A-Za-z0-9]/, "Sifre sembol icermelidir."),
});

export async function POST(req: Request) {
    try {
        const clientId = getClientId(req);
        const userAgent = getUserAgent(req);

        // Global Error Handler wrapper to ensure JSON response
        try {
            const { allowed, retryAfter } = await rateLimit(`signup:${clientId}`, { limit: 5, windowMs: 60_000 });
            if (!allowed) {
                return NextResponse.json(
                    { ok: false, message: "Cok fazla deneme. Lutfen biraz sonra tekrar deneyin." },
                    { status: 429, headers: { "Retry-After": `${retryAfter}` } }
                );
            }

            let body;
            try {
                body = await req.json();
            } catch {
                return NextResponse.json({ ok: false, message: "Gecersiz JSON verisi." }, { status: 400 });
            }

            const result = signupSchema.safeParse(body);
            if (!result.success) {
                const errorMessage = result.error.issues?.[0]?.message || "Gecersiz veri.";
                return NextResponse.json(
                    { ok: false, message: errorMessage },
                    { status: 400 }
                );
            }

            const { email, password, name } = result.data;

            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing) {
                return NextResponse.json(
                    { ok: false, message: "Bu e-posta zaten kayitli." },
                    { status: 409 }
                );
            }

            const passwordHash = await hashPassword(password);
            const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

            // Default to FREE plan
            const defaultPlan = PLANS.FREE;

            const user = await prisma.user.create({
                data: {
                    email,
                    name,
                    passwordHash,
                    emailVerified: requireVerification ? null : new Date(),
                    twoFactorEnabled: true,
                    twoFactorEmailEnabled: true,
                    twoFactorTotpEnabled: false,
                    subscriptionTier: "FREE",
                    credits: defaultPlan.credits,
                },
            });


            await logAuditEvent({
                userId: user.id,
                action: "SIGNUP_SUCCESS",
                ip: clientId,
                userAgent,
            });

            if (requireVerification) {
                const { token, tokenHash } = generateToken();
                await prisma.emailVerificationToken.create({
                    data: {
                        userId: user.id,
                        tokenHash,
                        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    },
                });

                const verifyUrl = `${getAppUrl()}/api/auth/verify?token=${encodeURIComponent(token)}`;
                await sendVerificationEmail(email, verifyUrl);
                await logAuditEvent({
                    userId: user.id,
                    action: "EMAIL_VERIFICATION_SENT",
                    ip: clientId,
                    userAgent,
                });
            }

            return NextResponse.json({
                ok: true,
                message: requireVerification ? "Kayit olusturuldu. E-posta dogrulayiniz." : "Kayit olusturuldu.",
            });
        } catch (innerError) {
            console.error("[SIGNUP_LOGIC_ERROR]", innerError);
            return NextResponse.json(
                { ok: false, message: "Islem hatasi." },
                { status: 500 }
            );
        }


    } catch (error) {
        console.error("[SIGNUP_FATAL_ERROR]", error);
        return NextResponse.json(
            { ok: false, message: "Sunucu hatasi." },
            { status: 500 }
        );
    }
}
