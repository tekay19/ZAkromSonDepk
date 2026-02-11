"use client";

import { SUBSCRIPTION_PLANS, CREDIT_COSTS, CREDIT_COSTS_BY_TIER } from "@/lib/constants/pricing";
import { CheckCircle2, Zap } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function PricingPage() {
    const pageLoadCosts = CREDIT_COSTS_BY_TIER.PAGE_LOAD;
    return (
        <div className="min-h-screen bg-[#030303] text-white py-24 px-6">
            {/* Background Glow */}
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/20 rounded-full blur-[120px] opacity-30 -z-10" />

            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="text-center space-y-4 mb-16">
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter">
                        Basit, Şeffaf Fiyatlandırma
                    </h1>
                    <p className="text-white/50 max-w-xl mx-auto">
                        İhtiyacınıza uygun planı seçin. Tüm planlar aylık faturalandırılır ve istediğiniz zaman iptal edilebilir.
                    </p>
                </div>

                {/* Credit Cost Info */}
                <div className="mb-12 p-6 rounded-2xl bg-white/5 border border-white/10 max-w-3xl mx-auto">
                    <h3 className="text-sm font-bold text-white/80 mb-4 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" /> Kredi Kullanımı
                    </h3>

                    {/* Arama Maliyetleri */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-white/60 mb-4">
                        <div className="flex justify-between p-2 rounded-lg bg-white/5">
                            <span>Arama (Grid Tarama)</span>
                            <span className="font-mono text-primary">{CREDIT_COSTS.SEARCH} Kredi</span>
                        </div>
                        <div className="flex justify-between p-2 rounded-lg bg-white/5">
                            <span>Sayfa Yükleme (Plana Göre)</span>
                            <span className="font-mono text-primary">
                                FREE {pageLoadCosts.FREE} • Starter {pageLoadCosts.STARTER} • Growth {pageLoadCosts.PRO} • Business {pageLoadCosts.BUSINESS}
                            </span>
                        </div>
                    </div>

                    {/* İletişim ve Export */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs text-white/60">
                        <div className="flex justify-between p-2 rounded-lg bg-white/5">
                            <span>Email Açma</span>
                            <span className="font-mono text-primary">{CREDIT_COSTS.UNLOCK_CONTACT} Kredi</span>
                        </div>
                        <div className="flex justify-between p-2 rounded-lg bg-white/5">
                            <span>CSV/Excel/JSON Export</span>
                            <span className="font-mono text-emerald-400">Ücretsiz ✓</span>
                        </div>
                        <div className="flex justify-between p-2 rounded-lg bg-white/5">
                            <span>PNG Export</span>
                            <span className="font-mono text-primary">{CREDIT_COSTS.EXPORT_PNG} Kredi</span>
                        </div>
                        <div className="flex justify-between p-2 rounded-lg bg-white/5">
                            <span>PDF Export</span>
                            <span className="font-mono text-primary">{CREDIT_COSTS.EXPORT_PDF} Kredi</span>
                        </div>
                    </div>
                </div>

                {/* Pricing Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {SUBSCRIPTION_PLANS.map((plan) => (
                        <div
                            key={plan.id}
                            className={cn(
                                "relative p-8 rounded-3xl border space-y-6 transition-all hover:scale-[1.02]",
                                plan.highlight
                                    ? "bg-primary/10 border-primary/30 shadow-2xl shadow-primary/10"
                                    : "bg-white/5 border-white/10"
                            )}
                        >
                            {plan.highlight && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary rounded-full text-[10px] font-black uppercase tracking-widest">
                                    En Popüler
                                </div>
                            )}

                            <div>
                                <h3 className="text-xl font-bold">{plan.name}</h3>
                                <p className="text-sm text-white/40 mt-1">{plan.description}</p>
                            </div>

                            <div>
                                <span className="text-4xl font-black">
                                    {plan.price === 0 ? "Ücretsiz" : `$${plan.price}`}
                                </span>
                                {plan.price > 0 && (
                                    <span className="text-sm text-white/40">/ay</span>
                                )}
                            </div>

                            <div className="text-xs text-white/50">
                                <span className="font-mono text-lg text-white">{plan.credits.toLocaleString()}</span> Kredi / Ay
                            </div>

                            <ul className="space-y-3">
                                {plan.features.map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                                        <CheckCircle2 className={cn(
                                            "w-4 h-4 mt-0.5 shrink-0",
                                            plan.highlight ? "text-primary" : "text-white/30"
                                        )} />
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={plan.price === 0 ? "/auth/signup" : `/dashboard/settings?upgrade=${plan.id}`}
                                className={cn(
                                    "block w-full text-center py-3 rounded-xl font-bold transition-all",
                                    plan.highlight
                                        ? "bg-primary text-white hover:bg-primary/90"
                                        : "bg-white/10 text-white hover:bg-white/20"
                                )}
                            >
                                {plan.price === 0 ? "Ücretsiz Başla" : "Planı Seç"}
                            </Link>
                        </div>
                    ))}
                </div>

                {/* FAQ / Notes */}
                <div className="mt-20 text-center text-sm text-white/40 max-w-2xl mx-auto space-y-4">
                    <p>
                        Tüm fiyatlar USD cinsindendir. Kurumsal faturalama için <a href="mailto:sales@zakrom.io" className="text-primary hover:underline">sales@zakrom.io</a> adresine ulaşın.
                    </p>
                    <p>
                        Krediler aylık yenilenir. Kullanılmayan krediler bir sonraki fatura dönemine aktarılmaz.
                    </p>
                </div>
            </div>
        </div>
    );
}
