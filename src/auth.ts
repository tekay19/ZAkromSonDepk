import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import authConfig from "./auth.config";
import { normalizeEmail } from "@/lib/auth/validation";
import { verifyPassword } from "@/lib/auth/password";
import { decryptSecret } from "@/lib/auth/encryption";
import { verifyTotp } from "@/lib/auth/totp";
import { verifyEmailOtp } from "@/lib/auth/email-otp";

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    ...authConfig,
    providers: [
        ...(authConfig.providers ?? []),
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
                otp: { label: "OTP", type: "text" },
            },
            async authorize(credentials) {
                const emailRaw = credentials?.email;
                const password = credentials?.password;
                const otp = credentials?.otp;

                if (typeof emailRaw !== "string") return null;

                const email = normalizeEmail(emailRaw);
                const user = await prisma.user.findUnique({
                    where: { email },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        image: true,
                        passwordHash: true,
                        emailVerified: true,
                        twoFactorEmailEnabled: true,
                        twoFactorTotpEnabled: true,
                        totpSecretEnc: true,
                    },
                });

                if (!user?.passwordHash) return null;

                if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerified) {
                    return null;
                }

                if (typeof otp === "string" && otp.length > 0) {
                    const totpEnabled = user.twoFactorTotpEnabled && user.totpSecretEnc;
                    const emailEnabled =
                        user.twoFactorEmailEnabled || (process.env.REQUIRE_2FA === "true" && !totpEnabled);
                    if (!totpEnabled && !emailEnabled) {
                        return null;
                    }
                    if (totpEnabled) {
                        try {
                            const secret = decryptSecret(user.totpSecretEnc!);
                            const valid = verifyTotp(otp, secret);
                            if (valid) {
                                return {
                                    id: user.id,
                                    email: user.email,
                                    name: user.name,
                                    image: user.image,
                                };
                            }
                        } catch {
                            // fall through to email OTP
                        }
                    }
                    if (emailEnabled) {
                        const validEmailOtp = await verifyEmailOtp(user.id, otp);
                        if (!validEmailOtp) return null;
                    } else {
                        return null;
                    }
                } else {
                    if (typeof password !== "string") return null;
                    const isValid = await verifyPassword(password, user.passwordHash);
                    if (!isValid) return null;
                    if (
                        user.twoFactorEmailEnabled ||
                        user.twoFactorTotpEnabled ||
                        process.env.REQUIRE_2FA === "true"
                    ) {
                        return null;
                    }
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.image,
                };
            },
        }),
    ],
    pages: {
        signIn: "/auth/signin",
    },
    callbacks: {
        ...authConfig.callbacks,
        async signIn({ user, account, profile }) {
            if (
                process.env.REQUIRE_EMAIL_VERIFICATION === "true" &&
                account?.provider &&
                account.provider !== "credentials"
            ) {
                if (!user?.email) return false;
                const dbUser = await prisma.user.findUnique({
                    where: { email: user.email },
                    select: { emailVerified: true },
                });
                if (!dbUser?.emailVerified) {
                    const isVerified = Boolean((profile as { email_verified?: boolean } | null)?.email_verified);
                    if (isVerified) {
                        await prisma.user.update({
                            where: { email: user.email },
                            data: { emailVerified: new Date() },
                        });
                        return true;
                    }
                    return false;
                }
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                // High load optimization: minimize DB calls
                const dbUser = await prisma.user.findUnique({
                    where: { id: user.id },
                    select: { credits: true, subscriptionTier: true }
                });
                token.credits = dbUser?.credits || 0;
                token.subscriptionTier = dbUser?.subscriptionTier || "FREE";
            }
            return token;
        },
        async session({ session, token }: any) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.credits = token.credits;
                session.user.subscriptionTier = token.subscriptionTier;
            }
            return session;
        },
    },
});
