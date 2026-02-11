import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { auth } from "@/auth";

export const runtime = "nodejs";

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ jobId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await props.params;
    const { jobId } = params;
    const { searchParams } = new URL(request.url);
    const isDownload = searchParams.get('download') === 'true';

    try {
        const owner = await redis.get(`export:${jobId}:userId`);
        if (owner && owner !== session.user.id) {
            console.warn(`[ExportAPI] Owner mismatch for job ${jobId}. Owner: ${owner}, Requester: ${session.user.id}`);
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (!owner && process.env.NODE_ENV === "production") {
            console.warn(`[ExportAPI] No owner found for job ${jobId} in production.`);
            return NextResponse.json({ error: "Export job not found" }, { status: 404 });
        }

        const [status, result, error, format] = await Promise.all([
            redis.get(`export:${jobId}:status`),
            redis.get(`export:${jobId}:result`),
            redis.get(`export:${jobId}:error`),
            redis.get(`export:${jobId}:format`),
        ]);

        if (!status) {
            console.warn(`[ExportAPI] Status missing for job ${jobId}`);
            return NextResponse.json({ error: 'Export job not found' }, { status: 404 });
        }

        if (isDownload && status === 'completed' && result) {
            const resolvedFormat = (format === "xlsx" || format === "csv" || format === "json")
                ? format
                : (jobId.includes('xlsx') ? 'xlsx' : jobId.includes('json') ? 'json' : 'csv');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `zakrom_export_${timestamp}.${resolvedFormat}`;

            if (resolvedFormat === 'xlsx') {
                const buffer = Buffer.from(result, 'base64');
                return new NextResponse(buffer, {
                    headers: {
                        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'Content-Disposition': `attachment; filename="${filename}"`,
                    },
                });
            } else if (resolvedFormat === "json") {
                return new NextResponse(result, {
                    headers: {
                        "Content-Type": "application/json; charset=utf-8",
                        "Content-Disposition": `attachment; filename="${filename}"`,
                    },
                });
            } else {
                return new NextResponse(result, {
                    headers: {
                        'Content-Type': 'text/csv; charset=utf-8',
                        'Content-Disposition': `attachment; filename="${filename}"`,
                    },
                });
            }
        }
        return NextResponse.json({
            jobId,
            status,
            error: error || null,
            // Don't send huge result in status polling
            hasResult: !!result,
        });
    } catch (err: any) {
        console.error('Export API error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
