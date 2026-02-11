import { describe, it, expect } from "@jest/globals";

// Mocking the Scraper class (partial) or testing logic functions if extracted
// For now, we'll test the regex/logic by extracting them or rewriting a testable unit.
// Since Scraper is a class with Puppeteer dependency, we will test the extraction logic 
// by exposing it or copying the regex here for unit testing the *logic* specifically.

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IGNORE_EMAILS = ['sentry@', 'noreply@', 'admin@', 'info@wix', 'example.com', 'domain.com'];

function extractEmails(html: string): string[] {
    const found: string[] = [];
    const matches = html.match(EMAIL_REGEX);
    if (matches) {
        matches.forEach(email => {
            const lower = email.toLowerCase();
            if (!IGNORE_EMAILS.some(ignored => lower.includes(ignored))) {
                found.push(lower);
            }
        });
    }
    return [...new Set(found)];
}

describe('Scraper Logic Units', () => {
    it('should extract valid emails from text', () => {
        const html = '<div>Contact us at info@test.com or support@company.org</div>';
        const emails = extractEmails(html);
        expect(emails).toContain('info@test.com');
        expect(emails).toContain('support@company.org');
        expect(emails).toHaveLength(2);
    });

    it('should ignore blacklisted emails', () => {
        const html = 'Email: noreply@test.com and admin@test.com and valid@test.com';
        const emails = extractEmails(html);
        expect(emails).not.toContain('noreply@test.com');
        expect(emails).toContain('valid@test.com');
        // admin@ is in ignore list? Yes.
        expect(emails).not.toContain('admin@test.com');
    });

    it('should deduplicate emails', () => {
        const html = 'test@test.com test@test.com';
        const emails = extractEmails(html);
        expect(emails).toHaveLength(1);
    });
});
