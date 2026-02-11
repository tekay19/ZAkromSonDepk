"use client";

import { useEffect, useState } from "react";
import { getCreditHistory, getCreditSummary, CreditHistoryItem } from "@/app/actions/get-credit-history";
import { Coins, Search, Zap, FileSpreadsheet, ArrowDownCircle, ArrowUpCircle, Calendar, TrendingDown, Clock, Activity, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface UsageViewProps {
    tier: SubscriptionTier;
}

const TYPE_ICONS: Record<string, any> = {
    SEARCH: Search,
    DEEP_SEARCH: Zap,
    PAGE_LOAD: ArrowDownCircle,
    EXPORT: FileSpreadsheet,
    EMAIL_UNLOCK: Mail,
    VISUAL_EXPORT: Activity,
    BONUS: ArrowUpCircle,
    PURCHASE: Coins,
    SUBSCRIPTION_RENEWAL: ArrowUpCircle,
    API_CALL: Activity
};

const TYPE_LABELS: Record<string, string> = {
    SEARCH: "Arama",
    DEEP_SEARCH: "Derin Arama",
    PAGE_LOAD: "Sayfa Yükle",
    EXPORT: "Dışa Aktar",
    EMAIL_UNLOCK: "Mail Kilidi",
    VISUAL_EXPORT: "Harita Export",
    BONUS: "Bonus",
    PURCHASE: "Satın Alma",
    SUBSCRIPTION_RENEWAL: "Aylık Yükleme",
    API_CALL: "API Çağrısı"
};

const TYPE_COLORS: Record<string, string> = {
    SEARCH: "#3b82f6",
    DEEP_SEARCH: "#8b5cf6",
    PAGE_LOAD: "#06b6d4",
    EXPORT: "#10b981",
    EMAIL_UNLOCK: "#22c55e",
    VISUAL_EXPORT: "#eab308",
    BONUS: "#22c55e",
    PURCHASE: "#f59e0b",
    SUBSCRIPTION_RENEWAL: "#34d399",
    API_CALL: "#ef4444"
};

function formatDate(date: Date) {
    return new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(date));
}

export function UsageView({ tier }: UsageViewProps) {
    const [history, setHistory] = useState<CreditHistoryItem[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                const [historyData, summaryData] = await Promise.all([
                    getCreditHistory(50),
                    getCreditSummary()
                ]);
                setHistory(historyData);
                setSummary(summaryData);
            } catch (e) {
                console.error("Failed to load credit history:", e);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const plan = PLANS[tier];
    const pieData = summary?.usageByType?.map((t: any) => ({
        name: TYPE_LABELS[t.type] || t.type,
        value: t.spent,
        color: TYPE_COLORS[t.type] || "#666"
    })) || [];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 space-y-6">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl p-5 border border-primary/20">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                            <Coins className="w-5 h-5 text-primary" />
                        </div>
                        <span className="text-xs font-bold text-white/50 uppercase">Mevcut Bakiye</span>
                    </div>
                    <div className="text-3xl font-black text-white">{summary?.currentCredits?.toLocaleString() || 0}</div>
                    <div className="text-xs text-white/40 mt-1">Kredi</div>
                </div>

                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                            <TrendingDown className="w-5 h-5 text-red-400" />
                        </div>
                        <span className="text-xs font-bold text-white/50 uppercase">Bu Ay Harcanan</span>
                    </div>
                    <div className="text-3xl font-black text-white">{summary?.monthlyUsage?.totalSpent || 0}</div>
                    <div className="text-xs text-white/40 mt-1">{summary?.monthlyUsage?.transactionCount || 0} işlem</div>
                </div>

                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                            <Search className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-xs font-bold text-white/50 uppercase">Arama Başına</span>
                    </div>
                    <div className="text-3xl font-black text-white">{plan.resultsPerSearch}</div>
                    <div className="text-xs text-white/40 mt-1">Sonuç Limiti</div>
                </div>

                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-purple-400" />
                        </div>
                        <span className="text-xs font-bold text-white/50 uppercase">Plan</span>
                    </div>
                    <div className="text-2xl font-black text-white">{tier}</div>
                    <div className="text-xs text-white/40 mt-1">{plan.credits.toLocaleString()} Kredi/Ay</div>
                </div>
            </div>

            {/* Usage Breakdown & History */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pie Chart */}
                <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" /> Kullanım Dağılımı
                    </h3>
                    {pieData.length > 0 ? (
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff10", borderRadius: "8px" }}
                                        labelStyle={{ color: "#fff" }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-white/30 text-sm">
                            Henüz kullanım verisi yok
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        {pieData.map((item: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-white/60">
                                <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                                <span>{item.name}: {item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Transaction History */}
                <div className="lg:col-span-2 bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" /> İşlem Geçmişi
                        </h3>
                        <span className="text-xs text-white/40">{history.length} kayıt</span>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                        <table className="w-full">
                            <thead className="bg-white/5 sticky top-0">
                                <tr className="text-left text-xs text-white/50 uppercase">
                                    <th className="p-3">Tür</th>
                                    <th className="p-3">Açıklama</th>
                                    <th className="p-3 text-center">Miktar</th>
                                    <th className="p-3 text-right">Tarih</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {history.map((tx) => {
                                    const Icon = TYPE_ICONS[tx.type] || Coins;
                                    const isPositive = tx.amount > 0;
                                    return (
                                        <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "w-8 h-8 rounded-lg flex items-center justify-center",
                                                        isPositive ? "bg-green-500/20" : "bg-white/10"
                                                    )}>
                                                        <Icon className={cn(
                                                            "w-4 h-4",
                                                            isPositive ? "text-green-400" : "text-white/60"
                                                        )} style={{ color: TYPE_COLORS[tx.type] }} />
                                                    </div>
                                                    <span className="text-sm font-medium text-white">
                                                        {TYPE_LABELS[tx.type] || tx.type}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <span className="text-sm text-white/70 line-clamp-1">
                                                    {tx.description || "-"}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={cn(
                                                    "text-sm font-bold",
                                                    isPositive ? "text-green-400" : "text-red-400"
                                                )}>
                                                    {isPositive ? "+" : ""}{tx.amount}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right">
                                                <span className="text-xs text-white/50">{formatDate(tx.createdAt)}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {history.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-white/30 text-sm">
                                            Henüz işlem geçmişi bulunmuyor.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
