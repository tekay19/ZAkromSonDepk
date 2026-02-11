import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    try {
        const owner = await redis.get(`job:${jobId}:userId`);
        if (owner && owner !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (!owner && process.env.NODE_ENV === "production") {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        const [status, result, error] = await Promise.all([
            redis.get(`job:${jobId}:status`),
            redis.get(`job:${jobId}:result`),
            redis.get(`job:${jobId}:error`),
        ]);

        if (!status) {
            return NextResponse.json(
                { jobId, status: "missing", result: null, error: "Job not found" },
                { status: 200 }
            );
        }

        if (status === "completed") {
            console.log(`[API] Job ${jobId} completed. Result length: ${(result ? JSON.stringify(result).length : 0)}`);
        }

        let parsedResult: any = null;
        if (result) {
            try {
                parsedResult = JSON.parse(result);
            } catch {
                parsedResult = null;
            }
        }

        return NextResponse.json({
            jobId,
            status,
            result: parsedResult,
            error: error || null,
        });
    } catch (err: any) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
