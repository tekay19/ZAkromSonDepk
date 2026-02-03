
import puppeteer, { Browser } from 'puppeteer';
import { validateEmails, EmailValidationResult } from './email-validator';

export interface ScrapedData {
    emails: string[];
    emailScores?: { [email: string]: number }; // Email reliability scores
    phones: string[];
    socials: {
        facebook?: string;
        instagram?: string;
        twitter?: string;
        linkedin?: string;
        youtube?: string;
    };
    meta?: {
        url: string;
        status: number;
        contentLength: number;
        foundEmailsBeforeFilter: number;
        validatedEmails: number;
    };
}

const SOCIAL_PATTERNS = {
    facebook: /facebook\.com\/[a-zA-Z0-9\.]+/i,
    instagram: /instagram\.com\/[a-zA-Z0-9\._]+/i,
    twitter: /twitter\.com\/[a-zA-Z0-9_]+/i,
    linkedin: /linkedin\.com\/(in|company)\/[a-zA-Z0-9\-_%]+/i,
    youtube: /youtube\.com\/(channel|user|c)\/[a-zA-Z0-9\-_]+/i,
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Basic international phone regex (very permissive)
const PHONE_REGEX = /(\+?[0-9]{1,4}[\s-]?)?\(?[0-9]{3}\)?[\s-]?[0-9]{3}[\s-]?[0-9]{2,4}/g;

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
    let browser: Browser | null = null;
    const data: ScrapedData = {
        emails: [],
        phones: [],
        socials: {}
    };

    try {
        // Prepare URL
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        browser = await puppeteer.launch({
            headless: true, // "new" is deprecated, true is the standard now
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Block resources to speed up
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navigate with timeout
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const httpStatus = response ? response.status() : 0;

        // Get full HTML content
        const content = await page.content();

        // 1. Extract Emails
        const emailMatches = content.match(EMAIL_REGEX) || [];
        const foundEmailsBeforeFilter = emailMatches.length;
        const JUNK_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.tiff', '.ico', '.css', '.js', '.woff', '.woff2', '.mp4', '.mp3', '.wav', '.json', '.xml'];
        const JUNK_DOMAINS = ['sentry.io', 'sentry.wixpress.com', 'sentry-next.wixpress.com', 'example.com', 'domain.com', 'email.com', 'yoursite.com'];
        const JUNK_PREFIXES = ['u002f', 'u003e', 'ue00', 'name@'];

        data.emails = [...new Set(emailMatches)]
            .map(e => e.toLowerCase())
            .filter(e => {
                // Filter invalid extensions (images/assets mistaken as emails)
                if (JUNK_EXTENSIONS.some(ext => e.endsWith(ext))) return false;

                // Filter junk domains
                const domain = e.split('@')[1];
                if (!domain || JUNK_DOMAINS.some(d => domain.includes(d))) return false;

                // Filter junk prefixes often found in scraped JSON/JS code
                if (JUNK_PREFIXES.some(p => e.startsWith(p))) return false;

                // Filter numeric-only locals (e.g. 123@gmail) which are often phone number artifacts
                if (/^[0-9]+@/.test(e)) return false;

                return true;
            });

        // 2. Extract Phones (Limit to reasonable length matches and uniqueness)
        const phoneMatches = content.match(PHONE_REGEX) || [];
        data.phones = [...new Set(phoneMatches)]
            .map(p => p.trim())
            .filter(p => p.length >= 8 && p.length <= 20);

        // 3. Extract Social Links
        // Look at all 'a' tags hrefs
        const links = await page.$$eval('a', as => as.map(a => ({ href: a.href, text: a.innerText })));

        links.forEach(link => {
            const href = link.href;
            if (SOCIAL_PATTERNS.facebook.test(href)) data.socials.facebook = href;
            if (SOCIAL_PATTERNS.instagram.test(href)) data.socials.instagram = href;
            if (SOCIAL_PATTERNS.twitter.test(href)) data.socials.twitter = href;
            if (SOCIAL_PATTERNS.linkedin.test(href)) data.socials.linkedin = href;
            if (SOCIAL_PATTERNS.youtube.test(href)) data.socials.youtube = href;
        });

        // --- SMART ENRICHMENT: Visit Contact Pages if no email found ---
        if (data.emails.length === 0) {
            console.log(`[Smart Scraper] No emails on homepage of ${url}. Looking for contact pages...`);

            const CONTACT_KEYWORDS = ['iletişim', 'contact', 'hakkımızda', 'about', 'bize ulaşın', 'künye'];

            // Find best candidate link
            // We look for links that contain keyword in text OR url, and belong to same domain
            const urlObj = new URL(url);
            const domain = urlObj.hostname;

            const contactLink = links.find(l => {
                const linkHref = l.href.toLowerCase();
                const linkText = l.text.toLowerCase();

                // Must be internal (relative or same domain)
                if (!linkHref.includes(domain) && linkHref.startsWith('http')) return false;

                return CONTACT_KEYWORDS.some(k => linkHref.includes(k) || linkText.includes(k));
            });

            if (contactLink) {
                console.log(`[Smart Scraper] Visiting potential contact page: ${contactLink.href}`);
                try {
                    await page.goto(contactLink.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    const subContent = await page.content();

                    const subEmailMatches = subContent.match(EMAIL_REGEX) || [];
                    const newEmails = [...new Set(subEmailMatches)]
                        .map(e => e.toLowerCase())
                        .filter(e => {
                            if (JUNK_EXTENSIONS.some(ext => e.endsWith(ext))) return false;
                            const d = e.split('@')[1];
                            if (!d || JUNK_DOMAINS.some(jnk => d.includes(jnk))) return false;
                            if (JUNK_PREFIXES.some(p => e.startsWith(p))) return false;
                            if (/^[0-9]+@/.test(e)) return false;
                            return true;
                        });

                    if (newEmails.length > 0) {
                        console.log(`[Smart Scraper] Found ${newEmails.length} emails on sub-page!`);
                        data.emails = [...new Set([...data.emails, ...newEmails])];
                    }
                } catch (subError) {
                    console.error(`[Smart Scraper] Failed to visit sub-page:`, subError);
                }
            }
        }

        // --- EMAIL VALIDATION ---
        if (data.emails.length > 0) {
            console.log(`[Email Validator] Validating ${data.emails.length} emails for ${url}...`);

            try {
                const validationResults = await validateEmails(data.emails, url, 40);

                // Build score map
                const emailScores: { [email: string]: number } = {};
                validationResults.forEach(result => {
                    emailScores[result.email] = result.score;
                });

                // Keep only validated emails (sorted by score)
                data.emails = validationResults.map(r => r.email);
                data.emailScores = emailScores;

                console.log(`[Email Validator] ${validationResults.length}/${data.emails.length} emails passed validation`);
            } catch (validationError) {
                console.error(`[Email Validator] Validation error:`, validationError);
                // Keep original emails on validation failure
            }
        }

        data.meta = {
            url,
            status: httpStatus,
            contentLength: content.length,
            foundEmailsBeforeFilter,
            validatedEmails: data.emails.length
        };

        return data;

    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return data; // Return empty/partial results on error
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

export async function searchGoogle(query: string): Promise<string | null> {
    let browser: Browser | null = null;
    try {
        console.log(`[Web Search] Searching for: "${query}" via DuckDuckGo`);
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Block heavy resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'media', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Use HTML version of DDG
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto('https://html.duckduckgo.com/html/', { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Type into the form
        await page.type('input[name="q"]', query);
        await page.keyboard.press('Enter');

        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract first organic result
        const href = await page.evaluate(() => {
            const anchor = document.querySelector('.result__a');
            return anchor ? anchor.getAttribute('href') : null;
        });

        console.log(`[Web Search] Found URL: ${href}`);
        return href;

    } catch (error) {
        console.error(`[Web Search] Failed for query "${query}":`, error);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}
