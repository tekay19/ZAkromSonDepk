import { Worker, Job } from "bullmq";
import { redisConnection } from "../queue/config";
import { redis } from "../redis";
import { prisma } from "@/lib/prisma";
import puppeteer, { type Browser } from "puppeteer";

const QUEUE_NAME = "visual-export-jobs";

function getGoogleMapsKey() {
  const keys = (process.env.GOOGLE_API_KEYS || process.env.GOOGLE_MAPS_API_KEY || "").split(",").filter(Boolean);
  // Prefer a server-only key for headless exports (can be IP-restricted), then fall back.
  return (
    (process.env.GOOGLE_MAPS_EXPORT_API_KEY || "").trim() ||
    keys[0] ||
    (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
    ""
  );
}

function buildHtml(args: { points: Array<{ lat: number; lng: number }>; title: string; apiKey: string }) {
  const pointsJson = JSON.stringify(args.points);
  const safeTitle = (args.title || "Zakrom Heatmap").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { margin: 0; }
      html, body { margin: 0; padding: 0; background: #0a0a0a; }
      #wrap { position: relative; width: 100vw; height: 100vh; }
      #map { position: absolute; inset: 0; }
      #title {
        position: absolute;
        left: 32px;
        top: 24px;
        padding: 14px 18px;
        border-radius: 16px;
        background: rgba(0,0,0,0.45);
        border: 1px solid rgba(255,255,255,0.14);
        color: #fff;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      #title .kicker { font-size: 10px; letter-spacing: 0.18em; opacity: 0.7; font-weight: 700; }
      #title .h { margin-top: 6px; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
      #badge {
        position: absolute;
        right: 24px;
        bottom: 20px;
        padding: 10px 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        color: rgba(255,255,255,0.85);
        font-size: 11px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      }
    </style>
  </head>
  <body>
    <div id="wrap">
      <div id="map"></div>
      <div id="title">
        <div class="kicker">ZAKROM PRO • HEATMAP EXPORT</div>
        <div class="h">${safeTitle}</div>
      </div>
      <div id="badge">${args.points.length} nokta</div>
    </div>

    <script>
      window.__HEATMAP_READY__ = false;
      const POINTS = ${pointsJson};

      function initMap() {
        const center = POINTS.length
          ? {
              lat: POINTS.reduce((a, p) => a + p.lat, 0) / POINTS.length,
              lng: POINTS.reduce((a, p) => a + p.lng, 0) / POINTS.length
            }
          : { lat: 39.0, lng: 35.0 };

        const map = new google.maps.Map(document.getElementById("map"), {
          center,
          zoom: 11,
          disableDefaultUI: true,
          gestureHandling: "none",
          backgroundColor: "#0a0a0a",
          styles: [
            { elementType: "geometry", stylers: [{ color: "#111827" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#9CA3AF" }] },
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#1F2937" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b1220" }] }
          ]
        });

        const bounds = new google.maps.LatLngBounds();
        const data = POINTS.map((p) => {
          bounds.extend(p);
          return new google.maps.LatLng(p.lat, p.lng);
        });

        const heatmap = new google.maps.visualization.HeatmapLayer({
          data,
          radius: 34,
          opacity: 0.85
        });
        heatmap.setMap(map);

        if (POINTS.length > 0) {
          map.fitBounds(bounds, 80);
        }

        google.maps.event.addListenerOnce(map, "idle", () => {
          window.__HEATMAP_READY__ = true;
        });
      }
    </script>
    <script src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(args.apiKey)}&libraries=visualization&callback=initMap" async defer></script>
  </body>
</html>`;
}

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const { placeIds, format, userId, jobId } = job.data as {
      placeIds: string[];
      format: "png" | "pdf";
      userId: string;
      jobId: string;
    };

    await redis.set(`visual:${jobId}:status`, "processing", "EX", 3600);
    await redis.set(`visual:${jobId}:format`, format, "EX", 3600);

    let browser: Browser | null = null;
    try {
      const apiKey = getGoogleMapsKey();
      if (!apiKey) {
        throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/GOOGLE_MAPS_API_KEY eksik. Harita export için gerekli.");
      }

      const uniqueIds = Array.from(new Set((placeIds || []).filter(Boolean))).slice(0, 3000);
      const places = await prisma.place.findMany({
        where: { googleId: { in: uniqueIds } },
        select: { googleId: true, latitude: true, longitude: true },
      });

      const points = places
        .filter((p) => typeof p.latitude === "number" && typeof p.longitude === "number")
        .map((p) => ({ lat: p.latitude as number, lng: p.longitude as number }));

      if (points.length === 0) {
        throw new Error("Export edilecek konum verisi bulunamadı.");
      }

      const title = `Heatmap (${points.length})`;
      const html = buildHtml({ points, title, apiKey });

      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 2400, height: 1600, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.waitForFunction("window.__HEATMAP_READY__ === true", { timeout: 45_000 });
      // Puppeteer v24 removed Page.waitForTimeout.
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (format === "png") {
        const buf = await page.screenshot({ type: "png" });
        await redis.set(`visual:${jobId}:result`, Buffer.from(buf).toString("base64"), "EX", 3600);
      } else {
        const pdf = await page.pdf({
          printBackground: true,
          width: "2400px",
          height: "1600px",
          margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
        });
        await redis.set(`visual:${jobId}:result`, Buffer.from(pdf).toString("base64"), "EX", 3600);
      }

      await redis.set(`visual:${jobId}:status`, "completed", "EX", 3600);
      return { ok: true };
    } catch (err: any) {
      console.error("Visual export failed", err);
      await redis.set(`visual:${jobId}:status`, "failed", "EX", 3600);
      await redis.set(`visual:${jobId}:error`, err?.message || "Visual export failed", "EX", 3600);
      throw err;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  },
  { connection: redisConnection, concurrency: 1 }
);

export default worker;
