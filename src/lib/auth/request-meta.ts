import { headers } from "next/headers";

export async function getRequestMeta() {
  try {
    const h = await headers();
    const userAgent = h.get("user-agent");
    const forwardedFor = h.get("x-forwarded-for");
    const realIp = h.get("x-real-ip");
    const ip = (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null) || realIp || null;
    return { ip, userAgent };
  } catch {
    // No request context (e.g. background worker).
    return { ip: null as string | null, userAgent: null as string | null };
  }
}
