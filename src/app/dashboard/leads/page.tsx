"use client";

import { useEffect, useMemo, useState } from "react";
import { getLeads } from "@/app/actions/get-leads";
import { getSearchHistory } from "@/app/actions/get-search-history";
import { getSearchHistoryResults } from "@/app/actions/get-search-history-results";
import { searchPlaces } from "@/app/actions/search-places";
import { startExport } from "@/app/actions/start-export";
import { unlockEmails } from "@/app/actions/unlock-emails";
import { getEnrichedPlaces } from "@/app/actions/get-enriched-places";
import type { PlaceResult } from "@/lib/types";
import { Download, FileJson, FileSpreadsheet, Loader2, Mail, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalyticsMap } from "@/components/AnalyticsMap";

type ExportFormat = "csv" | "xlsx" | "json";
type SearchHistoryItem = Awaited<ReturnType<typeof getSearchHistory>>[number];

export default function LeadsPage() {
  const [leads, setLeads] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState("");

  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<{ city: string; keyword: string } | null>(null);
  const [historyResults, setHistoryResults] = useState<PlaceResult[]>([]);
  const [historyNextToken, setHistoryNextToken] = useState<string | undefined>(undefined);
  const [historyResultsLoading, setHistoryResultsLoading] = useState(false);
  const [historyResultsError, setHistoryResultsError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    getLeads(150)
      .then((items) => setLeads(items || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getSearchHistory(30)
      .then((h) => setHistory(h as any))
      .finally(() => setHistoryLoading(false));
  }, []);

  const placeIds = useMemo(() => leads.map((l) => l.place_id).filter(Boolean), [leads]);
  const filteredHistory = useMemo(() => {
    const q = historyFilter.trim().toLowerCase();
    if (!q) return history;
    return (history || []).filter((h: any) => {
      const city = String(h?.city || "").toLowerCase();
      const keyword = String(h?.keyword || "").toLowerCase();
      return city.includes(q) || keyword.includes(q);
    });
  }, [history, historyFilter]);

  useEffect(() => {
    if (!exportJobId) return;
    let stop = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/exports/${exportJobId}`);
        const data = await res.json();
        if (stop) return;
        setExportStatus(data.status);
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
        }
      } catch {
        // ignore
      }
    }, 1200);
    return () => {
      stop = true;
      clearInterval(interval);
    };
  }, [exportJobId]);

  const handleExport = async (format: ExportFormat) => {
    if (placeIds.length === 0) return;
    setBusy(`export:${format}`);
    setExportJobId(null);
    setExportStatus(null);
    try {
      const res = await startExport({ placeIds, format, includeEmails: true });
      setExportJobId(res.jobId);
      setExportStatus("pending");
    } catch (e: any) {
      alert(e?.message || "Export başlatılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const loadHistoryResults = async (id: string) => {
    setSelectedHistoryId(id);
    setHistoryResultsError(null);
    setHistoryResultsLoading(true);
    try {
      const res = await getSearchHistoryResults(id);
      if ((res as any).success && (res as any).results) {
        setSelectedQuery({ city: (res as any).city, keyword: (res as any).keyword });
        setHistoryResults(((res as any).results?.places || []) as PlaceResult[]);
        setHistoryNextToken((res as any).results?.nextPageToken);
      } else if ((res as any).expired) {
        setSelectedQuery({ city: (res as any).city, keyword: (res as any).keyword });
        setHistoryResults([]);
        setHistoryNextToken(undefined);
        setHistoryResultsError((res as any).message || "Arama cache'i süresi dolmuş. Yeniden arama yapmanız gerekiyor.");
      } else {
        setHistoryResults([]);
        setHistoryNextToken(undefined);
        setHistoryResultsError("Arama sonucu yuklenemedi.");
      }
    } catch (e: any) {
      setHistoryResults([]);
      setHistoryNextToken(undefined);
      setHistoryResultsError(e?.message || "Arama sonucu yuklenemedi.");
    } finally {
      setHistoryResultsLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!selectedQuery?.city || !selectedQuery?.keyword) return;
    if (!historyNextToken) return;
    if (loadingMore) return;
    if (historyNextToken === "plan_limit_reached" || historyNextToken === "google_limit_reached") return;

    setLoadingMore(true);
    setHistoryResultsError(null);
    try {
      // This is an explicit user action ("Daha Fazla") and should charge credits according to plan.
      const res = await searchPlaces(selectedQuery.city, selectedQuery.keyword, historyNextToken, true);
      const more = (res.data || []) as PlaceResult[];
      setHistoryResults((cur) => [...cur, ...more]);
      setHistoryNextToken(res.nextPageToken);
    } catch (e: any) {
      setHistoryResultsError(e?.message || "Daha fazla yuklenemedi.");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleUnlock = async (placeId: string) => {
    setBusy(`unlock:${placeId}`);
    try {
      const res = await unlockEmails([placeId]);
      // optimistic
      setLeads((cur) =>
        cur.map((p) => (p.place_id === placeId ? { ...p, emailUnlocked: true } : p))
      );

      // pull current DB state
      const enriched = await getEnrichedPlaces([placeId]);
      const map = new Map(enriched.map((x: any) => [x.place_id, x]));
      setLeads((cur) => cur.map((p) => (map.get(p.place_id) ? { ...p, ...(map.get(p.place_id) as any) } : p)));
      setHistoryResults((cur) => cur.map((p) => (map.get(p.place_id) ? { ...p, ...(map.get(p.place_id) as any) } : p)));
      void res;
    } catch (e: any) {
      alert(e?.message || "Mail kilidi acilamadi.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Potansiyel Müşteriler
          </h1>
          <p className="text-gray-400 mt-1">
            Geçmiş aramalarınız ve kilidi açılmış lead'ler.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-xs text-white/50 flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            {leads.length} kayıt
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport("csv")}
              disabled={busy !== null || placeIds.length === 0}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                "bg-white text-black hover:bg-gray-200 disabled:opacity-60"
              )}
            >
              {busy === "export:csv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              CSV
            </button>
            <button
              onClick={() => handleExport("xlsx")}
              disabled={busy !== null || placeIds.length === 0}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                "bg-white text-black hover:bg-gray-200 disabled:opacity-60"
              )}
            >
              {busy === "export:xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Excel
            </button>
            <button
              onClick={() => handleExport("json")}
              disabled={busy !== null || placeIds.length === 0}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                "bg-white text-black hover:bg-gray-200 disabled:opacity-60"
              )}
            >
              {busy === "export:json" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
              JSON
            </button>
          </div>

          {exportJobId ? (
            <div className="text-xs text-white/50">
              Export: <span className="font-mono">{exportJobId}</span> ({exportStatus})
              {exportStatus === "completed" ? (
                <a
                  className="ml-2 text-primary hover:underline"
                  href={`/api/exports/${exportJobId}?download=true`}
                >
                  indir
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Search History */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Search className="w-4 h-4 text-primary" />
              Gecmis Aramalar
            </div>
            <div className="text-xs text-white/50 font-mono">
              {historyLoading ? "yukleniyor" : `${history.length} kayit`}
            </div>
          </div>

          <div className="mt-3">
            <input
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              placeholder="Ara: sehir veya kelime..."
              className="w-full h-10 rounded-xl bg-black/30 border border-white/10 px-3 text-sm text-white/80 placeholder:text-white/30 outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {historyLoading ? (
              <div className="text-sm text-white/40">Yukleniyor...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-sm text-white/40">Kayit yok.</div>
            ) : (
              filteredHistory.map((h: any) => (
                <button
                  key={h.id}
                  onClick={() => loadHistoryResults(h.id)}
                  className={cn(
                    "w-full text-left rounded-2xl border border-white/10 transition-all p-4",
                    selectedHistoryId === h.id ? "bg-primary/10" : "bg-black/30 hover:bg-white/5"
                  )}
                  title="Cache'den acilir, kredi dusmez. 'Daha Fazla' tiklarsan kredi duser."
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white line-clamp-1">{h.keyword}</div>
                      <div className="mt-1 text-[11px] text-white/40 line-clamp-1">{h.city}</div>
                    </div>
                    <div className="shrink-0 text-[11px] text-white/50 font-mono">
                      {typeof h.resultCount === "number" ? `${h.resultCount}` : "—"}
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-white/30 font-mono">
                    {h.createdAt ? new Date(h.createdAt).toLocaleString() : ""}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Heatmap + Results from selected history */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-white">Is Haritasi (Heatmap)</div>
              <div className="text-xs text-white/50 font-mono">
                {selectedQuery ? `${selectedQuery.keyword} • ${selectedQuery.city}` : "—"}
              </div>
            </div>

            {historyResultsError ? (
              <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {historyResultsError}
              </div>
            ) : null}

            <div className="mt-4">
              {historyResultsLoading ? (
                <div className="h-[420px] rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-white/60" />
                </div>
              ) : historyResults.length === 0 ? (
                <div className="h-[420px] rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center text-sm text-white/40">
                  Bir arama secin.
                </div>
              ) : (
                <AnalyticsMap results={historyResults} />
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-white/50">
                {historyNextToken === "plan_limit_reached"
                  ? "Plan limiti nedeniyle daha fazla gosterilemiyor."
                  : historyNextToken === "google_limit_reached"
                    ? "Google limitine ulasildi."
                    : historyNextToken
                      ? "Daha fazla sonuc var."
                      : "—"}
              </div>
              <button
                onClick={handleLoadMore}
                disabled={loadingMore || !historyNextToken || historyNextToken === "plan_limit_reached" || historyNextToken === "google_limit_reached"}
                className="px-4 py-2 rounded-xl bg-white text-black text-xs font-black hover:bg-gray-200 disabled:opacity-60"
              >
                {loadingMore ? "Yukleniyor..." : "Daha Fazla"}
              </button>
            </div>
          </div>

          <div className="bg-black/20 border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden">
            <div className="p-4 bg-white/5 flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-white">Arama Sonuclari</div>
              <div className="text-xs text-white/50 font-mono">
                {historyResultsLoading ? "yukleniyor" : `${historyResults.length} sonuc`}
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto divide-y divide-white/5">
              {historyResultsLoading ? (
                <div className="p-8 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-white/60" />
                </div>
              ) : historyResults.length === 0 ? (
                <div className="p-6 text-sm text-white/40">Sonuc yok.</div>
              ) : (
                historyResults.map((p) => (
                  <div key={p.place_id} className="p-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-black text-white line-clamp-1">{p.name}</div>
                        <div className="mt-1 text-[11px] text-white/40 line-clamp-1">{p.formatted_address || "—"}</div>
                        <div className="mt-2 text-xs text-white/60">
                          {p.emailUnlocked ? (
                            (p.emails && p.emails.length > 0 ? (
                              <span className="text-emerald-300">{p.emails[0]}</span>
                            ) : (
                              <span className="text-white/40">Bulunamadi</span>
                            ))
                          ) : (
                            (p.maskedEmails && p.maskedEmails.length > 0 ? (
                              <span className="text-white/60 blur-[1px]">{p.maskedEmails[0]}</span>
                            ) : (
                              <span className="text-white/40 italic">kilitli</span>
                            ))
                          )}
                        </div>
                        <div className="mt-2 text-[11px] text-white/30 font-mono">
                          {p.scrapeStatus ? `scrape: ${p.scrapeStatus}` : ""}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => handleUnlock(p.place_id)}
                          disabled={busy !== null || Boolean(p.emailUnlocked)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                            p.emailUnlocked
                              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 cursor-default"
                              : "bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                          )}
                          title={p.emailUnlocked ? "Acik" : "3 kredi"}
                        >
                          {p.emailUnlocked ? "Acik" : "Mail Ac"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-black/20 border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden">
            <div className="p-4 bg-white/5 flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                Lead'ler
              </div>
              <div className="text-xs text-white/50 font-mono">
                {loading ? "yukleniyor" : `${leads.length} kayit`}
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto divide-y divide-white/5">
              {loading ? (
                <div className="p-8 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-white/60" />
                </div>
              ) : leads.length === 0 ? (
                <div className="p-6 text-sm text-white/40">Lead yok.</div>
              ) : (
                leads.map((p) => (
                  <div key={p.place_id} className="p-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-black text-white line-clamp-1">{p.name}</div>
                        <div className="mt-1 text-[11px] text-white/40 line-clamp-1">{p.formatted_address || "—"}</div>
                        <div className="mt-2 text-xs text-white/60">
                          {p.emailUnlocked ? (
                            (p.emails && p.emails.length > 0 ? (
                              <span className="text-emerald-300">{p.emails[0]}</span>
                            ) : (
                              <span className="text-white/40">Bulunamadi</span>
                            ))
                          ) : (
                            (p.maskedEmails && p.maskedEmails.length > 0 ? (
                              <span className="text-white/60 blur-[1px]">{p.maskedEmails[0]}</span>
                            ) : (
                              <span className="text-white/40 italic">kilitli</span>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => handleUnlock(p.place_id)}
                          disabled={busy !== null || Boolean(p.emailUnlocked)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                            p.emailUnlocked
                              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 cursor-default"
                              : "bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                          )}
                          title={p.emailUnlocked ? "Acik" : "3 kredi"}
                        >
                          {p.emailUnlocked ? "Acik" : "Mail Ac"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
