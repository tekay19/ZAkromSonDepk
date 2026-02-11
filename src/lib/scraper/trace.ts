import path from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";

type ScraperTraceEvent = {
  ts?: string;
  type: string;
  scanId?: string;
  data?: unknown;
};

export function logScraperTrace(evt: ScraperTraceEvent) {
  try {
    const payload = {
      ts: evt.ts ?? new Date().toISOString(),
      type: evt.type,
      scanId: evt.scanId ?? null,
      data: evt.data ?? null,
    };

    if (process.env.SCRAPER_LOG_CONSOLE === "true") {
      console.info(`[SCRAPER] ${payload.type}`, payload);
    }

    const logFile = process.env.SCRAPER_LOG_FILE;
    if (typeof logFile === "string" && logFile.trim().length > 0) {
      const fullPath = path.isAbsolute(logFile) ? logFile : path.join(process.cwd(), logFile);
      mkdirSync(path.dirname(fullPath), { recursive: true });
      appendFileSync(fullPath, JSON.stringify(payload) + "\n", "utf8");
    }
  } catch {
    // Never block product flows on debug logging.
  }
}

