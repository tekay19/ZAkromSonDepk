"use client";

import { X, BarChart, TrendingUp, Users, Star } from "lucide-react";
import {
    BarChart as RechartsBarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    ZAxis
} from "recharts";
import { PlaceResult } from "@/lib/types";
import { useMemo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AnalyticsMap } from "./AnalyticsMap";
import { generateMarketStrategy } from "@/lib/analysis/strategy-engine";

interface AnalyticsSheetProps {
    isOpen: boolean;
    onClose: () => void;
    results: PlaceResult[];
}

export function AnalyticsSheet({ isOpen, onClose, results }: AnalyticsSheetProps) {
    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [isOpen]);

    // 1. Rating Distribution
    const ratingData = useMemo(() => {
        const distribution = { "1-2": 0, "2-3": 0, "3-4": 0, "4-5": 0, "5": 0 };
        results.forEach(p => {
            const r = p.rating || 0;
            if (r >= 4.0 && r < 5) distribution["4-5"]++;
            else if (r === 5) distribution["5"]++;
            else if (r >= 3) distribution["3-4"]++;
            else if (r >= 2) distribution["2-3"]++;
            else if (r > 0) distribution["1-2"]++;
        });
        return Object.entries(distribution).map(([name, count]) => ({ name, count }));
    }, [results]);

    // 2. High Value Leads (Scatter: Rating vs Reviews)
    const scatterData = useMemo(() => {
        return results
            .filter(p => p.rating && p.user_ratings_total)
            .map(p => ({
                x: p.rating,
                y: p.user_ratings_total,
                z: 1, // Bubble size
                name: p.name
            }));
    }, [results]);

    // 3. Key Stats
    const stats = useMemo(() => {
        const totalReviews = results.reduce((acc, curr) => acc + (curr.user_ratings_total || 0), 0);
        const avgRating = results.reduce((acc, curr) => acc + (curr.rating || 0), 0) / (results.length || 1);
        const withPhone = results.filter(p => p.formatted_phone_number).length;
        const withWebsite = results.filter(p => p.website).length;
        return { totalReviews, avgRating, withPhone, withWebsite };
    }, [results]);

    // 4. Strategy (New)
    const strategy = useMemo(() => generateMarketStrategy(results), [results]);
    const topOpportunity = strategy.swot.opportunities[0] || "Pazar dengeli görünüyor.";

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
                    isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Sliding Panel */}
            <div
                className={cn(
                    "fixed top-0 right-0 z-50 h-full w-full max-w-2xl bg-[#0a0a0a]/95 border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-in-out overflow-y-auto",
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur-md">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <TrendingUp className="text-primary w-6 h-6" />
                            Analiz & İstatistikler
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {results.length} işletme için pazar görünümü
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-muted-foreground hover:text-white"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-8 pb-20">
                    {/* Strategy Summary Card */}
                    <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/10 p-5 rounded-2xl border border-blue-500/20">
                        <div className="flex items-center gap-2 mb-2">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">PAZAR FIRSATI</span>
                        </div>
                        <p className="text-white font-medium leading-relaxed">
                            {topOpportunity}
                        </p>
                        <div className="mt-3 flex gap-3">
                            <span className={cn("text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10",
                                strategy.saturation.level === "LOW" ? "text-emerald-400" : "text-white/60"
                            )}>
                                {strategy.saturation.description}
                            </span>
                            <span className={cn("text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10",
                                strategy.digitalMaturity.level === "UNDERSERVED" ? "text-emerald-400" : "text-white/60"
                            )}>
                                {strategy.digitalMaturity.level === "UNDERSERVED" ? "Dijital Açlık Var" : "Dijital Olgunluk Yüksek"}
                            </span>
                        </div>
                    </div>

                    {/* KPI Cards (Stacked for sidebar) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="text-muted-foreground text-xs mb-1 font-medium uppercase tracking-wider">ORT. PUAN</div>
                            <div className="text-2xl font-bold text-white flex items-center gap-2">
                                {stats.avgRating.toFixed(1)} <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                            </div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="text-muted-foreground text-xs mb-1 font-medium uppercase tracking-wider">TOPLAM YORUM</div>
                            <div className="text-2xl font-bold text-white">{stats.totalReviews.toLocaleString()}</div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="text-muted-foreground text-xs mb-1 font-medium uppercase tracking-wider">TELEFON VAR</div>
                            <div className="text-2xl font-bold text-green-400">{stats.withPhone}</div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="text-muted-foreground text-xs mb-1 font-medium uppercase tracking-wider">WEB SİTESİ VAR</div>
                            <div className="text-2xl font-bold text-blue-400">{stats.withWebsite}</div>
                        </div>
                    </div>

                    {/* Heatmap Section */}
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            Iş Haritası (Heatmap)
                        </h3>
                        <AnalyticsMap results={results} />
                    </div>

                    {/* Rating Distribution Chart */}
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                            <Users className="w-5 h-5 text-purple-400" /> Puan Dağılımı
                        </h3>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsBarChart data={ratingData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="name" stroke="#888" tick={{ fill: '#888' }} />
                                    <YAxis stroke="#888" tick={{ fill: '#888' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#171717', borderColor: '#333', color: '#fff' }}
                                        itemStyle={{ color: '#fff' }}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    />
                                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </RechartsBarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Quality Chart */}
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-orange-400" /> Kalite Haritası
                        </h3>
                        <p className="text-xs text-muted-foreground mb-4">
                            <span className="text-orange-400 font-bold">Sağ Üst</span> = Popüler & Kaliteli
                        </p>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis type="number" dataKey="x" name="Puan" domain={[1, 5]} stroke="#888" tick={{ fill: '#888' }} />
                                    <YAxis type="number" dataKey="y" name="Yorum" stroke="#888" tick={{ fill: '#888' }} />
                                    <ZAxis type="number" dataKey="z" range={[60, 400]} />
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-[#171717] border border-[#333] p-2 rounded text-xs text-white shadow-xl">
                                                    <p className="font-bold mb-1">{payload[0].payload.name}</p>
                                                    <p>Puan: {payload[0].value}</p>
                                                    <p>Yorum: {payload[1].value}</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }} />
                                    <Scatter name="İşletmeler" data={scatterData} fill="#f97316" fillOpacity={0.6} />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export function AnalyticsSlot({ results }: { results: PlaceResult[] }) {
    const [isOpen, setIsOpen] = useState(false);

    // Key Stats for Summary
    const stats = useMemo(() => {
        if (!results || results.length === 0) return null;
        const totalReviews = results.reduce((acc, curr) => acc + (curr.user_ratings_total || 0), 0);
        const avgRating = results.reduce((acc, curr) => acc + (curr.rating || 0), 0) / (results.length || 1);
        return { totalReviews, avgRating };
    }, [results]);

    if (!results || results.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                Analiz için veri bekleniyor...
            </div>
        );
    }

    return (
        <>
            <div className="w-full h-full p-6 flex flex-col justify-between relative group cursor-pointer" onClick={() => setIsOpen(true)}>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 group-hover:from-blue-500/10 group-hover:to-purple-500/10 transition-all rounded-inherit" />

                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        Pazar Analizi
                    </h3>
                    <p className="text-sm text-gray-400">Detaylı raporu görüntüle</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Ort. Puan</div>
                        <div className="text-xl font-bold text-white flex items-center gap-1">
                            {stats?.avgRating.toFixed(1)} <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        </div>
                    </div>
                    <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Toplam Yorum</div>
                        <div className="text-xl font-bold text-white">
                            {(stats?.totalReviews || 0).toLocaleString()}
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-center w-full py-2 rounded-lg bg-white/5 border border-white/5 text-xs font-medium text-white group-hover:bg-primary group-hover:border-primary transition-all">
                    Raporu Aç
                </div>
            </div>

            <AnalyticsSheet isOpen={isOpen} onClose={() => setIsOpen(false)} results={results} />
        </>
    );
}

