
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlaceDetailModal } from "@/components/PlaceDetailModal";
import { SearchForm } from "@/components/SearchForm";
import type { PlaceResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PLANS, type SubscriptionTier } from "@/lib/plans";
import { CREDIT_COSTS, CREDIT_COSTS_BY_TIER } from "@/lib/constants/pricing";

import { searchPlaces } from "@/app/actions/search-places";
import { getSearchJobStatus } from "@/app/actions/get-search-job";
import { getCreditSummary } from "@/app/actions/get-credit-history";
import { getSearchHistoryResults } from "@/app/actions/get-search-history-results";
import { unlockEmails } from "@/app/actions/unlock-emails";
import { getEnrichedPlaces } from "@/app/actions/get-enriched-places";
import { startExport } from "@/app/actions/start-export";

import {
  AlertTriangle,
  Check,
  Download,
  Filter,
  Loader2,
  Mail,
  MapPin,
  Search as SearchIcon,
  Star,
  Zap,
} from "lucide-react";

type CreditSummary = Awaited<ReturnType<typeof getCreditSummary>>;
type ExportFormat = "csv" | "xlsx" | "json";

function useEventSource() {
  const ref = useRef<EventSource | null>(null);
  useEffect(() => {
    return () => {
      ref.current?.close();
      ref.current = null;
    };
  }, []);
  return ref;
}

function mergePlaces(current: PlaceResult[], updates: Partial<PlaceResult>[]) {
  const byId = new Map<string, PlaceResult>();
  for (const p of current) byId.set(p.place_id, p);

  for (const u of updates) {
    const id = u.place_id;
    if (!id) continue;
    const prev = byId.get(id);
    byId.set(id, { ...(prev || ({ place_id: id, name: "" } as any)), ...(u as any) });
  }

  // Keep original order, append new ones at the end.
  const seen = new Set<string>();
  const out: PlaceResult[] = [];
  for (const p of current) {
    const next = byId.get(p.place_id);
    if (!next) continue;
    out.push(next);
    seen.add(p.place_id);
  }
  for (const [id, p] of byId.entries()) {
    if (seen.has(id)) continue;
    out.push(p);
  }
  return out;
}

