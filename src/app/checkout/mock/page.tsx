"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { processMockPayment } from "@/app/actions/mock-payment";
import { CreditCard, Loader2, ShieldCheck, Zap, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { SubscriptionTier } from "@/lib/plans";

const PLAN_INFO: Record<string, { name: string; price: string; credits: number }> = {
    STARTER: { name: "Starter", price: "$39/ay", credits: 500 },
    PRO: { name: "Growth", price: "$129/ay", credits: 2500 },
    BUSINESS: { name: "Business", price: "$349/ay", credits: 7500 },
};

const PACK_INFO: Record<string, { name: string; price: string; credits: number }> = {
    pack_1000: { name: "1.000 Kredi", price: "$15", credits: 1000 },
    pack_5000: { name: "5.000 Kredi", price: "$59", credits: 5000 },
    pack_20000: { name: "20.000 Kredi", price: "$199", credits: 20000 },
};

function MockCheckoutContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const tier = searchParams.get("tier") as SubscriptionTier | null;
    const packId = searchParams.get("packId");
    const credits = Number(searchParams.get("credits") || 0);

    const isSubscription = !!tier;
    const info = isSubscription
        ? (tier ? PLAN_INFO[tier] : null)
        : (packId ? PACK_INFO[packId] : null);

    if (!info) {
        return (
            <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6">
                <div className="text-center text-white/60">
                    <p className="text-xl font-bold mb-4">Geçersiz ödeme parametreleri</p>
                    <Link href="/dashboard/settings" className="text-primary hover:underline">
                        ← Ayarlara Dön
                    </Link>
                </div>
            </div>
        );
    }

    const handlePay = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await processMockPayment(
                isSubscription
                    ? { type: "subscription", tier: tier! }
                    : { type: "topup", credits, packId: packId! }
            );
            if (result.redirectUrl) {
                router.push(result.redirectUrl);
            }
        } catch (err: any) {
            setError(err.message || "Ödeme simülasyonu başarısız.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6">
            <div className="w-full max-w-md space-y-6">
                {/* Mock Badge */}
                <div className="flex items-center justify-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-bold uppercase tracking-widest">
                        <ShieldCheck className="w-4 h-4" />
                        Test Modu — Gerçek Ödeme Yapılmaz
                    </div>
                </div>

                {/* Checkout Card */}
                <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
                            <CreditCard className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Ödeme Simülasyonu</h1>
                            <p className="text-xs text-white/40">Zakrom Pro — Mock Checkout</p>
                        </div>
                    </div>

                    <div className="border-t border-white/10 pt-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-white/60">Ürün</span>
                            <span className="text-white font-bold">{info.name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-white/60">Fiyat</span>
                            <span className="text-white font-bold">{info.price}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-white/60">Kredi</span>
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                                <Zap className="w-4 h-4" />
                                {info.credits.toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* Mock Card Info */}
                    <div className="bg-white/5 rounded-2xl p-4 space-y-3 border border-white/5">
                        <div className="text-xs font-bold text-white/40 uppercase tracking-widest">Test Kartı</div>
                        <div className="font-mono text-white text-lg tracking-wider">4242 4242 4242 4242</div>
                        <div className="flex gap-8 text-sm text-white/50">
                            <span>12/29</span>
                            <span>CVC: 123</span>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handlePay}
                        disabled={loading}
                        className="w-full py-4 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold text-lg transition-all shadow-2xl shadow-primary/20 disabled:opacity-60 flex items-center justify-center gap-3"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                İşleniyor...
                            </>
                        ) : (
                            <>
                                <ShieldCheck className="w-5 h-5" />
                                Ödemeyi Simüle Et
                            </>
                        )}
                    </button>

                    <Link
                        href="/dashboard/settings"
                        className="flex items-center justify-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        İptal Et — Ayarlara Dön
                    </Link>
                </div>

                <p className="text-center text-[11px] text-white/20">
                    Bu sayfa yalnızca test amaçlıdır. Gerçek bir ödeme işlemi gerçekleşmez.
                </p>
            </div>
        </div>
    );
}

export default function MockCheckoutPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-[#030303] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            }
        >
            <MockCheckoutContent />
        </Suspense>
    );
}
