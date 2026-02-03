import { headers } from "next/headers";

function resolveHeaders(input?: Request | Headers) {
    if (input instanceof Request) return input.headers;
    if (input && typeof (input as Headers).get === "function") return input as Headers;
    const headerStore = headers();
    return headerStore as unknown as Headers;
}

export function getClientId(input?: Request | Headers) {
    const headerStore = resolveHeaders(input);
    if (typeof headerStore.get !== "function") return "unknown";
    const forwardedFor = headerStore.get("x-forwarded-for");
    if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";
    return headerStore.get("x-real-ip") ?? "unknown";
}

export function getUserAgent(input?: Request | Headers) {
    const headerStore = resolveHeaders(input);
    if (typeof headerStore.get !== "function") return "unknown";
    return headerStore.get("user-agent") ?? "unknown";
}

export function getAppUrl() {
    return process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}
