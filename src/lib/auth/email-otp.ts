import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { sendTwoFactorEmail } from "@/lib/auth/email";
import { randomInt } from "crypto";

export async function issueEmailOtp(userId: string, email: string, ttlMinutes = 10) {
    await prisma.twoFactorToken.deleteMany({ where: { userId } });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const tokenHash = hashToken(code);
    await prisma.twoFactorToken.create({
        data: {
            userId,
            tokenHash,
            expires: new Date(Date.now() + ttlMinutes * 60 * 1000),
        },
    });
    await sendTwoFactorEmail(email, code);
}

export async function verifyEmailOtp(userId: string, code: string) {
    const tokenHash = hashToken(code);
    const token = await prisma.twoFactorToken.findFirst({
        where: {
            userId,
            tokenHash,
            usedAt: null,
            expires: { gt: new Date() },
        },
    });
    if (!token) return false;
    await prisma.twoFactorToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
    });
    return true;
}
