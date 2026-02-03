/**
 * Email Validation Module
 * 
 * Provides email validation through:
 * 1. Format validation (regex)
 * 2. MX record checking (DNS lookup)
 * 3. Domain matching with website
 * 4. Business email detection (not Gmail, Hotmail, etc.)
 * 5. Reliability score calculation
 */

import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

// Common free email providers (personal emails)
const FREE_EMAIL_PROVIDERS = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
    'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'mail.com',
    'yandex.com', 'zoho.com', 'gmx.com', 'mail.ru', 'inbox.com',
    // Turkish providers
    'mynet.com', 'ttmail.com', 'superonline.com', 'turk.net'
];

// Suspicious patterns that indicate fake/placeholder emails
const SUSPICIOUS_PATTERNS = [
    /^(test|demo|example|sample|admin|info|contact|noreply|no-reply)@/i,
    /^[a-z]{1,3}@/i, // Very short local parts like a@, ab@
    /@(test|example|localhost|domain)\./i,
];

export interface EmailValidationResult {
    email: string;
    isValidFormat: boolean;
    hasMxRecord: boolean;
    isBusinessEmail: boolean;
    matchesWebsite: boolean;
    score: number; // 0-100
    status: 'valid' | 'suspicious' | 'invalid';
}

/**
 * Validate email format using regex
 */
export function validateEmailFormat(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}

/**
 * Check if domain has MX records (can receive emails)
 */
export async function checkMxRecord(email: string): Promise<boolean> {
    try {
        const domain = email.split('@')[1];
        if (!domain) return false;

        const mxRecords = await resolveMx(domain);
        return mxRecords && mxRecords.length > 0;
    } catch (error) {
        // DNS lookup failed - domain likely doesn't exist
        return false;
    }
}

/**
 * Check if email is from a business domain (not free provider)
 */
export function isBusinessEmail(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    return !FREE_EMAIL_PROVIDERS.includes(domain);
}

/**
 * Check if email domain matches the website domain
 */
export function matchesWebsiteDomain(email: string, websiteUrl: string | null | undefined): boolean {
    if (!websiteUrl) return false;

    try {
        const emailDomain = email.split('@')[1]?.toLowerCase();
        if (!emailDomain) return false;

        // Extract domain from URL
        let websiteDomain = websiteUrl.toLowerCase();
        websiteDomain = websiteDomain.replace(/^https?:\/\//, '');
        websiteDomain = websiteDomain.replace(/^www\./, '');
        websiteDomain = websiteDomain.split('/')[0];
        websiteDomain = websiteDomain.split(':')[0]; // Remove port if any

        // Direct match
        if (emailDomain === websiteDomain) return true;

        // Check if email domain is subdomain of website or vice versa
        if (emailDomain.endsWith('.' + websiteDomain) || websiteDomain.endsWith('.' + emailDomain)) {
            return true;
        }

        // Check root domain match (e.g., mail.company.com vs company.com)
        const emailRoot = emailDomain.split('.').slice(-2).join('.');
        const websiteRoot = websiteDomain.split('.').slice(-2).join('.');

        return emailRoot === websiteRoot;
    } catch {
        return false;
    }
}

/**
 * Check if email matches suspicious patterns
 */
export function isSuspiciousEmail(email: string): boolean {
    return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(email));
}

/**
 * Calculate reliability score (0-100)
 * 
 * Scoring:
 * - Valid format: +20
 * - Has MX record: +30
 * - Is business email: +20
 * - Matches website domain: +25
 * - Not suspicious: +5
 */
export function calculateEmailScore(
    isValidFormat: boolean,
    hasMxRecord: boolean,
    isBusinessEmail: boolean,
    matchesWebsite: boolean,
    isSuspicious: boolean
): number {
    let score = 0;

    if (isValidFormat) score += 20;
    if (hasMxRecord) score += 30;
    if (isBusinessEmail) score += 20;
    if (matchesWebsite) score += 25;
    if (!isSuspicious) score += 5;

    return score;
}

/**
 * Get status based on score
 */
export function getEmailStatus(score: number): 'valid' | 'suspicious' | 'invalid' {
    if (score >= 70) return 'valid';
    if (score >= 40) return 'suspicious';
    return 'invalid';
}

/**
 * Validate a single email with all checks
 */
export async function validateEmail(email: string, websiteUrl?: string | null): Promise<EmailValidationResult> {
    const isValid = validateEmailFormat(email);
    const hasMx = isValid ? await checkMxRecord(email) : false;
    const isBusiness = isBusinessEmail(email);
    const matchesWeb = matchesWebsiteDomain(email, websiteUrl);
    const suspicious = isSuspiciousEmail(email);

    const score = calculateEmailScore(isValid, hasMx, isBusiness, matchesWeb, suspicious);

    return {
        email,
        isValidFormat: isValid,
        hasMxRecord: hasMx,
        isBusinessEmail: isBusiness,
        matchesWebsite: matchesWeb,
        score,
        status: getEmailStatus(score)
    };
}

/**
 * Validate multiple emails and return only valid ones
 * Returns emails sorted by score (highest first)
 */
export async function validateEmails(emails: string[], websiteUrl?: string | null, minScore: number = 50): Promise<EmailValidationResult[]> {
    const results = await Promise.all(
        emails.map(email => validateEmail(email, websiteUrl))
    );

    return results
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score);
}

/**
 * Quick validation without async MX check (for batch filtering)
 */
export function quickValidateEmail(email: string, websiteUrl?: string | null): { score: number; status: 'valid' | 'suspicious' | 'invalid' } {
    const isValid = validateEmailFormat(email);
    const isBusiness = isBusinessEmail(email);
    const matchesWeb = matchesWebsiteDomain(email, websiteUrl);
    const suspicious = isSuspiciousEmail(email);

    // Score without MX (max 70)
    let score = 0;
    if (isValid) score += 20;
    if (isBusiness) score += 20;
    if (matchesWeb) score += 25;
    if (!suspicious) score += 5;

    return {
        score,
        status: getEmailStatus(score)
    };
}
