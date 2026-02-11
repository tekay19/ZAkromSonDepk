"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  BarChart2,
  CheckCircle2,
  Check,
  Hexagon,
  RefreshCw,
  DownloadCloud,
  FileText,
  FileSpreadsheet,
  Maximize2,
  Users,
  Phone,
  Mail,
  MapPin,
  Star,
  AlertTriangle,
  Loader2,
  Search as SearchIcon,
  Download,
  Filter,
  X
} from "lucide-react";

import { PlaceDetailModal } from "@/components/PlaceDetailModal";
import { SearchForm } from "@/components/SearchForm";
import { AnalyticsMap } from "@/components/AnalyticsMap";
import type { PlaceResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PLANS, type SubscriptionTier } from "@/lib/plans";
import { CREDIT_COSTS, CREDIT_COSTS_BY_TIER } from "@/lib/constants/pricing";

import { searchPlaces } from "@/app/actions/search-places";
import { getCreditSummary } from "@/app/actions/get-credit-history";
import { getSearchHistoryResults } from "@/app/actions/get-search-history-results";
import { unlockEmails } from "@/app/actions/unlock-emails";
import { getEnrichedPlaces } from "@/app/actions/get-enriched-places";
import { startExport } from "@/app/actions/start-export";

type CreditSummary = Awaited<ReturnType<typeof getCreditSummary>>;
type ExportFormat = "csv" | "xlsx" | "json";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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

  // Open cached results from Search History
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

  const report = useMemo(() => {
    const total = results.length;
    const visible = filtered.length;
    let emailFoundBusinesses = 0;
    let emailUnlockedBusinesses = 0;

    for (const p of results) {
      const c = typeof p.emailCount === "number" ? p.emailCount : Array.isArray(p.emails) ? p.emails.length : 0;
      if (c > 0) emailFoundBusinesses++;
      if (p.emailUnlocked) emailUnlockedBusinesses++;
    }
    return {
      total,
      visible,
      emailFoundBusinesses,
      emailUnlockedBusinesses,
      pageLoadCostPreview: CREDIT_COSTS_BY_TIER.PAGE_LOAD[tier],
    };
  }, [results, filtered, plan]);

  const exportCostPreview = useMemo(() => {
    if (!includeEmails) return 0;
    const locked = filtered.filter((p) => !p.emailUnlocked).length;
    return locked * 3;
  }, [includeEmails, filtered]);

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

  // Search Job Polling
  useEffect(() => {
    if (!searchJobId) return;
    let stop = false;
    const poll = async () => {
      while (!stop) {
        try {
          const res = await fetch(`/api/search-status?jobId=${searchJobId}`, { cache: "no-store" });
          const data = await res.json();
          if (stop) break;
          if (data.status === "completed" && data.data) {
            setResults(data.data || []);
            setNextPageToken(data.nextPageToken);
            setSearching(false);
            setSearchJobId(null);
            await refreshAll();
            break;
          }
          if (data.status === "failed") {
            setSearching(false);
            setSearchJobId(null);
            setError(data.error || "Arama başarısız oldu.");
            break;
          }
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };

    void poll();

    return () => {
      stop = true;
    };
  }, [searchJobId]);

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
      } else if (res.data) {
        setResults(res.data || []);
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
    if (!query?.city || !query?.keyword || !nextPageToken || loadingMore) return;
    setError(null);
    setLoadingMore(true);
    try {
      const res = await searchPlaces(query.city, query.keyword, nextPageToken, true);
      setResults((cur) => mergePlaces(cur, res.data || []));
      setNextPageToken(res.nextPageToken);
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Sayfa yüklenemedi.");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleUnlock = async (placeIds: string[]) => {
    setError(null);
    try {
      const res = await unlockEmails(placeIds);
      setResults((cur) => mergePlaces(cur, placeIds.map((id) => ({ place_id: id, emailUnlocked: true }))));
      await refreshAll();
      const enriched = await getEnrichedPlaces(placeIds);
      setResults((cur) => mergePlaces(cur, enriched as any));
    } catch (e: any) {
      setError(e?.message || "Mail kilidi açılamadı.");
    }
  };

  const handleExport = async (format: ExportFormat) => {
    const ids = filtered.map((p) => p.place_id).filter(Boolean);
    if (!ids.length) return;
    setError(null);
    try {
      const res = await startExport({ placeIds: ids, format, includeEmails });
      setExportJobId(res.jobId);
      setExportStatus("pending");
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Export başlatılamadı.");
    }
  };

  return (
    <div className="space-y-12 pb-24 selection:bg-primary/30 selection:text-white">
      {/* Top Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.2em] font-black text-primary mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Canli Veri Akisi
          </div>
          <h1 className="text-5xl font-black tracking-tight bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent drop-shadow-2xl">
            Lead Discovery <span className="text-primary italic">Engine</span>
          </h1>
          <p className="text-lg text-white/50 mt-4 font-medium max-w-xl leading-relaxed">
            Yeni nesil yapay zeka destekli lead tarama ve analiz sistemiyle isletmenizi büyütün.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col md:flex-row md:items-center gap-6"
        >
          {/* Credit Display */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-accent rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition duration-500" />
            <div className="relative bg-[#0a0a0a]/80 border border-white/10 rounded-[2rem] px-8 py-5 backdrop-blur-3xl min-w-[340px]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] text-white/40 font-black uppercase tracking-widest mb-1.5">Hesap Bakiyesi</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-white italic">{(summary?.currentCredits ?? 0).toLocaleString()}</span>
                    <span className="text-xs text-white/30 font-bold">Kredi</span>
                  </div>
                </div>
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10">
                  <Hexagon className="w-7 h-7 text-primary" />
                </div>
              </div>

              <div className="mt-5 w-full bg-white/5 rounded-full h-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(creditProgress * 100)}%` }}
                  className={cn(
                    "h-full bg-gradient-to-r from-primary via-indigo-400 to-accent",
                    (summary?.currentCredits ?? 0) < 25 ? "from-yellow-400 to-red-500" : ""
                  )}
                />
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary/80">{tier} Plan</span>
                <Link href="/dashboard/settings" className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 hover:text-white transition-colors">
                  Yükselt &rarr;
                </Link>
              </div>
            </div>
          </div>

          <button
            onClick={() => refreshAll()}
            disabled={refreshing}
            className="group px-8 py-5 rounded-[2rem] border bg-white/5 border-white/10 text-sm font-black text-white/90 hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-3 backdrop-blur-md"
          >
            <RefreshCw className={cn("w-5 h-5 text-primary group-hover:rotate-180 transition-transform duration-700", refreshing && "animate-spin")} />
            Verileri Güncelle
          </button>
        </motion.div>
      </div>

      {error ? (
        <div className="rounded-[2rem] border border-red-500/20 bg-red-500/10 px-8 py-5 text-sm text-red-100 flex items-center justify-between gap-6 backdrop-blur-3xl animate-in fade-in slide-in-from-top-4">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 mt-0.5 shrink-0 text-red-400" />
            <div>
              <span className="font-black text-red-300 block mb-1 uppercase tracking-widest text-[10px]">Sistem Hatası</span>
              {error}
            </div>
          </div>
          {error.includes("cache") && query && (
            <button
              onClick={() => handleSearch(query.city, query.keyword)}
              className="px-6 py-2.5 bg-red-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-red-500/20"
            >
              Yeniden Dene
            </button>
          )}
        </div>
      ) : null}

      {/* Main Search Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-1 rounded-[3.5rem] bg-gradient-to-br from-white/10 via-transparent to-white/5 border border-white/5 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[#050505]/40 backdrop-blur-3xl -z-10" />
        <div className="p-12">
          <SearchForm onSearch={handleSearch} isLoading={searching} showRecentSearches={false} />

          <div className="mt-8 flex flex-wrap items-center gap-10 text-xs text-white/30 border-t border-white/5 pt-8">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
              Aktif Arama: <span className="font-black text-white/60 tracking-tight italic">{query ? `${query.keyword} in ${query.city}` : "Yok"}</span>
            </div>
            {searchJobId && (
              <div className="flex items-center gap-3 px-4 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
                <span className="font-black text-primary uppercase text-[10px] tracking-widest">Job ID:</span>
                <span className="font-mono text-white/50">{searchJobId}</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Results Dashboard - Control Center Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Stats Card */}
        <section className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-3xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-[60px] -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-6 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" /> Rapor Görüntüsü
          </h3>

          <div className="flex items-center justify-between gap-4">
            {[
              { label: "Lead", value: report.total, icon: Users, color: "text-primary" },
              { label: "Mail", value: report.emailFoundBusinesses, icon: Mail, color: "text-accent" },
              { label: "Açık", value: report.emailUnlockedBusinesses, icon: CheckCircle2, color: "text-emerald-400" },
            ].map((stat, i) => (
              <div key={i} className="flex flex-col items-center group/stat">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-500 mb-2",
                  "bg-white/5 border-white/10 group-hover/stat:scale-110 group-hover/stat:border-white/20")}>
                  <stat.icon className={cn("w-5 h-5", stat.color)} />
                </div>
                <div className="text-xl font-black text-white italic">{stat.value}</div>
                <div className="text-[8px] font-black uppercase tracking-widest text-white/20">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="flex justify-between items-end mb-2">
              <span className="text-[9px] font-black uppercase text-white/20 tracking-widest">Verimlilik</span>
              <span className="text-xs font-black text-white tracking-widest">{Math.round((report.visible / report.total) * 100 || 0)}%</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1 p-0.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(report.visible / report.total) * 100}%` }}
                className="h-full bg-primary rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]"
              />
            </div>
          </div>
        </section>

        {/* Filters Card */}
        <section className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-3xl shadow-2xl">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-6 flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" /> Filtreleme
          </h3>

          <div className="flex flex-wrap gap-2">
            <Toggle label="Web" on={filters.website} onToggle={() => setFilters((f) => ({ ...f, website: !f.website }))} />
            <Toggle label="Tel" on={filters.phone} onToggle={() => setFilters((f) => ({ ...f, phone: !f.phone }))} />
            <Toggle label="4.5+" on={filters.rating45} onToggle={() => setFilters((f) => ({ ...f, rating45: !f.rating45 }))} />
            <Toggle label="Mail" on={filters.onlyWithEmail} onToggle={() => setFilters((f) => ({ ...f, onlyWithEmail: !f.onlyWithEmail }))} />
          </div>

          <div className="mt-6">
            <button
              onClick={() => handleUnlock(filtered.map((p) => p.place_id))}
              disabled={!plan.features.emailEnrichment || filtered.length === 0}
              className={cn(
                "w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all shadow-xl",
                plan.features.emailEnrichment
                  ? "bg-gradient-to-r from-primary via-indigo-600 to-accent text-white hover:scale-[1.02] active:scale-95 shadow-primary/20"
                  : "bg-white/5 border border-white/10 text-white/20 cursor-not-allowed"
              )}
            >
              Tüm Maillerİ Bul
            </button>
          </div>
        </section>

        {/* Export Card */}
        <section className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-3xl shadow-xl relative overflow-hidden">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-6 flex items-center gap-2">
            <DownloadCloud className="w-4 h-4 text-primary" /> Verİ Aktarımı
          </h3>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2 flex-1">
              <ActionButton label="CSV" icon={<FileText className="w-4 h-4" />} onClick={() => handleExport("csv")} disabled={filtered.length === 0} />
              <ActionButton label="Excel" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => handleExport("xlsx")} disabled={filtered.length === 0} />
            </div>
          </div>

          <label className={cn("w-full px-4 py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all",
            includeEmails ? "border-primary/40 bg-primary/10 text-white" : "border-white/10 bg-white/5 text-white/30",
            !plan.features.emailEnrichment ? "opacity-30 cursor-not-allowed" : ""
          )}>
            <input
              type="checkbox"
              className="w-3 h-3 accent-primary"
              disabled={!plan.features.emailEnrichment}
              checked={includeEmails}
              onChange={(e) => setIncludeEmails(e.target.checked)}
            />
            Mailleri Dahil Et
          </label>

          <AnimatePresence>
            {exportJobId && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-6"
              >
                <div className="flex items-center justify-between gap-4 w-full p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="min-w-0">
                    <div className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Durum: <span className="text-primary">{exportStatus}</span></div>
                    <div className="text-[9px] font-mono text-white/30 truncate italic">{exportJobId}</div>
                  </div>
                  {exportStatus === "completed" && (
                    <motion.a
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      href={`/api/exports/${exportJobId}?download=true`}
                      className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30"
                      target="_blank"
                      download
                    >
                      <Download className="w-4 h-4" />
                    </motion.a>
                  )}
                  {exportStatus !== "completed" && (
                    <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                  )}
                  <button onClick={() => setExportJobId(null)} className="text-white/20 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* Map View - Full Width */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[3.5rem] border border-white/10 overflow-hidden shadow-2xl h-[500px] relative group"
      >
        <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors duration-1000 -z-10" />
        <AnalyticsMap results={filtered} />
        <div className="absolute bottom-10 left-10 right-10 pointer-events-none">
          <div className="inline-flex items-center gap-4 px-8 py-4 rounded-full bg-black/60 backdrop-blur-3xl border border-white/10 text-xs font-black uppercase tracking-[0.2em] text-white/80 shadow-2xl">
            <MapPin className="w-5 h-5 text-primary" /> {filtered.length} İşletme Tespit Edildi
          </div>
        </div>
      </motion.div>

      {/* Results Table - Full Page Width */}
      <div className="relative group/table">
        <div className="absolute -inset-1.5 bg-gradient-to-br from-white/15 to-transparent rounded-[4.5rem] blur opacity-5 group-hover/table:opacity-10 transition duration-1000" />
        <div className="relative bg-[#050505]/60 border border-white/10 rounded-[4rem] backdrop-blur-3xl overflow-hidden shadow-2xl">
          <div className="p-12 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-8 bg-white/[0.02]">
            <div>
              <h3 className="text-3xl font-black text-white italic tracking-tighter">Kesfedİlen İsletmeler</h3>
              <p className="text-base text-white/40 font-medium mt-1.5">Kritik meta verileriyle zenginlestirilmis veri seti.</p>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-[10px] font-black text-white/60 bg-white/5 px-6 py-3 rounded-full border border-white/10 tracking-[0.3em] uppercase">
                {filtered.length} Bulunan Lead
              </div>
            </div>
          </div>

          <div className="overflow-x-auto selection:bg-primary/50 selection:text-white">
            <table className="w-full text-left table-fixed">
              <thead className="text-[10px] font-black uppercase tracking-[0.35em] text-white/25 border-b border-white/10 bg-black/50">
                <tr>
                  <th className="px-12 py-8 w-[35%]">Isletme ProFİlİ</th>
                  <th className="px-10 py-8 w-[15%]">Puan / Yorum</th>
                  <th className="px-10 py-8 w-[20%]">İletİşim</th>
                  <th className="px-10 py-8 w-[15%]">Verİ Zengİnlİğİ</th>
                  <th className="px-12 py-8 text-right w-[15%]">Eylem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                <AnimatePresence mode="popLayout">
                  {filtered.map((item, idx) => (
                    <motion.tr
                      key={item.place_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(idx * 0.03, 0.8) }}
                      className="group/row hover:bg-white/[0.05] transition-all duration-300"
                    >
                      <td className="px-12 py-8">
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center text-primary group-hover/row:scale-110 group-hover/row:border-primary/40 transition-all duration-500 shadow-xl shrink-0">
                            <Building2 className="w-6 h-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-lg font-black text-white truncate italic tracking-tight group-hover/row:text-primary transition-colors">{item.name}</div>
                            <div className="text-xs text-white/30 truncate flex items-center gap-2 mt-1.5 font-medium italic">
                              <MapPin className="w-4 h-4 text-primary/60" /> {item.formatted_address}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-2.5">
                          <div className="flex text-yellow-500/80">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={cn("w-3.5 h-3.5 fill-current", i >= Math.floor(item.rating || 0) && "text-white/10 fill-none")} />
                            ))}
                          </div>
                          <span className="text-base font-black text-white italic tracking-tighter ml-1">{(item.rating ?? 0).toFixed(1)}</span>
                          <span className="text-[10px] text-white/30 font-bold ml-1 tracking-widest italic">({item.user_ratings_total})</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-1.5">
                          <div className="text-xs text-white/70 font-bold flex items-center gap-2.5">
                            <Phone className="w-3.5 h-3.5 text-primary" /> {item.formatted_phone_number || "Gizli"}
                          </div>
                          {item.website && (
                            <a href={item.website} target="_blank" className="text-[10px] text-primary/80 hover:text-primary hover:underline truncate max-w-full font-black uppercase tracking-[0.15em] italic">
                              {item.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <EmailCell place={item} />
                      </td>
                      <td className="px-12 py-8 text-right">
                        <div className="flex items-center justify-end gap-3.5">
                          <button
                            onClick={() => { setSelectedId(item.place_id); setDetailOpen(true); }}
                            className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 text-white/30 hover:text-white hover:bg-primary/20 hover:border-primary/50 transition-all flex items-center justify-center group/btn shadow-lg"
                          >
                            <Maximize2 className="w-4 h-4 group-hover/btn:scale-125 transition-transform" />
                          </button>
                          <button
                            onClick={() => handleUnlock([item.place_id])}
                            disabled={Boolean(item.emailUnlocked) || !plan.features.emailEnrichment}
                            className={cn(
                              "h-10 px-4 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all",
                              item.emailUnlocked
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                : "bg-primary text-white hover:scale-105 shadow-xl shadow-primary/30"
                            )}
                          >
                            {item.emailUnlocked ? "HAZIR" : "MAİL BUL"}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Pagination Controls */}
      <div className="flex flex-col items-center justify-center gap-8 pt-16">
        <button
          onClick={handleLoadMore}
          disabled={loadingMore || !nextPageToken}
          className="group relative px-20 py-7 rounded-[3rem] bg-white text-black font-black text-sm uppercase tracking-[0.4em] transform hover:scale-105 active:scale-95 transition-all shadow-[0_20px_50px_rgba(255,255,255,0.1)] disabled:opacity-30 disabled:pointer-events-none overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          <span className="relative z-10 flex items-center gap-4">
            {loadingMore ? <RefreshCw className="w-6 h-6 animate-spin" /> : "DAHA FAZLA VERİ YÜKLE"}
          </span>
        </button>

        <div className="text-[11px] font-black uppercase tracking-[0.4em] text-white/15 italic">
          {nextPageToken ? "DERİN TARAMA VERİLERİYLE DEVAM ET" : "BU ARAMA İÇİN TÜM VERİLER KESFEDİLDİ"}
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
        "px-6 py-5 rounded-2xl border text-[10px] font-black uppercase tracking-[0.25em] transition-all text-left flex items-center justify-between group",
        on ? "bg-primary text-white border-primary shadow-2xl shadow-primary/30" : "bg-white/5 border-white/10 text-white/25 hover:bg-white/10"
      )}
    >
      {label}
      <div className={cn("w-6 h-6 rounded-xl border-2 flex items-center justify-center transition-all duration-500",
        on ? "border-white bg-white text-primary" : "border-white/10")}>
        {on && <Check className="w-4 h-4 stroke-[5px]" />}
      </div>
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
        "px-6 py-6 rounded-2xl border text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-4 w-full backdrop-blur-3xl group",
        disabled ? "bg-white/5 border-white/10 text-white/5 cursor-not-allowed" : "bg-white/10 text-white hover:bg-primary/20 hover:border-primary/50 shadow-2xl"
      )}
    >
      <span className="text-primary group-hover:scale-125 transition-transform duration-500">{icon}</span> {label}
    </button>
  );
}

function EmailCell({ place }: { place: PlaceResult }) {
  if (place.emailUnlocked) {
    const emails = place.emails || [];
    if (emails.length === 0 && place.scrapeStatus === "completed") return <span className="text-red-400 font-bold italic text-xs tracking-tight">Kayıt Bulunamadı</span>;
    if (emails.length === 0) return <span className="text-primary animate-pulse text-[11px] items-center flex gap-2 font-black italic uppercase tracking-wider"><RefreshCw className="w-4 h-4 animate-spin" /> Kazılıyor...</span>;
    return (
      <div className="flex flex-col gap-1.5">
        {emails.slice(0, 2).map((e, i) => (
          <div key={i} className="text-xs text-white font-black truncate max-w-[180px] italic tracking-tight">{e}</div>
        ))}
      </div>
    );
  }
  const count = typeof place.emailCount === "number" ? place.emailCount : Array.isArray(place.emails) ? place.emails.length : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] italic">
        {count > 0 ? `${count} ADET` : "MEVCUT"}
      </div>
      <span className="text-white/10 select-none tracking-tighter italic">•••••••••••••</span>
    </div>
  );
}
