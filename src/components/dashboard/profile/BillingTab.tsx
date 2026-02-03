"use client";

import { useState } from "react";
import { CreditCard, Zap, BarChart3, ArrowUpRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { createCustomerPortalSession } from "@/app/actions/create-portal";

import { UsageHistoryTable } from "./UsageHistoryTable";
import { getCreditHistory } from "@/app/actions/get-credit-history";
import { useEffect } from "react";

interface BillingTabProps {
    userProfile: any;
    history: any[];
    onUpdate: () => void;
}

export default function BillingTab({ userProfile, history, onUpdate }: BillingTabProps) {
    const [loadingPortal, setLoadingPortal] = useState(false);
    const [activeTier, setActiveTier] = useState<string>(userProfile?.subscriptionTier || "FREE");
    const [transactions, setTransactions] = useState<any[]>([]);

    useEffect(() => {
        getCreditHistory().then(setTransactions);
    }, []);

    const handlePortalRedirect = async () => {
        setLoadingPortal(true);
        try {
            const res = await createCustomerPortalSession();
            if (res?.url) {
                window.location.href = res.url;
            } else if (res?.error) {
                alert(res.error);
            }
        } catch (error) {
            console.error(error);
            alert("Portal yönlendirme hatası.");
        } finally {
            setLoadingPortal(false);
        }
    };

    const handleCheckout = async (tier: string) => {
        if (tier === userProfile?.subscriptionTier) return;
        try {
            const { createCheckoutSession } = await import("@/app/actions/create-checkout");
            const { url } = await createCheckoutSession(tier as SubscriptionTier);
            if (url) window.location.href = url;
        } catch (err: any) {
            alert("Ödeme sayfası hatası: " + err.message);
        }
    };

    const currentPlan = PLANS[userProfile?.subscriptionTier as SubscriptionTier] || PLANS.FREE;
    const isFree = userProfile?.subscriptionTier === "FREE";

    return (
        <div className="space-y-8">
            {/* Current Plan & Usage Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Plan Info Card */}
                <div className="glass-card rounded-3xl p-8 border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3">
                        <div className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-white/60 border border-white/5">
                            {isFree ? "Ücretsiz" : "Aktif Plan"}
                        </div>
                    </div>

                    <div className="mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary mb-4">
                            <Zap className="w-6 h-6" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-1">{currentPlan.name} Plan</h3>
                        <p className="text-sm text-white/50">Yenilenme: {userProfile?.subscriptionEndDate ? new Date(userProfile.subscriptionEndDate).toLocaleDateString() : "Süresiz"}</p>
                    </div>

                    <div className="space-y-4 mb-8">
                        <div>
                            <div className="flex justify-between text-xs font-bold text-white/60 mb-2">
                                <span>KREDİ BAKİYESİ</span>
                                <span>{userProfile?.credits} / {currentPlan.credits}</span>
                            </div>
                            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-1000 ease-out"
                                    style={{ width: `${Math.min((userProfile?.credits / currentPlan.credits) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {!isFree ? (
                        <button
                            onClick={handlePortalRedirect}
                            disabled={loadingPortal}
                            className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
                        >
                            {loadingPortal ? (
                                <span>Yönlendiriliyor...</span>
                            ) : (
                                <>
                                    <CreditCard className="w-4 h-4" /> Aboneliği Yönet
                                </>
                            )}
                        </button>
                    ) : (
                        <div className="p-4 bg-primary/10 rounded-xl border border-primary/20 text-xs text-primary/80 leading-relaxed">
                            Daha fazla özellik için planınızı yükseltin. İşletmenizi büyütmek için profesyonel araçlara erişin.
                        </div>
                    )}
                </div>

                {/* Usage Chart */}
                <div className="lg:col-span-2 glass-card rounded-3xl p-8 border border-white/10 bg-white/5">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <BarChart3 className="w-5 h-5 text-blue-400" />
                            <h3 className="text-lg font-bold text-white">Son 30 Günlük Aktivite</h3>
                        </div>
                        <div className="text-xs text-white/40">Kredi Tüketimi</div>
                    </div>

                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history.map(h => ({ date: new Date(h.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), credits: 1 })).reverse()}>
                                <defs>
                                    <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="date" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Area type="monotone" dataKey="credits" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCredits)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Upgrade Options */}
            <div className="glass-card rounded-3xl p-8 border border-white/10 bg-white/5">
                <div className="flex items-center gap-3 mb-8">
                    <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-xl font-bold text-white">Plan Yükselt</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(PLANS).map(([tier, plan]) => {
                        const isActive = userProfile?.subscriptionTier === tier;
                        return (
                            <button
                                key={tier}
                                onClick={() => handleCheckout(tier)}
                                disabled={isActive}
                                className={cn(
                                    "group relative p-6 rounded-2xl border text-left transition-all duration-300 hover:scale-[1.02]",
                                    isActive
                                        ? "bg-primary/10 border-primary ring-1 ring-primary/50 cursor-default"
                                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                )}
                            >
                                {isActive && (
                                    <div className="absolute top-4 right-4">
                                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                            <Check className="w-3 h-3 text-white" />
                                        </div>
                                    </div>
                                )}
                                <div className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">{plan.name}</div>
                                <div className="text-2xl font-black text-white mb-4">{plan.credits} <span className="text-sm font-normal text-white/40">kredi</span></div>

                                <div className="space-y-2 mb-6">
                                    <div className="flex items-center gap-2 text-xs text-white/60">
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span>Tüm özelliklere erişim</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-white/60">
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span>7/24 Öncelikli Destek</span>
                                    </div>
                                </div>

                                <div className={cn(
                                    "w-full py-2 rounded-lg text-xs font-bold text-center transition-colors",
                                    isActive ? "text-primary bg-primary/10" : "text-white bg-white/10 group-hover:bg-white/20"
                                )}>
                                    {isActive ? "Mevcut Plan" : "Seç & Yükselt"}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
            {/* Transaction History */}
            <div className="glass-card rounded-3xl p-8 border border-white/10 bg-white/5">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Kredi Hareketleri</h3>
                        <p className="text-sm text-white/40">Hesabınızdaki son işlemler</p>
                    </div>
                </div>

                <UsageHistoryTable transactions={transactions} />
            </div>
        </div>
    );
}
