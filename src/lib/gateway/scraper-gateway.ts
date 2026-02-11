
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Viewport } from '@/lib/grid-generator';
import { randomUUID } from "node:crypto";
import { logScraperTrace } from "@/lib/scraper/trace";

const USE_STEALTH = true; // Toggle based on stability
if (USE_STEALTH) {
    try {
        puppeteer.use(StealthPlugin());
    } catch (e) {
        console.warn("[Scraper] Stealth plugin registration failed, continuing without it.", e);
    }
}

// Modern User Agents (Chrome, Firefox, Safari on Windows/Mac)
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15'
];

export interface ScrapedPlace {
    googleId: string;
    name: string;
    latitude: number;
    longitude: number;
    address?: string;
    phone?: string;
    website?: string;
    rating?: number;
    userRatingsTotal?: number;
    types?: string[];
    imgUrl?: string;
}

export class ScraperGateway {
    private static instance: ScraperGateway;
    private proxyList: string[] = [];

    private constructor() {
        // Load proxies from env (format: host:port:user:pass,host:port...)
        const envProxies = process.env.PROXY_LIST;
        if (envProxies) {
            this.proxyList = envProxies.split(',').map(p => p.trim()).filter(p => p.length > 0);
            console.log(`[Scraper] Loaded ${this.proxyList.length} proxies.`);
        }
    }

    public static getInstance() {
        if (!ScraperGateway.instance) {
            ScraperGateway.instance = new ScraperGateway();
        }
        return ScraperGateway.instance;
    }

    private getRandomUserAgent(): string {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }

    private getRandomProxy(): string | null {
        if (this.proxyList.length === 0) return null;
        return this.proxyList[Math.floor(Math.random() * this.proxyList.length)];
    }

