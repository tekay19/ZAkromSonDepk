import { authenticator } from "otplib";

authenticator.options = { window: 1 };

export function generateTotpSecret() {
    return authenticator.generateSecret();
}

export function getTotpUri(email: string, issuer: string, secret: string) {
    return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotp(token: string, secret: string) {
    return authenticator.verify({ token, secret });
}
