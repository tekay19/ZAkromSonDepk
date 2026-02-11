"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PLANS, type SubscriptionTier } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { getCreditSummary } from "@/app/actions/get-credit-history";
import { createCheckoutSession } from "@/app/actions/create-checkout";
import { createCustomerPortalSession } from "@/app/actions/create-portal";
import { createTopupCheckoutSession } from "@/app/actions/create-topup-checkout";
import { generateApiKey, revokeApiKey, getApiKeyStatus } from "@/app/actions/api-key";
import { Check, CreditCard, ExternalLink, KeyRound, Loader2, Plus, ShieldCheck, Zap } from "lucide-react";

type CreditSummary = Awaited<ReturnType<typeof getCreditSummary>>;

const TOPUP_PACKS = [
  { id: "pack_1000" as const, credits: 1000, label: "1.000 Kredi" },
  { id: "pack_5000" as const, credits: 5000, label: "5.000 Kredi" },
  { id: "pack_20000" as const, credits: 20000, label: "20.000 Kredi" },
];

export default function SettingsClient() {
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [apiStatus, setApiStatus] = useState<{ hasKey: boolean } | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [s, k] = await Promise.all([getCreditSummary(), getApiKeyStatus().catch(() => ({ hasKey: false }))]);
      setSummary(s);
      setApiStatus(k);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  const tier = (summary?.subscriptionTier as SubscriptionTier) || "FREE";
  const plan = PLANS[tier] || PLANS.FREE;
  const credits = summary?.currentCredits ?? 0;

  const progress = useMemo(() => {
    const denom = Math.max(1, plan.credits);
    return Math.max(0, Math.min(1, credits / denom));
  }, [credits, plan.credits]);

  const banner = useMemo(() => {
    if (searchParams.get("success") === "true") return { tone: "success" as const, text: "Ödeme başarılı. Planınız güncellendi." };
    if (searchParams.get("canceled") === "true") return { tone: "warn" as const, text: "Ödeme iptal edildi." };
    if (searchParams.get("topup") === "success") return { tone: "success" as const, text: "Kredi yükleme başarılı. Bakiyeniz güncellendi." };
    if (searchParams.get("topup") === "canceled") return { tone: "warn" as const, text: "Kredi yükleme iptal edildi." };
    return null;
  }, [searchParams]);

  const handlePlan = async (nextTier: SubscriptionTier) => {
    setBusy(`plan:${nextTier}`);
    try {
      const res = await createCheckoutSession(nextTier);
      if (res?.url) window.location.href = res.url;
    } catch (e: any) {
      alert(e?.message || "Ödeme başlatılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const handlePortal = async () => {
    setBusy("portal");
    try {
      const res = await createCustomerPortalSession();
      if ((res as any)?.url) window.location.href = (res as any).url;
      else alert((res as any)?.error || "Portal açılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const handleTopup = async (packId: (typeof TOPUP_PACKS)[number]["id"]) => {
    setBusy(`topup:${packId}`);
    try {
      const res = await createTopupCheckoutSession(packId);
      if (res?.url) window.location.href = res.url;
    } catch (e: any) {
      alert(e?.message || "Kredi yükleme başlatılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateApiKey = async () => {
    setBusy("api:gen");
    setNewApiKey(null);
    try {
      const res = await generateApiKey();
      setNewApiKey(res.apiKey);
      await refresh();
    } catch (e: any) {
      alert(e?.message || "API anahtarı oluşturulamadı.");
    } finally {
      setBusy(null);
    }
  };

  const handleRevokeApiKey = async () => {
    setBusy("api:revoke");
    setNewApiKey(null);
    try {
      await revokeApiKey();
      await refresh();
    } catch (e: any) {
      alert(e?.message || "API anahtarı iptal edilemedi.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Ayarlar & Abonelik
          </h1>
          <p className="text-gray-400 mt-1">Planınızı, kredilerinizi ve API erişiminizi yönetin.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePortal}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
          >
            {busy === "portal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            Aboneliği Yönet
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
          >
            <Zap className="w-4 h-4" /> Keşfe Dön
          </Link>
        </div>
      </div>

      {banner ? (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm",
            banner.tone === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border-yellow-500/20 bg-yellow-500/10 text-yellow-200"
          )}
        >
          {banner.text}
        </div>
      ) : null}

      {/* Current Plan */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-white">Mevcut Paket</h2>
              <span className="text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary px-2 py-1 rounded-full">
                {tier}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">{plan.name}</p>
          </div>

          <div className="text-right">
            <div className="text-3xl font-black text-white tabular-nums">{credits.toLocaleString()}</div>
            <div className="text-xs text-gray-500 uppercase font-bold">Kalan Kredi</div>
            <div className="mt-1 text-[11px] text-white/50">
              Plan hakkı: {plan.credits.toLocaleString()} / ay
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-purple-600 h-full" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-white/40">
            <span>
              {credits.toLocaleString()} / {plan.credits.toLocaleString()}
            </span>
            {credits < 25 ? <span className="text-yellow-200">Düşük bakiye</span> : null}
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-white">Planlar</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {(Object.entries(PLANS) as [SubscriptionTier, (typeof PLANS)["FREE"]][])
            .map(([key, p]) => {
              const isActive = key === tier;
              const isPopular = key === "PRO";
              return (
                <div
                  key={key}
                  className={cn(
                    "relative flex flex-col p-6 rounded-2xl border transition-all",
                    isPopular
                      ? "bg-gradient-to-b from-primary/20 to-black/40 border-primary/50 shadow-2xl shadow-primary/10"
                      : "bg-black/40 border-white/10 hover:border-white/20"
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">
                      En Popüler
                    </div>
                  )}

                  <div className="mb-4">
                    <div className="text-xs font-black uppercase tracking-widest text-white/40">{p.name}</div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-3xl font-black text-white">{p.price}</span>
                      {p.price !== "$0" ? <span className="text-sm text-gray-500">/ay</span> : null}
                    </div>
                  </div>

                  <ul className="flex-1 space-y-3 mb-6 text-sm text-gray-300">
                    <li className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
                      <span className="font-bold text-white">{p.credits.toLocaleString()}</span> kredi / ay
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-white">{p.resultsPerSearch}</span> sonuç / arama
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      {p.maxHistoryDays} gün geçmiş
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      Export: {p.features.export.length ? p.features.export.map((x) => x.toUpperCase()).join(", ") : "Yok"}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className={cn("w-4 h-4 shrink-0", p.features.emailEnrichment ? "text-emerald-400" : "text-white/20")} />
                      E-posta zenginleştirme {p.features.emailEnrichment ? "var" : "yok"}
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck className={cn("w-4 h-4 shrink-0", p.features.apiAccess ? "text-emerald-400" : "text-white/20")} />
                      API erişimi {p.features.apiAccess ? "var" : "yok"}
                    </li>
                  </ul>

                  <button
                    onClick={() => handlePlan(key)}
                    disabled={isActive || busy !== null || key === "FREE"}
                    className={cn(
                      "w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                      isActive
                        ? "bg-white/5 text-gray-500 cursor-not-allowed"
                        : isPopular
                          ? "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25"
                          : "bg-white text-black hover:bg-gray-200"
                    )}
                  >
                    {busy === `plan:${key}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isActive ? (
                      "Mevcut Plan"
                    ) : key === "FREE" ? (
                      "Ücretsiz"
                    ) : (
                      "Planı Seç"
                    )}
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      {/* Top-up */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-white">Tek Seferlik Kredi Yükle</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TOPUP_PACKS.map((p) => (
            <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="text-white font-black">{p.label}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Top-up</div>
              </div>
              <div className="mt-1 text-xs text-white/50">{p.credits.toLocaleString()} kredi ekler</div>

              <button
                onClick={() => handleTopup(p.id)}
                disabled={busy !== null}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 font-bold text-sm py-3 rounded-xl transition-all disabled:opacity-60"
              >
                {busy === `topup:${p.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Satın Al
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/40">
          Not: Stripe kredi paketleri için <span className="font-mono">STRIPE_TOPUP_1000_PRICE_ID</span>,{" "}
          <span className="font-mono">STRIPE_TOPUP_5000_PRICE_ID</span>,{" "}
          <span className="font-mono">STRIPE_TOPUP_20000_PRICE_ID</span> env değişkenleri gerekir.
        </p>
      </div>

      {/* API Key (Business) */}
      {plan.features.apiAccess ? (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-white">Business API</h3>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-primary" />
                  <div className="text-white font-bold">API Anahtarı</div>
                </div>
                <div className="text-xs text-white/50 mt-1">
                  Endpoint: <span className="font-mono">POST /api/v1/search</span> (Authorization: Bearer ...)
                </div>
                <div className="text-xs text-white/50 mt-1">
                  Durum:{" "}
                  <span className={cn("font-bold", apiStatus?.hasKey ? "text-emerald-300" : "text-white/60")}>
                    {apiStatus?.hasKey ? "Aktif" : "Yok"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerateApiKey}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                >
                  {busy === "api:gen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Yeni Anahtar
                </button>
                <button
                  onClick={handleRevokeApiKey}
                  disabled={busy !== null || !apiStatus?.hasKey}
                  className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                >
                  {busy === "api:revoke" ? <Loader2 className="w-4 h-4 animate-spin" /> : "İptal Et"}
                </button>
              </div>
            </div>

            {newApiKey ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <div className="text-xs text-emerald-200 font-bold uppercase tracking-widest">
                  Yeni API Anahtarınız (sadece 1 kez gösterilir)
                </div>
                <div className="mt-2 font-mono text-sm text-white break-all">{newApiKey}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

