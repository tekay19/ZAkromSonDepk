import { createHash, randomBytes } from "crypto";

export function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

export function generateToken() {
    const token = randomBytes(32).toString("hex");
    return { token, tokenHash: hashToken(token) };
}