    public async scanRegion(query: string, viewport: Viewport): Promise<ScrapedPlace[]> {
        const scanId = randomUUID();
        const startedAt = Date.now();
        console.log(`[Scraper] Starting scan for "${query}"`);
        logScraperTrace({
            type: "MAPS_SCAN_START",
            scanId,
            data: { query, viewport },
        });
        let browser;
        try {
            const proxy = this.getRandomProxy();
            const launchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-infobars',
                '--window-size=1920,1080'
            ];

            if (proxy) {
                // Determine format. If it has auth, we need to separate it or use a chain/plugin.
                // Puppeteer --proxy-server=host:port supports auth via page.authenticate()
                // Assuming proxy string is ip:port or protocol://ip:port
                // For simplicity, let's assume basic ip:port here. 
                // Enhanced proxy handling would parse auth.
                if (!proxy.includes("@")) {
                    launchArgs.push(`--proxy-server=${proxy}`);
                } else {
                    console.warn("[Scraper] Authenticated proxies via args need parsing. Skipping for now.");
                }
            }

            browser = await puppeteer.launch({
                headless: true, // "new" is deprecated, checking version compatibility
                args: launchArgs,
                ignoreHTTPSErrors: true
            } as any); // Cast to any to bypass strict type check for now if version mismatch exists

            // Or better: valid Puppy launch options
            // actually ignoreHTTPSErrors IS valid in PuppeteerLaunchOptions.
            // But puppeteer-extra might have different types.
            // Let's use 'as any' for quick fix or remove if deprecated.
            // It is valid.

            // Re-writing cleanest:
            /* browser = await puppeteer.launch({
                 headless: true,
                 args: launchArgs,
                 ignoreHTTPSErrors: true
             });*/

            const page = await browser.newPage();

            // Set Viewport size to look like a desktop
            await page.setViewport({ width: 1920, height: 1080 });

            // Randomize User Agent
            const ua = this.getRandomUserAgent();
            await page.setUserAgent(ua);
            console.log(`[Scraper] Using UA: ${ua} ${proxy ? `| Proxy: ${proxy}` : ''}`);
            logScraperTrace({
                type: "MAPS_SCAN_CONTEXT",
                scanId,
                data: { userAgent: ua, hasProxy: Boolean(proxy) },
            });

            // Construct Google Maps URL targeting the viewport
            // Add slight randomization to coords to avoid exact bot patterns
            const randOffset = () => (Math.random() - 0.5) * 0.001;
            const centerLat = ((viewport.northeast.lat + viewport.southwest.lat) / 2) + randOffset();
            const centerLng = ((viewport.northeast.lng + viewport.southwest.lng) / 2) + randOffset();
            const latDiff = Math.abs(viewport.northeast.lat - viewport.southwest.lat);
            const zoom = Math.floor(14 - Math.log2(latDiff / 0.1));
            const safeZoom = Math.min(Math.max(zoom, 10), 16);

            // hl=en to make selectors predictable
            const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${centerLat},${centerLng},${safeZoom}z?hl=en`;

            console.log(`[Scraper] Navigating to: ${url}`);
            logScraperTrace({
                type: "MAPS_NAVIGATE",
                scanId,
                data: { url, centerLat, centerLng, zoom: safeZoom },
            });

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            } catch (navError) {
                console.error("[Scraper] Navigation error (continuing...):", navError);
            }

            try {
                // Check if feed loaded
                await page.waitForSelector('div[role="feed"]', { timeout: 20000 });
            } catch (e) {
                console.log("[Scraper] Feed selector not found. Taking screenshot...");
                logScraperTrace({
                    type: "MAPS_FEED_NOT_FOUND",
                    scanId,
                    data: { url },
                });
                try { await page.screenshot({ path: 'scraper-error.png' }); } catch { }
                // If feed not found, maybe we act like a human and try to click "Search this area" if visible?
                // For now, fail.
                throw new Error("Could not find results feed.");
            }

            try {
                // Accept cookies if pop-up appears
                const buttons = await page.$$('button');
                for (const button of buttons) {
                    const text = await page.evaluate((el: any) => el.textContent, button);
                    if (text?.includes('Accept all') || text?.includes('Tümünü kabul et')) {
                        await button.click();
                        await new Promise(r => setTimeout(r, 2000));
                        break;
                    }
                }
            } catch (e) {
                // Ignore cookie errors
            }

            // Scroll loop to load results
            console.log('[Scraper] Scrolling to load results...');
            logScraperTrace({ type: "MAPS_SCROLL_START", scanId });
            await this.autoScroll(page);
            logScraperTrace({ type: "MAPS_SCROLL_DONE", scanId });

            // Extract data
            console.log('[Scraper] Extracting data...');
            const places = await page.evaluate(() => {
                const results: any[] = [];
                const items = document.querySelectorAll('div[role="feed"] > div > div[jsaction]');

                items.forEach(item => {
                    try {
                        const link = item.querySelector('a');
                        const url = link?.getAttribute('href') || '';
                        const textContent = (item as HTMLElement).innerText || '';

                        // Extract coords
                        let lat = 0;
                        let lng = 0;
                        const coordsMatch = url.match(/!3d([-0-9.]+)!4d([-0-9.]+)/);
                        if (coordsMatch) {
                            lat = parseFloat(coordsMatch[1]);
                            lng = parseFloat(coordsMatch[2]);
                        }

                        // Extract name (headline)
                        const nameText = item.querySelector('div.fontHeadlineSmall')?.textContent || '';

                        // Extract Rating (ARIA label or text)
                        const ratingLabel = item.querySelector('span[role="img"]')?.getAttribute('aria-label') || '';
                        const ratingMatch = ratingLabel.match(/([0-9.,]+)\s/);
                        const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : 0;

                        const reviewText = item.querySelector('span[role="img"]')?.parentElement?.textContent || '';
                        const reviewMatch = reviewText.match(/\(([0-9,.]+)\)/);
                        const userRatingsTotal = reviewMatch ? parseInt(reviewMatch[1].replace(/[,.]/g, '')) : 0;

                        // Heuristic extraction from text lines
                        const lines = textContent.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                        // Category is often the first line that is NOT the name and NOT the rating
                        const category = lines.find((l: string) => !l.includes(nameText) && !l.match(/^[0-9.,]+$/)) || '';

                        // Phone regex for Turkey/Generic
                        const phoneMatch = textContent.match(/(\+90|0)\s?(\d{3})\s?(\d{3})\s?(\d{2})\s?(\d{2})/);
                        const phone = phoneMatch ? phoneMatch[0] : null;

                        // Image
                        const img = item.querySelector('img');
                        const imgUrl = img?.src || '';

                        // Extract ID from URL (CID)
                        let googleId = '';
                        const idMatch = url.match(/0x[0-9a-f]+:0x[0-9a-f]+/);
                        if (idMatch) googleId = idMatch[0];

                        if (nameText && lat !== 0) {
                            results.push({
                                googleId,
                                name: nameText,
                                latitude: lat,
                                longitude: lng,
                                address: lines.find((l: string) => l.length > 10 && !l.includes(nameText)) || '',
                                rating,
                                userRatingsTotal,
                                types: category ? [category] : [],
                                imgUrl,
                                website: null,
                                phone
                            });
                        }
                    } catch (e) {
                        // skip
                    }
                });
                return results;
            });

            console.log(`[Scraper] Found ${places.length} places.`);
            logScraperTrace({
                type: "MAPS_EXTRACTED",
                scanId,
                data: { count: Array.isArray(places) ? places.length : 0 },
            });

            logScraperTrace({
                type: "MAPS_SCAN_DONE",
                scanId,
                data: { durationMs: Date.now() - startedAt, count: places.length },
            });
            return places;

        } catch (error) {
            console.error('[Scraper] Error:', error);
            logScraperTrace({
                type: "MAPS_SCAN_FAILED",
                scanId,
                data: { durationMs: Date.now() - startedAt, message: (error as any)?.message || String(error) },
            });
            return [];
        } finally {
            if (browser) await browser.close();
        }
    }

    public async scrapePlaceDetailsByGoogleId(googleId: string): Promise<{ website?: string | null; phone?: string | null; address?: string | null; url?: string | null; placeId?: string | null; }> {
        const scanId = randomUUID();
        const startedAt = Date.now();

        const placeId = (googleId || "").split("/").pop() || googleId;
        if (!placeId || placeId.includes("0x")) {
            // Our "scanRegion" scraper sometimes produces CID-ish strings (0x...:0x...) which are not
            // compatible with the Google Maps `place_id:` URL form.
            return { website: null, phone: null, address: null, url: null, placeId: placeId || null };
        }

        const url = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}&hl=en`;

        logScraperTrace({
            type: "MAPS_DETAILS_START",
            scanId,
            data: { googleId, placeId, url },
        });

        let browser: any;
        try {
            const proxy = this.getRandomProxy();
            const launchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-infobars',
                '--window-size=1920,1080'
            ];

            if (proxy && !proxy.includes("@")) {
                launchArgs.push(`--proxy-server=${proxy}`);
            }

            browser = await puppeteer.launch({
                headless: true,
                args: launchArgs,
                ignoreHTTPSErrors: true
            } as any);

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            const ua = this.getRandomUserAgent();
            await page.setUserAgent(ua);

            logScraperTrace({
                type: "MAPS_DETAILS_CONTEXT",
                scanId,
                data: { userAgent: ua, hasProxy: Boolean(proxy) },
            });

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait for basic page paint. These selectors are unstable across locales; keep it best-effort.
            await page.waitForTimeout(2000);

            const details = await page.evaluate(() => {
                function cleanLabel(label: string | null, prefixes: string[]) {
                    if (!label) return null;
                    let out = label.trim();
                    for (const p of prefixes) {
                        if (out.toLowerCase().startsWith(p.toLowerCase())) {
                            out = out.slice(p.length).trim();
                        }
                    }
                    return out || null;
                }

                function decodeWebsiteHref(href: string | null) {
                    if (!href) return null;
                    try {
                        // Website links are often google redirect URLs: https://www.google.com/url?q=...
                        const u = new URL(href);
                        const q = u.searchParams.get("q");
                        if (q && q.startsWith("http")) return q;
                        return href;
                    } catch {
                        return href;
                    }
                }

                const websiteEl =
                    (document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement | null) ||
                    (document.querySelector('a[aria-label*="Website"]') as HTMLAnchorElement | null) ||
                    (document.querySelector('a[aria-label*="web sitesi"]') as HTMLAnchorElement | null);
                const website = decodeWebsiteHref(websiteEl?.href || null);

                const phoneBtn =
                    (document.querySelector('button[data-item-id^="phone:tel"]') as HTMLButtonElement | null) ||
                    (document.querySelector('button[aria-label^="Phone"]') as HTMLButtonElement | null) ||
                    (document.querySelector('button[aria-label^="Telefon"]') as HTMLButtonElement | null) ||
                    (document.querySelector('button[data-tooltip*="phone"]') as HTMLButtonElement | null) ||
                    (document.querySelector('button[data-tooltip*="telefon"]') as HTMLButtonElement | null);

                const addressBtn =
                    (document.querySelector('button[data-item-id="address"]') as HTMLButtonElement | null) ||
                    (document.querySelector('button[aria-label^="Address"]') as HTMLButtonElement | null) ||
                    (document.querySelector('button[aria-label^="Adres"]') as HTMLButtonElement | null) ||
                    (document.querySelector('button[data-tooltip*="address"]') as HTMLButtonElement | null) ||
                    (document.querySelector('button[data-tooltip*="adres"]') as HTMLButtonElement | null);

                const phone =
                    cleanLabel(phoneBtn?.getAttribute("aria-label") || null, ["Phone:", "Telefon:"]) ||
                    (phoneBtn?.textContent?.trim() || null);

                const address =
                    cleanLabel(addressBtn?.getAttribute("aria-label") || null, ["Address:", "Adres:"]) ||
                    (addressBtn?.textContent?.trim() || null);

                return { website, phone, address };
            });

            logScraperTrace({
                type: "MAPS_DETAILS_EXTRACTED",
                scanId,
                data: details,
            });

            logScraperTrace({
                type: "MAPS_DETAILS_DONE",
                scanId,
                data: { durationMs: Date.now() - startedAt },
            });

            return { ...details, url, placeId };
        } catch (error) {
            logScraperTrace({
                type: "MAPS_DETAILS_FAILED",
                scanId,
                data: { durationMs: Date.now() - startedAt, message: (error as any)?.message || String(error), url },
            });
            return { website: null, phone: null, address: null, url, placeId };
        } finally {
            try { if (browser) await browser.close(); } catch { }
        }
    }

    private async autoScroll(page: any) {
        await page.evaluate(async () => {
            const wrapper = document.querySelector('div[role="feed"]');
            if (!wrapper) return;

            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                let distance = 1000;
                let timer = setInterval(() => {
                    const scrollHeight = wrapper.scrollHeight;
                    wrapper.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight || totalHeight > 50000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 1000);
            });
        });
    }
}

export const scraperGateway = ScraperGateway.getInstance();