export default function DashboardClient() {
  const searchParams = useSearchParams();

  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [refreshing, setRefreshing] = useState(true);

  const tier = (summary?.subscriptionTier as SubscriptionTier) || "FREE";
  const plan = PLANS[tier] || PLANS.FREE;

  const [searching, setSearching] = useState(false);
  const [searchJobId, setSearchJobId] = useState<string | null>(null);
  const searchEs = useEventSource();

  const [query, setQuery] = useState<{ city: string; keyword: string } | null>(null);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingHistoryResults, setLoadingHistoryResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [filters, setFilters] = useState({
    website: false,
    phone: false,
    rating45: false,
    onlyWithEmail: false,
  });

  const [includeEmails, setIncludeEmails] = useState(false);

  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      const s = await getCreditSummary();
      setSummary(s);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshAll().catch(() => setRefreshing(false));
  }, []);

  // Open cached results from Search History (navigated from /dashboard/leads)
  useEffect(() => {
    const historyId = searchParams.get("historyId");
    if (!historyId) return;

    let cancelled = false;
    (async () => {
      setLoadingHistoryResults(true);
      setError(null);
      try {
        const res = await getSearchHistoryResults(historyId);
        if (cancelled) return;

        if (res.success && res.results) {
          setQuery({ city: res.city, keyword: res.keyword });
          setSelectedId(null);
          setResults(res.results.places || []);
          setNextPageToken(res.results.nextPageToken);
        } else if ((res as any).expired) {
          setQuery({ city: (res as any).city, keyword: (res as any).keyword });
          setResults([]);
          setNextPageToken(undefined);
          setError((res as any).message || "Arama cache'i süresi dolmuş. Yeniden arama yapmanız gerekiyor.");
        } else {
          setError("Arama geçmişi yüklenemedi.");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Arama geçmişi yüklenemedi.");
      } finally {
        if (!cancelled) setLoadingHistoryResults(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const filtered = useMemo(() => {
    return (results || []).filter((p) => {
      if (filters.website && !p.website) return false;
      if (filters.phone && !p.formatted_phone_number && (!p.phones || p.phones.length === 0)) return false;
      if (filters.rating45 && (p.rating ?? 0) < 4.5) return false;
      const effectiveEmailCount =
        typeof p.emailCount === "number" ? p.emailCount : Array.isArray(p.emails) ? p.emails.length : 0;
      if (filters.onlyWithEmail && effectiveEmailCount <= 0) return false;
      return true;
    });
  }, [results, filters]);

  const selectedPlace = useMemo(() => {
    const all = filtered.length ? filtered : results;
    return all.find((p) => p.place_id === selectedId) || null;
  }, [filtered, results, selectedId]);

  const creditProgress = useMemo(() => {
    const credits = summary?.currentCredits ?? 0;
    const denom = Math.max(1, plan.credits);
    return Math.max(0, Math.min(1, credits / denom));
  }, [summary?.currentCredits, plan.credits]);

  const exportCostPreview = useMemo(() => {
    if (!includeEmails) return 0;
    const locked = filtered.filter((p) => !p.emailUnlocked).length;
    return locked * 3;
  }, [includeEmails, filtered]);

  const report = useMemo(() => {
    const total = results.length;
    const visible = filtered.length;
    let emailFoundBusinesses = 0;
    let emailUnlockedBusinesses = 0;
    let totalEmailCount = 0;

    for (const p of results) {
      const c =
        typeof (p as any).emailCount === "number"
          ? (p as any).emailCount
          : Array.isArray((p as any).emails)
            ? (p as any).emails.length
            : 0;
      if (c > 0) emailFoundBusinesses += 1;
      totalEmailCount += c;
      if ((p as any).emailUnlocked) emailUnlockedBusinesses += 1;
    }

    // Pricing preview: keep it explicit in UI (server controls the source of truth).
    const pageLoadCostPreview =
      (CREDIT_COSTS_BY_TIER as any)?.PAGE_LOAD?.[tier] ??
      CREDIT_COSTS.PAGINATION;

    return {
      total,
      visible,
      emailFoundBusinesses,
      emailUnlockedBusinesses,
      totalEmailCount,
      pageLoadCostPreview,
    };
  }, [results, filtered, tier]);

  // Stream search updates while a background job is running.
  useEffect(() => {
    // Always clean up previous stream.
    searchEs.current?.close();
    searchEs.current = null;

    if (!searchJobId) return;

    const es = new EventSource(`/api/stream-search?jobId=${encodeURIComponent(searchJobId)}`);
    searchEs.current = es;

    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (Array.isArray(payload)) {
          setResults((cur) => mergePlaces(cur, payload));
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      es.close();
      if (searchEs.current === es) searchEs.current = null;
    };

    return () => {
      es.close();
      if (searchEs.current === es) searchEs.current = null;
    };
  }, [searchJobId]);

  // Search job polling
  useEffect(() => {
    if (!searchJobId) return;

    let stop = false;
    const poll = async () => {
      while (!stop) {
        try {
          const status = await getSearchJobStatus(searchJobId);

          if (status.status === "completed") {
            const final = status.data;
            const places = Array.isArray(final) ? final : (final?.places || final?.data || []);
            setResults(places || []);
            setNextPageToken(!Array.isArray(final) ? final?.nextPageToken : undefined);
            setSearching(false);
            setSearchJobId(null);
            await refreshAll();
            return;
          }

          if (status.status === "failed") {
            setSearching(false);
            setSearchJobId(null);
            setError(status.error || "Arama başarısız.");
            await refreshAll();
            return;
          }

          if (status.status === "unknown") {
            // Job might be lost or expired
            // Stop after some retries? For now, keep polling or stop.
            // setSearching(false); setSearchJobId(null); setError("İşlem bulunamadı."); return;
          }

        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    void poll();

    return () => {
      stop = true;
    };
  }, [searchJobId]);


  // Export polling
  useEffect(() => {
    if (!exportJobId) return;
    let stop = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/exports/${exportJobId}`, { cache: "no-store" });
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

  const handleSearch = async (city: string, keyword: string) => {
    setError(null);
    setQuery({ city, keyword });
    setSelectedId(null);
    setResults([]);
    setNextPageToken(undefined);
    setExportJobId(null);
    setExportStatus(null);

    setSearching(true);
    try {
      const res = await searchPlaces(city, keyword, undefined, true);

      if (res.jobId) {
        setSearchJobId(res.jobId);
        // Searching stays true
      } else if (res.data) {
        setResults(res.data || []); // res.data is PlaceResult[]
        setNextPageToken(res.nextPageToken);

        setSearching(false);
        await refreshAll();
      }
    } catch (e: any) {
      setSearching(false);
      setError(e?.message || "Arama başarısız.");
      await refreshAll().catch(() => { });
    }

  };

  const handleLoadMore = async () => {
    if (!query?.city || !query?.keyword) return;
    if (!nextPageToken) return;
    if (nextPageToken === "plan_limit_reached" || nextPageToken === "google_limit_reached") return;
    if (loadingMore) return;

    setError(null);
    setLoadingMore(true);
    try {
      const res = await searchPlaces(query.city, query.keyword, nextPageToken, true);
      const more = res.data || [];
      setResults((cur) => mergePlaces(cur, more));
      setNextPageToken(res.nextPageToken);
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Sayfa yüklenemedi.");
      await refreshAll().catch(() => { });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleUnlock = async (placeIds: string[]) => {
    setError(null);
    try {
      const res = await unlockEmails(placeIds);

      // Immediately reflect unlock status (emails may arrive asynchronously).
      setResults((cur) =>
        mergePlaces(
          cur,
          placeIds.map((id) => ({ place_id: id, emailUnlocked: true }))
        )
      );

      await refreshAll();

      // Pull current DB state (emailCount/masked/scrapeStatus)
      const enriched = await getEnrichedPlaces(placeIds);
      setResults((cur) => mergePlaces(cur, enriched as any));

      if (res.jobId) {
        // Re-use the existing stream endpoint: enrichment worker publishes into `search:updates:${jobId}`.
        const es = new EventSource(`/api/stream-search?jobId=${encodeURIComponent(res.jobId)}`);
        const timeout = setTimeout(() => es.close(), 60_000);
        es.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            if (Array.isArray(payload)) setResults((cur) => mergePlaces(cur, payload));
          } catch {
            // ignore
          }
        };
        es.onerror = () => {
          clearTimeout(timeout);
          es.close();
        };
      }
    } catch (e: any) {
      setError(e?.message || "Mail kilidi açılamadı.");
      await refreshAll().catch(() => { });
    }
  };

  const handleExport = async (format: ExportFormat) => {
    const ids = filtered.map((p) => p.place_id).filter(Boolean);
    if (ids.length === 0) return;

    setError(null);
    setExportJobId(null);
    setExportStatus(null);
    try {
      const res = await startExport({ placeIds: ids, format, includeEmails });
      setExportJobId(res.jobId);
      setExportStatus("pending");
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Export başlatılamadı.");
      await refreshAll().catch(() => { });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Lead Discovery Engine
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Arama yapin, filtreleyin, mail kilitlerini acin ve export alin.
          </p>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-md min-w-[280px]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-white/40 font-bold uppercase tracking-widest">Kredi</div>
              <div className="text-xs text-white/50">
                <span className="font-mono">{(summary?.currentCredits ?? 0).toLocaleString()}</span>{" "}
                /{" "}
                <span className="font-mono">{plan.credits.toLocaleString()}</span>
              </div>
            </div>
            <div className="mt-2 w-full bg-white/5 rounded-full h-2 overflow-hidden">
              <div
                className={cn(
                  "h-full bg-gradient-to-r from-primary to-purple-600",
                  (summary?.currentCredits ?? 0) < 25 ? "from-yellow-400 to-orange-500" : ""
                )}
                style={{ width: `${Math.round(creditProgress * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
              <span className="font-bold uppercase tracking-widest">{tier}</span>
              <Link href="/dashboard/settings" className="text-primary hover:underline">
                Plan/Kredi Yönet
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Deep Search toggle moved to SearchForm */}

            <button
              onClick={() => refreshAll()}
              disabled={refreshing}
              className="px-4 py-3 rounded-2xl border bg-white/5 border-white/10 text-sm font-bold text-white/70 hover:bg-white/10 transition-all disabled:opacity-60"
            >
              {refreshing ? <Loader2 className="inline-block w-4 h-4 mr-2 animate-spin" /> : null}
              Yenile
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
        <SearchForm onSearch={handleSearch} isLoading={searching} showRecentSearches={false} />
        <div className="mt-3 text-xs text-white/40 flex items-center gap-2">
          <SearchIcon className="w-4 h-4 text-primary" />
          Arama: <span className="font-mono">{query ? `${query.keyword} • ${query.city}` : "—"}</span>
          {searchJobId ? <span className="ml-auto font-mono">job: {searchJobId}</span> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-red-400" />
            <div className="flex-1">
              <span className="font-bold block mb-0.5">Hata</span>
              {error}
            </div>
          </div>
          {error.includes("cache") && query && (
            <button
              onClick={() => handleSearch(query.city, query.keyword)}
              className="px-4 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shrink-0"
            >
              Yeniden Ara
            </button>
          )}
        </div>
      ) : null}

      {/* Main Split */}
      <div className="grid grid-cols-1 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Rapor + Filtre (yan yana) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-black/20 border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden">
              <div className="p-4 bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-black uppercase tracking-widest text-white/50">Rapor</div>
                  <div className="text-xs text-white/40 font-mono">
                    {loadingHistoryResults ? "yükleniyor" : `${report.visible}/${report.total}`}
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-white/40">
                  Arama:{" "}
                  <span className="font-mono text-white/70">
                    {query ? `${query.keyword} • ${query.city}` : "—"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Toplam</div>
                    <div className="mt-1 text-sm font-black text-white">{report.total}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Gorunen</div>
                    <div className="mt-1 text-sm font-black text-white">{report.visible}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Mail Bulunan</div>
                    <div className="mt-1 text-sm font-black text-white">{report.emailFoundBusinesses}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Kilidi Acik</div>
                    <div className="mt-1 text-sm font-black text-white">{report.emailUnlockedBusinesses}</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-white/40">
                  <span>
                    Daha Fazla: <span className="font-mono text-white/70">{report.pageLoadCostPreview}</span> kredi
                  </span>
                  <span className="font-mono text-white/60">
                    {nextPageToken ? "devam var" : "son"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-black/20 border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden">
              <div className="p-4 bg-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Filter className="w-4 h-4 text-primary" /> Filtreler
                  </div>
                  <div className="text-xs text-white/50">
                    {filtered.length} / {results.length}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Toggle
                    label="Web sitesi"
                    on={filters.website}
                    onToggle={() => setFilters((f) => ({ ...f, website: !f.website }))}
                  />
                  <Toggle
                    label="Telefon"
                    on={filters.phone}
                    onToggle={() => setFilters((f) => ({ ...f, phone: !f.phone }))}
                  />
                  <Toggle
                    label="4.5+"
                    on={filters.rating45}
                    onToggle={() => setFilters((f) => ({ ...f, rating45: !f.rating45 }))}
                  />
                  <Toggle
                    label="Sadece mail"
                    on={filters.onlyWithEmail}
                    onToggle={() => setFilters((f) => ({ ...f, onlyWithEmail: !f.onlyWithEmail }))}
                  />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => handleUnlock(filtered.map((p) => p.place_id))}
                    disabled={!plan.features.emailEnrichment || filtered.length === 0}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                      plan.features.emailEnrichment
                        ? "bg-primary text-white hover:bg-primary/90"
                        : "bg-white/5 border border-white/10 text-white/40 cursor-not-allowed"
                    )}
                    title={plan.features.emailEnrichment ? "3 kredi / işletme" : "Growth/Business gerekli"}
                  >
                    <Mail className="inline-block w-4 h-4 mr-2" />
                    Mailleri Ac
                  </button>

                  <label className={cn("px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2",
                    includeEmails ? "border-primary/40 bg-primary/10 text-white" : "border-white/10 bg-white/5 text-white/60",
                    !plan.features.emailEnrichment ? "opacity-50 cursor-not-allowed" : ""
                  )}>
                    <input
                      type="checkbox"
                      className="accent-primary"
                      disabled={!plan.features.emailEnrichment}
                      checked={includeEmails}
                      onChange={(e) => setIncludeEmails(e.target.checked)}
                    />
                    Export'ta mail
                  </label>
                </div>

                <div className="mt-2 text-[11px] text-white/40">
                  Export tahmini maliyet: <span className="font-mono">{exportCostPreview}</span> kredi
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <ActionButton label="CSV" icon={<Download className="w-4 h-4" />} onClick={() => handleExport("csv")} disabled={filtered.length === 0 || !plan.features.export.includes("csv")} />
                  <ActionButton label="Excel" icon={<Download className="w-4 h-4" />} onClick={() => handleExport("xlsx")} disabled={filtered.length === 0 || !plan.features.export.includes("xlsx")} />
                  <ActionButton label="JSON" icon={<Download className="w-4 h-4" />} onClick={() => handleExport("json")} disabled={filtered.length === 0 || !plan.features.export.includes("json")} />
                </div>

                {exportJobId ? (
                  <div className="mt-3 text-[11px] text-white/50">
                    Export job: <span className="font-mono">{exportJobId}</span> ({exportStatus})
                    {exportStatus === "completed" ? (
                      <a
                        className="ml-2 text-primary hover:underline font-bold"
                        href={`/api/exports/${exportJobId}?download=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                      >
                        indir
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Liste: tek tek isimler + pagination */}
          <div className="bg-black/20 border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto">
              {searching ? (
                <div className="p-8 flex flex-col items-center justify-center text-center">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-primary/20 animate-pulse" />
                    <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-primary animate-spin" />
                  </div>
                  <div className="mt-6 text-lg font-black text-white animate-pulse">
                    Taranıyor...
                  </div>
                  <div className="mt-2 text-sm text-white/50">
                    {query?.city || "Lokasyon"} bölgesinde işletmeler aranıyor
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-white/30">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-sm text-white/40">Sonuç yok. Arama yapın veya filtreleri gevşetin.</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filtered.map((p) => (
                    <div
                      key={p.place_id}
                      onClick={() => setSelectedId(p.place_id)}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "w-full text-left p-4 hover:bg-white/5 transition-all cursor-pointer block",
                        selectedId === p.place_id ? "bg-primary/10" : ""
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black text-white line-clamp-1">{p.name}</div>
                          <div className="mt-1 text-[11px] text-white/40 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span className="line-clamp-1">{p.formatted_address || "—"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-black tracking-widest border",
                              (p.rating ?? 0) >= 4.5
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                                : "bg-white/5 border-white/10 text-white/50"
                            )}
                          >
                            <Star className="inline-block w-3 h-3 mr-1 align-[-2px]" />
                            {(p.rating ?? 0).toFixed(1)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-xs text-white/60 flex items-center gap-2">
                          <Mail className="w-4 h-4 text-primary" />
                          <EmailCell place={p} />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(p.place_id);
                              setDetailOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/70 hover:bg-white/10"
                          >
                            Detay
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnlock([p.place_id]);
                            }}
                            disabled={!plan.features.emailEnrichment || Boolean(p.emailUnlocked)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                              !plan.features.emailEnrichment
                                ? "bg-white/5 border border-white/10 text-white/40 cursor-not-allowed"
                                : p.emailUnlocked
                                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 cursor-default"
                                  : "bg-primary text-white hover:bg-primary/90"
                            )}
                            title={!plan.features.emailEnrichment ? "Growth/Business gerekli" : "3 kredi"}
                          >
                            {p.emailUnlocked ? (
                              <>
                                <Check className="inline-block w-4 h-4 mr-1" /> Açık
                              </>
                            ) : (
                              "Mail Aç"
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-white/10 bg-black/30">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-white/50">
                  {nextPageToken === "plan_limit_reached"
                    ? "Plan limiti nedeniyle daha fazla gösterilemiyor."
                    : nextPageToken === "google_limit_reached"
                      ? "Google limitine ulaşıldı."
                      : nextPageToken
                        ? "Daha fazla sonuç var."
                        : "—"}
                </div>
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore || !nextPageToken || nextPageToken === "plan_limit_reached" || nextPageToken === "google_limit_reached"}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs font-black transition-all disabled:opacity-60"
                >
                  {loadingMore ? "Yükleniyor..." : "Daha Fazla"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PlaceDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        place={selectedPlace}
      />
    </div>
  );
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all",
        on ? "bg-primary/15 border-primary/40 text-white" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
      )}
    >
      {label}
    </button>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
        disabled ? "bg-white/5 border-white/10 text-white/30 cursor-not-allowed" : "bg-white/10 text-white hover:bg-white/20 border-white/10"
      )}
    >
      {icon} {label}
    </button>
  );
}

function EmailCell({ place }: { place: PlaceResult }) {
  const emailUnlocked = Boolean(place.emailUnlocked);
  const emailCount = place.emailCount ?? (place.emails?.length || 0);
  const masked = place.maskedEmails?.[0];

  if (emailUnlocked) {
    if (place.scrapeStatus === "PROCESSING") return <span className="text-white/50">Mail aranıyor...</span>;
    if (place.emails && place.emails.length > 0) return <span className="text-emerald-300">{place.emails[0]}</span>;
    return <span className="text-white/40">Bulunamadı</span>;
  }

  if (masked) return <span className="text-white/60 blur-[1px]">{masked}</span>;
  if (emailCount > 0) return <span className="text-white/60 blur-[1px]">*****@*****</span>;
  return <span className="text-white/40 italic">kilitli</span>;
}
