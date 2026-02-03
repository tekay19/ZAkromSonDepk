import nodemailer from "nodemailer";

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM ?? "no-reply@zakrom.pro";

function isSmtpConfigured() {
    return Boolean(smtpUser && smtpPass);
}

function getTransporter() {
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
    if (!isSmtpConfigured()) {
        console.warn("SMTP not configured. Password reset email suppressed.");
        return;
    }

    const transporter = getTransporter();
    try {
        await transporter.sendMail({
            from: smtpFrom,
            to,
            subject: "Sifre sifirlama talebi",
            text: `Sifrenizi sifirlamak icin bu baglantiya tiklayin: ${resetUrl}`,
            html: `<p>Sifrenizi sifirlamak icin bu baglantiya tiklayin:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
        });
    } catch (error) {
        console.warn("Password reset email failed.", error);
    }
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
    if (!isSmtpConfigured()) {
        console.warn("SMTP not configured. Verification email suppressed.");
        return;
    }

    const transporter = getTransporter();
    try {
        await transporter.sendMail({
            from: smtpFrom,
            to,
            subject: "E-posta dogrulama",
            text: `E-postanizi dogrulamak icin bu baglantiya tiklayin: ${verifyUrl}`,
            html: `<p>E-postanizi dogrulamak icin bu baglantiya tiklayin:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
        });
    } catch (error) {
        console.warn("Verification email failed.", error);
    }
}

export async function sendTwoFactorEmail(to: string, code: string) {
    if (!isSmtpConfigured()) {
        console.warn("SMTP not configured. Two-factor email suppressed.");
        return;
    }

    const transporter = getTransporter();
    try {
        await transporter.sendMail({
            from: smtpFrom,
            to,
            subject: "Giris dogrulama kodu",
            text: `Giris dogrulama kodunuz: ${code}`,
            html: `<p>Giris dogrulama kodunuz:</p><p style="font-size:20px;font-weight:bold;letter-spacing:2px">${code}</p>`,
        });
    } catch (error) {
        console.warn("Two-factor email failed.", error);
    }
}

export async function sendEmailChangeEmail(to: string, verifyUrl: string) {
    if (!isSmtpConfigured()) {
        console.warn("SMTP not configured. Email change message suppressed.");
        return;
    }

    const transporter = getTransporter();
    try {
        await transporter.sendMail({
            from: smtpFrom,
            to,
            subject: "E-posta degisikligi dogrulamasi",
            text: `E-posta adresinizi guncellemek icin bu baglantiya tiklayin: ${verifyUrl}`,
            html: `<p>E-posta adresinizi guncellemek icin bu baglantiya tiklayin:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
        });
    } catch (error) {
        console.warn("Email change email failed.", error);
    }
}
