import "dotenv/config";
import http from "http";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import net from "net";
import puppeteer from "puppeteer";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { redis } from "../src/lib/redis";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function invariant(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForHttpOk(url: string, timeoutMs: number) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { redirect: "manual" as any });
      if (res.status >= 200 && res.status < 500) return;
    } catch {
      // ignore
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for ${url}`);
    }
    await sleep(400);
  }
}

async function getFreePort(preferred: number) {
  const tryListen = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          server.close(() => reject(new Error("Failed to resolve listen address")));
          return;
        }
        const p = addr.port;
        server.close(() => resolve(p));
      });
    });

  try {
    return await tryListen(preferred);
  } catch {
    return await tryListen(0);
  }
}

async function startMockWebsite() {
  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    const parts = url.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "root";
    const safeId = last.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "root";

    const email1 = `hello+${safeId}@iana.org`;
    const email2 = `sales+${safeId}@iana.org`;
    const email3 = `support+${safeId}@iana.org`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.statusCode = 200;
    if (url.startsWith("/contact/")) {
      res.end(`<!doctype html>
<html><body style="font-family:Arial">
  <h1>Contact</h1>
  <p>Email: ${email3}</p>
  <p>Also: ${email2}</p>
</body></html>`);
      return;
    }

    res.end(`<!doctype html>
<html><body style="font-family:Arial">
  <h1>Mock Biz</h1>
  <p>Email: ${email1}</p>
  <p>Email2: ${email2}</p>
  <a href="/contact/${encodeURIComponent(safeId)}">Contact</a>
</body></html>`);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Failed to start mock website server");
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

async function upsertTestUser(args: { email: string; password: string; tier: "FREE" | "STARTER" | "PRO" | "BUSINESS" }) {
  const passwordHash = await hashPassword(args.password);

  const user = await prisma.user.upsert({
    where: { email: args.email },
    update: {
      name: "E2E User",
      passwordHash,
      emailVerified: new Date(),
      credits: 25000,
      subscriptionTier: args.tier,
      twoFactorEnabled: false,
      twoFactorEmailEnabled: false,
      twoFactorTotpEnabled: false,
      failedLoginCount: 0,
      lockUntil: null,
      apiKeyHash: null,
    },
    create: {
      name: "E2E User",
      email: args.email,
      passwordHash,
      emailVerified: new Date(),
      credits: 25000,
      subscriptionTier: args.tier,
      twoFactorEnabled: false,
      twoFactorEmailEnabled: false,
      twoFactorTotpEnabled: false,
    },
    select: { id: true, credits: true, subscriptionTier: true },
  });

  await prisma.lead.deleteMany({ where: { userId: user.id } });
  await prisma.searchHistory.deleteMany({ where: { userId: user.id } });
  await prisma.creditTransaction.deleteMany({ where: { userId: user.id } });

  await prisma.user.update({
    where: { id: user.id },
    data: { credits: 25000 },
  });

  return user;
}

async function run() {
  const artifactsDir = path.join(process.cwd(), "tmp", "e2e");
  mkdirSync(artifactsDir, { recursive: true });

  const mockSite = await startMockWebsite();

  const port = await getFreePort(3000);
  const baseUrl = `http://127.0.0.1:${port}`;

  const email = "e2e@zakrom.pro";
  const password = "ZakromE2E123!";
  const tier = "BUSINESS" as const;

  const runId = Math.random().toString(36).slice(2, 8);
  const city = "Istanbul";
  const keyword = `Kafe e2e ${runId}`; // keep under 50 chars to satisfy zod schema

  const user = await upsertTestUser({ email, password, tier });

  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NEXTAUTH_URL: baseUrl,
    GOOGLE_PLACES_MOCK: "1",
    GOOGLE_PLACES_MOCK_WEBSITE_BASE: mockSite.baseUrl,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "", // keep blank for deterministic testing
    NEXT_TELEMETRY_DISABLED: "1",
    // Keep deep search fast for E2E.
    DEEP_SEARCH_PAGE_SIZE: "30",
    DEEP_SEARCH_MAX_PAGES: "5",
    DEEP_SEARCH_BUSINESS_GRID_SIZE: "1",
    DEEP_SEARCH_BUSINESS_MAX_PAGES_PER_GRID: "1",
  };

  const dev = spawn("npm", ["run", "dev", "--", "--port", String(port), "--hostname", "127.0.0.1"], {
    env,
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  const devLogs: string[] = [];
  const onLog = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    devLogs.push(text);
    if (devLogs.length > 200) devLogs.shift();
  };
  dev.stdout?.on("data", onLog);
  dev.stderr?.on("data", onLog);

  try {
    await waitForHttpOk(baseUrl, 90_000);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const consoleLines: string[] = [];
    try {
      const page = await browser.newPage();
      page.on("console", (msg) => consoleLines.push(`[console:${msg.type()}] ${msg.text()}`));
      page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));

      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

      // 1) Login
      await page.goto(`${baseUrl}/auth/signin`, { waitUntil: "domcontentloaded" });
      await page.type('input[type="email"]', email, { delay: 10 });
      await page.type('input[type="password"]', password, { delay: 10 });

      await page.click('button[type="submit"]');
      await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60_000 });

      if (!page.url().includes("/dashboard")) {
        throw new Error(`Expected redirect to /dashboard, got ${page.url()}`);
      }

      const readCredits = async () => {
        return page.evaluate(() => {
          const card = Array.from(document.querySelectorAll("div")).find((d) => {
            const t = d.textContent || "";
            return t.includes("Kredi") && t.includes("/");
          });
          if (!card) return null;
          const mono = card.querySelector("span.font-mono");
          const raw = (mono?.textContent || "").trim();
          const normalized = raw.replace(/[.,\\s]/g, "");
          const n = Number(normalized);
          return Number.isFinite(n) ? n : null;
        });
      };

      const waitForCredits = async (expectAtLeast: number, timeoutMs = 60_000) => {
        const start = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const c = await readCredits();
          if (typeof c === "number" && c >= expectAtLeast) return c;
          if (Date.now() - start > timeoutMs) throw new Error("Timeout waiting for credits to load");
          await sleep(250);
        }
      };

      const waitForCreditsToEqual = async (expected: number, timeoutMs = 60_000) => {
        const start = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const c = await readCredits();
          if (typeof c === "number" && c === expected) return c;
          if (Date.now() - start > timeoutMs) {
            throw new Error(`Timeout waiting for credits=${expected} (last=${c})`);
          }
          await sleep(250);
        }
      };

      const creditsBefore = await waitForCredits(10_000);
      await page.screenshot({ path: path.join(artifactsDir, "01-dashboard.png"), fullPage: true });

      // 2) Search (mock)
      await page.type('input[placeholder*="Kadıköy"]', city, { delay: 10 });
      await page.type('input[placeholder*="3. Dalga"]', keyword, { delay: 10 });
      await page.click('button[type="submit"]');

      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll("button")).some((b) => (b.textContent || "").includes("Mail Aç"));
      }, { timeout: 60_000 });

      await page.screenshot({ path: path.join(artifactsDir, "02-results.png"), fullPage: true });

      const creditsAfterFirstSearch = await waitForCreditsToEqual(creditsBefore - 1, 60_000);

      // 3) Repeat same search via Search History to hit cache without spending credits
      await page.waitForFunction((kw) => {
        return Array.from(document.querySelectorAll("button")).some((b) => (b.textContent || "").includes(kw));
      }, { timeout: 30_000 }, keyword);

      await page.evaluate((kw) => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes(kw));
        (btn as HTMLButtonElement | undefined)?.click();
      }, keyword);

      // Wait for search to finish (Keşfet button returns)
      await page.waitForFunction(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Keşfet") || (b.textContent || "").includes("Aranıyor"));
        return Boolean(btn) && !(btn?.textContent || "").includes("Aranıyor");
      }, { timeout: 60_000 });

      const creditsAfterSecondSearch = await waitForCreditsToEqual(creditsAfterFirstSearch, 60_000);

      // 4) Filters sanity: toggle "Web sitesi" so we unlock leads that have websites.
      const readFilterCounts = async () => {
        return page.evaluate(() => {
          const left = Array.from(document.querySelectorAll("div")).find((d) => (d.textContent || "").trim() === "Filtreler" || (d.textContent || "").includes("Filtreler"));
          const parent = left?.parentElement;
          const candidates = parent ? Array.from(parent.children) : [];
          const countEl = candidates.find((c) => c !== left && (c.textContent || "").includes("/")) as HTMLElement | undefined;
          const text = (countEl?.textContent || "").trim();
          const m = text.match(/(\d+)\s*\/\s*(\d+)/);
          if (!m) return null;
          return { filtered: Number(m[1]), total: Number(m[2]) };
        });
      };

      const countsBeforeWebsite = await readFilterCounts();
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "Web sitesi");
        (btn as HTMLButtonElement | undefined)?.click();
      });
      await sleep(600);
      const countsAfterWebsite = await readFilterCounts();
      if (countsBeforeWebsite && countsAfterWebsite) {
        invariant(countsAfterWebsite.filtered <= countsBeforeWebsite.filtered, "Expected 'Web sitesi' filter to not increase filtered count");
        invariant(countsAfterWebsite.filtered >= 2, "Need at least 2 website results to continue E2E");
      }

      // 5) Unlock first lead emails (should enqueue enrichment)
      const unlockedIds = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const targets = buttons.filter((b) => (b.textContent || "").trim() === "Mail Aç").slice(0, 2);
        targets.forEach((b) => (b as HTMLButtonElement).click());
        // Grab the visible place_ids from React state is hard; instead infer from DOM key isn't accessible.
        return targets.length;
      });

      invariant(unlockedIds === 2, `Expected to click 2 'Mail Aç' buttons, clicked=${unlockedIds}`);

      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll("button")).some((b) => (b.textContent || "").includes("Açık"));
      }, { timeout: 60_000 });

      // Wait for enrichment to publish at least one email to UI.
      await page.waitForFunction(() => {
        const text = document.body.textContent || "";
        return text.includes("@iana.org");
      }, { timeout: 60_000 });

      await page.screenshot({ path: path.join(artifactsDir, "03-unlocked.png"), fullPage: true });

      const creditsAfterUnlock = await waitForCreditsToEqual(creditsAfterSecondSearch - 6, 60_000);

      // 6) Filter: onlyWithEmail
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Sadece mail"));
        (btn as HTMLButtonElement | undefined)?.click();
      });
      await sleep(800);

      // 7) Export CSV with includeEmails enabled (filtered should be small)
      await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("label")).find((l) => (l.textContent || "").includes("Export'ta mail"));
        const input = label?.querySelector("input[type='checkbox']") as HTMLInputElement | null;
        if (input && !input.checked) input.click();
      });

      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "CSV");
        (btn as HTMLButtonElement | undefined)?.click();
      });

      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll("a")).some((a) => (a.getAttribute("href") || "").includes("/api/exports/") && (a.textContent || "").includes("indir"));
      }, { timeout: 90_000 });

      await page.screenshot({ path: path.join(artifactsDir, "04-export-ready.png"), fullPage: true });

      const exportHref = await page.evaluate(() => {
        const a = Array.from(document.querySelectorAll("a")).find((x) => (x.getAttribute("href") || "").includes("/api/exports/") && (x.textContent || "").includes("indir"));
        return a?.getAttribute("href") || null;
      });

      if (!exportHref) throw new Error("Export download link not found");

      const exportUrl = exportHref.startsWith("http") ? exportHref : `${baseUrl}${exportHref}`;
      const exportRes = await fetch(exportUrl);
      const exportText = await exportRes.text();
      const exportOk = exportRes.status === 200 && exportText.includes("@iana.org");
      invariant(exportOk, `Expected CSV export to contain emails. status=${exportRes.status}`);

      const creditsAfterExport = await waitForCreditsToEqual(creditsAfterUnlock - 1, 60_000);

      // 8) Visual export (expected to fail due to missing Google Maps key)
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "PNG");
        (btn as HTMLButtonElement | undefined)?.click();
      });

      await page.waitForFunction(() => {
        const text = document.body.textContent || "";
        return text.includes("Harita export job:");
      }, { timeout: 60_000 });

      // Poll API to confirm worker fails (missing key)
      const visualJobId = await page.evaluate(() => {
        const text = document.body.textContent || "";
        const m = text.match(/Harita export job:\\s*(visual-[0-9]+-[a-zA-Z0-9_-]+)/);
        return m?.[1] || null;
      });

      let visualStatus: string | null = null;
      let visualError: string | null = null;
      if (visualJobId) {
        for (let i = 0; i < 60; i++) {
          const res = await fetch(`${baseUrl}/api/visual-exports/${visualJobId}`);
          const data = await res.json();
          visualStatus = data.status;
          visualError = data.error;
          if (visualStatus === "failed" || visualStatus === "completed") break;
          await sleep(1000);
        }
      }

      await page.screenshot({ path: path.join(artifactsDir, "05-visual-export.png"), fullPage: true });

      invariant(visualJobId, "Expected a visual export job id to be present in UI");
      invariant(visualStatus === "failed", `Expected visual export to fail without maps key. status=${visualStatus}`);
      invariant(typeof visualError === "string" && visualError.length > 0, "Expected visual export error message");

      // 9) Settings: generate API key (Business)
      await page.goto(`${baseUrl}/dashboard/settings`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (document.body.textContent || "").includes("Business API"), { timeout: 60_000 });

      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Yeni Anahtar"));
        (btn as HTMLButtonElement | undefined)?.click();
      });

      await page.waitForFunction(() => {
        const text = document.body.textContent || "";
        return text.includes("zakrom_");
      }, { timeout: 60_000 });

      const apiKey = await page.evaluate(() => {
        const mono = Array.from(document.querySelectorAll("*")).find((el) => (el.textContent || "").trim().startsWith("zakrom_"));
        return (mono?.textContent || "").trim();
      });

      await page.screenshot({ path: path.join(artifactsDir, "06-settings-api-key.png"), fullPage: true });

      // 10) Business API: ensure unauthorized request is rejected
      const unauthRes = await fetch(`${baseUrl}/api/v1/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, keyword, deepSearch: false }),
      });
      invariant(unauthRes.status === 401, `Expected /api/v1/search without auth to return 401, got ${unauthRes.status}`);

      // 11) Call Business API (cached)
      const apiRes = await fetch(`${baseUrl}/api/v1/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ city, keyword, deepSearch: false }),
      });

      const apiJson = await apiRes.json();
      const apiOk = apiRes.status === 200 && apiJson?.ok === true && Array.isArray(apiJson?.places);
      invariant(apiOk, `Expected Business API call to succeed. status=${apiRes.status} body=${JSON.stringify(apiJson).slice(0, 400)}`);

      // 12) Deep search async flow (worker + SSE + pagination)
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (document.body.textContent || "").includes("Derin Arama"), { timeout: 60_000 });

      // Toggle deep search on
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Derin Arama"));
        (btn as HTMLButtonElement | undefined)?.click();
      });
      await sleep(300);

      const deepKeyword = `Kafe deep e2e ${runId}`;
      const creditsBeforeDeep = await readCredits();
      invariant(typeof creditsBeforeDeep === "number", "Could not read credits before deep search");

      // Replace input values (they may already have old values)
      await page.$eval('input[placeholder*="Kadıköy"]', (el) => {
        const input = el as HTMLInputElement;
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.$eval('input[placeholder*="3. Dalga"]', (el) => {
        const input = el as HTMLInputElement;
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.click('input[placeholder*="Kadıköy"]');
      await page.keyboard.type(city, { delay: 10 });
      await page.click('input[placeholder*="3. Dalga"]');
      await page.keyboard.type(deepKeyword, { delay: 10 });
      await page.click('button[type="submit"]');

      // Wait for job id indicator to appear
      await page.waitForFunction(() => (document.body.textContent || "").includes("job:"), { timeout: 30_000 });
      // Wait for results and job completion (button back to Keşfet)
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll("button")).some((b) => (b.textContent || "").includes("Mail Aç"));
      }, { timeout: 90_000 });
      await page.waitForFunction(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Keşfet") || (b.textContent || "").includes("Aranıyor"));
        return Boolean(btn) && !(btn?.textContent || "").includes("Aranıyor");
      }, { timeout: 90_000 });

      const creditsAfterDeep = await waitForCreditsToEqual(creditsBeforeDeep - 10, 90_000);

      // Deep pagination ("Daha Fazla") should cost 1 credit if token exists
      const deepCountsBefore = await readFilterCounts();
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "Daha Fazla");
        (btn as HTMLButtonElement | undefined)?.click();
      });
      const creditsAfterDeepPage = await waitForCreditsToEqual(creditsAfterDeep - 1, 90_000);
      invariant(typeof creditsAfterDeepPage === "number", "Could not read credits after deep pagination");
      invariant(creditsAfterDeepPage === creditsAfterDeep - 1, `Expected deep pagination to cost 1 credit. Before=${creditsAfterDeep}, After=${creditsAfterDeepPage}`);

      const deepCountsAfter = await readFilterCounts();
      if (deepCountsBefore && deepCountsAfter) {
        invariant(deepCountsAfter.total >= deepCountsBefore.total, "Expected total results to not decrease after pagination");
        invariant(deepCountsAfter.filtered > deepCountsBefore.filtered, "Expected filtered results to increase after pagination");
      }

      await page.screenshot({ path: path.join(artifactsDir, "07-deep-search.png"), fullPage: true });

      const txCounts = await prisma.creditTransaction.groupBy({
        by: ["type"],
        where: { userId: user.id },
        _count: { _all: true },
      });

      // Summarize
      const summary = {
        baseUrl,
        mockWebsiteBase: mockSite.baseUrl,
        user: { id: user.id, email, tier },
        search: { city, keyword },
        creditsBefore,
        creditsAfterFirstSearch,
        creditsAfterSecondSearch,
        unlockedClicks: unlockedIds,
        creditsAfterUnlock,
        export: { url: exportUrl, ok: exportOk, status: exportRes.status, contentType: exportRes.headers.get("content-type") },
        visual: { jobId: visualJobId, status: visualStatus, error: visualError },
        api: { ok: apiOk, status: apiRes.status, sampleCount: Array.isArray(apiJson?.places) ? apiJson.places.length : null },
        creditTransactions: txCounts,
        consoleErrors: consoleLines.filter((l) => l.includes("error") || l.includes("Error") || l.includes("[pageerror]")).slice(0, 50),
      };

      writeFileSync(path.join(artifactsDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
      writeFileSync(path.join(artifactsDir, "console.log.txt"), consoleLines.join("\n"), "utf8");
    } finally {
      await browser.close();
    }
  } catch (e) {
    writeFileSync(path.join(artifactsDir, "dev.log.tail.txt"), devLogs.join(""), "utf8");
    throw e;
  } finally {
    // Best-effort cleanup.
    try {
      process.kill(-dev.pid, "SIGTERM");
    } catch {
      // ignore
    }
    await mockSite.close().catch(() => {});
    await redis.quit().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    try {
      writeFileSync(path.join(artifactsDir, "dev.log.tail.txt"), devLogs.join(""), "utf8");
    } catch {
      // ignore
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
