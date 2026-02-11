import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type AuditInput = {
    userId?: string | null;
    action: string;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Prisma.InputJsonValue;
};

export async function logAuditEvent({ userId, action, ip, userAgent, metadata }: AuditInput) {
    try {
        const payload = {
            ts: new Date().toISOString(),
            action,
            userId: userId ?? null,
            ip: ip ?? null,
            userAgent: userAgent ?? null,
            metadata: metadata ?? null,
        };

        if (process.env.AUDIT_LOG_CONSOLE === "true" || process.env.NODE_ENV !== "production") {
            // Keep logs easy to scan while developing.
            console.info(`[AUDIT] ${action}`, payload);
        }

        // Optional local file sink (useful for `tail -f` during dev).
        // Format: JSONL (one event per line).
        const logFile = process.env.AUDIT_LOG_FILE;
        if (typeof logFile === "string" && logFile.trim().length > 0) {
            const fullPath = path.isAbsolute(logFile) ? logFile : path.join(process.cwd(), logFile);
            void (async () => {
                await mkdir(path.dirname(fullPath), { recursive: true });
                await appendFile(fullPath, JSON.stringify(payload) + "\n", "utf8");
            })().catch(() => {});
        }

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
