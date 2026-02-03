import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type AuditInput = {
    userId?: string | null;
    action: string;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Prisma.InputJsonValue;
};

export async function logAuditEvent({ userId, action, ip, userAgent, metadata }: AuditInput) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: userId ?? null,
                action,
                ip: ip ?? null,
                userAgent: userAgent ?? null,
                metadata: metadata ?? undefined,
            },
        });
    } catch {
        // Avoid blocking auth flows if audit log fails.
    }
}
