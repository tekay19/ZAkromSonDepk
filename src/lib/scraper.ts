import puppeteer, { Browser, Page } from 'puppeteer';
import { prisma } from '@/lib/prisma';

// Helper to normalize URLs
const normalizeUrl = (url: string) => {
    if (!url.startsWith('http')) return `https://${url}`;
    return url;
};

// Regex for extracting emails
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IGNORE_EMAILS = ['sentry@', 'noreply@', 'admin@', 'info@wix', 'example.com', 'domain.com'];

interface ScrapeResult {
    emails: string[];
    socials: Record<string, string>;
    metaTitle?: string;
    metaDescription?: string;
}

export class Scraper {
    private browser: Browser | null = null;

    async init() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true, // New headless mode
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async scrapeWebsite(url: string): Promise<ScrapeResult> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();

        // Anti-bot measures
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });

        const result: ScrapeResult = {
            emails: [],
            socials: {}
        };

        try {
            const targetUrl = normalizeUrl(url);
            console.log(`[Scraper] Navigating to ${targetUrl}`);

            // 1. Visit Homepage
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Extract from Homepage
            const content = await page.content();
            this.extractEmails(content, result.emails);
            await this.extractSocials(page, result.socials); // Extract socials from homepage

            result.metaTitle = await page.title();

            // 2. Find "Contact" Page
            const contactLink = await this.findContactLink(page);
            if (contactLink) {
                // Resolve relative links and ignore non-http links (mailto:, tel:, javascript:)
                let resolvedContactUrl: string | null = null;
                try {
                    const trimmed = contactLink.trim();
                    if (/^(mailto:|tel:|javascript:)/i.test(trimmed)) {
                        resolvedContactUrl = null;
                    } else {
                        resolvedContactUrl = new URL(trimmed, page.url() || targetUrl).toString();
                    }
                } catch {
                    resolvedContactUrl = null;
                }

                if (!resolvedContactUrl) {
                    console.log(`[Scraper] Found contact link but could not resolve as URL: ${contactLink}`);
                } else {
                    console.log(`[Scraper] Found contact page: ${resolvedContactUrl}`);
                }

                try {
                    if (resolvedContactUrl) {
                        await page.goto(resolvedContactUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    }

                    const contactContent = await page.content();
                    this.extractEmails(contactContent, result.emails);
                } catch (e) {
                    console.warn(`[Scraper] Failed to navigate to contact page: ${e}`);
                }
            }

        } catch (error) {
            console.error(`[Scraper] Error processing ${url}:`, error);
        } finally {
            await page.close();
        }

        // Deduplicate emails
        result.emails = [...new Set(result.emails)];

        return result;
    }

    private extractEmails(html: string, targetArray: string[]) {
        const matches = html.match(EMAIL_REGEX);
        if (matches) {
            matches.forEach(email => {
                const lower = email.toLowerCase();
                if (!IGNORE_EMAILS.some(ignored => lower.includes(ignored))) {
                    targetArray.push(lower);
                }
            });
        }
    }

    private async extractSocials(page: Page, targetSocials: Record<string, string>) {
        // Simple heuristic for socials
        const links = await page.$$eval('a', as => as.map(a => a.href));
        links.forEach(link => {
            if (link.includes('facebook.com') && !link.includes('sharer')) targetSocials.facebook = link;
            if (link.includes('instagram.com')) targetSocials.instagram = link;
            if (link.includes('twitter.com') || link.includes('x.com')) targetSocials.twitter = link;
            if (link.includes('linkedin.com')) targetSocials.linkedin = link;
        });
    }

    private async findContactLink(page: Page): Promise<string | null> {
        // Look for links containing "contact", "iletisim", "ulasim"
        const link = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a'));
            const contactAnchor = anchors.find(a => {
                const text = (a.textContent || '').toLowerCase();
                const href = (a.getAttribute('href') || '').toLowerCase();
                return text.includes('contact') || text.includes('iletişim') || text.includes('ulasim') || href.includes('contact');
            });
            return contactAnchor ? contactAnchor.getAttribute('href') : null;
        });
        return link;
    }
}

export const scraper = new Scraper();
