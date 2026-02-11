import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, props: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await props.params;
  const { jobId } = params;
  const { searchParams } = new URL(request.url);
  const isDownload = searchParams.get("download") === "true";

  try {
    const owner = await redis.get(`visual:${jobId}:userId`);
    if (owner && owner !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!owner && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Visual export job not found" }, { status: 404 });
    }

    const [status, result, error, format] = await Promise.all([
      redis.get(`visual:${jobId}:status`),
      redis.get(`visual:${jobId}:result`),
      redis.get(`visual:${jobId}:error`),
      redis.get(`visual:${jobId}:format`),
    ]);

    if (!status) {
      return NextResponse.json({ error: "Visual export job not found" }, { status: 404 });
    }

    const resolvedFormat = format === "png" || format === "pdf" ? format : jobId.includes("pdf") ? "pdf" : "png";

    if (isDownload && status === "completed" && result) {
      const buffer = Buffer.from(result, "base64");
      const contentType = resolvedFormat === "png" ? "image/png" : "application/pdf";
      const ext = resolvedFormat === "png" ? "png" : "pdf";
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename=\"zakrom_heatmap_${Date.now()}.${ext}\"`,
        },
      });
    }

    return NextResponse.json({
      jobId,
      status,
      format: resolvedFormat,
      error: error || null,
      hasResult: Boolean(result),
    });
  } catch (err: any) {
    console.error("Visual export API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
