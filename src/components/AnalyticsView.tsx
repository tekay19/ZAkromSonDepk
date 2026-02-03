"use client";

import { BarChart, TrendingUp, Users, Star, ArrowLeft, Map as MapIcon, PieChart as PieChartIcon, Activity, ImageIcon, BrainCircuit, Radar as RadarIcon, Target } from "lucide-react";
import { cn } from "@/lib/utils";
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
    ZAxis,
    PieChart,
    Pie,
    Cell,
    Legend
} from "recharts";
import { PlaceResult } from "./ResultsTable";
import { useMemo, useState } from "react";
import { AnalyticsMap } from "./AnalyticsMap";
import { CompetitorRadar } from "./CompetitorRadar";

import { SubscriptionTier } from "@/lib/plans";
import { generateMarketStrategy, StrategyReport } from "@/lib/analysis/strategy-engine";

interface AnalyticsViewProps {
    results: PlaceResult[];
    onBack: () => void;
    tier: SubscriptionTier;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

function TierLock({ tier }: { tier: string }) {
    return (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px] z-20 flex flex-col items-center justify-center text-center p-6 rounded-3xl animate-in fade-in duration-300">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-white" />
            </div>
            <h4 className="text-xl font-bold text-white mb-2">{tier} Özelliği</h4>
            <p className="text-sm text-white/60 max-w-[200px] mb-6">
                Bu analiz türüne erişmek için planınızı yükseltmeniz gerekmektedir.
            </p>
            <button className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-full text-xs font-bold transition-all active:scale-95">
                Şimdi Yükselt
            </button>
        </div>
    );
}

export function AnalyticsView({ results, onBack, tier = "FREE" }: AnalyticsViewProps) {
    const isBasicStats = ["STARTER", "PRO", "BUSINESS"].includes(tier);
    const isAdvancedStats = ["PRO", "BUSINESS"].includes(tier);
    const isBusinessStats = tier === "BUSINESS";

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

    // 4. Category Distribution (Pie Chart)
    const categoryData = useMemo(() => {
        const counts: Record<string, number> = {};
        results.forEach(p => {
            if (p.types && p.types.length > 0) {
                const type = p.types[0].replace(/_/g, " ").toUpperCase();
                counts[type] = (counts[type] || 0) + 1;
            } else {
                counts["BİLİNMEYEN"] = (counts["BİLİNMEYEN"] || 0) + 1;
            }
        });

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const top = sorted.slice(0, 5);
        const othersCount = sorted.slice(5).reduce((acc, curr) => acc + curr[1], 0);

        const finalData = top.map(([name, value]) => ({ name, value }));
        if (othersCount > 0) {
            finalData.push({ name: "DİĞER", value: othersCount });
        }
        return finalData;
    }, [results]);

    // 5. Business Status Breakdown
    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        results.forEach(p => {
            const status = p.business_status || "UNKNOWN";
            counts[status] = (counts[status] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [results]);

    // 6. Social Media Presence (New)
    const socialData = useMemo(() => {
        const counts = { Instagram: 0, Facebook: 0, LinkedIn: 0, Twitter: 0, YouTube: 0 };
        results.forEach(p => {
            if (p.socials?.instagram) counts.Instagram++;
            if (p.socials?.facebook) counts.Facebook++;
            if (p.socials?.linkedin) counts.LinkedIn++;
            if (p.socials?.twitter) counts.Twitter++;
            if (p.socials?.youtube) counts.YouTube++;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [results]);

    // 7. Photo Count Analysis (New)
    const photoData = useMemo(() => {
        // Group by rating ranges
        const groups = { "1-3 Yıldız": 0, "3-4 Yıldız": 0, "4-5 Yıldız": 0 };
        const counts = { "1-3 Yıldız": 0, "3-4 Yıldız": 0, "4-5 Yıldız": 0 };

        results.forEach(p => {
            const r = p.rating || 0;
            const photos = p.photos?.length || 0;
            if (r >= 4) { groups["4-5 Yıldız"] += photos; counts["4-5 Yıldız"]++; }
            else if (r >= 3) { groups["3-4 Yıldız"] += photos; counts["3-4 Yıldız"]++; }
            else { groups["1-3 Yıldız"] += photos; counts["1-3 Yıldız"]++; }
        });

        return Object.entries(groups).map(([name, total]) => ({
            name,
            avgPhotos: counts[name as keyof typeof counts] ? Math.round(total / counts[name as keyof typeof counts]) : 0
        }));
    }, [results]);



    // 8. Generate Market Strategy (New)
    const strategy: StrategyReport = useMemo(() => {
        return generateMarketStrategy(results);
    }, [results]);

    return (
        <div className="w-full animate-in fade-in zoom-in-95 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-3xl font-bold text-white">Pazar Analizi</h2>
                        <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase",
                            tier === "BUSINESS" ? "bg-primary text-white" :
                                tier === "PRO" ? "bg-purple-500 text-white" :
                                    tier === "STARTER" ? "bg-blue-600 text-white" : "bg-white/10 text-white/60"
                        )}>
                            {tier} PLAN
                        </span>
                    </div>
                    <p className="text-muted-foreground text-lg">
                        {results.length} işletme için detaylı pazar raporu
                    </p>
                </div>
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-6 py-3 rounded-xl transition-all hover:pr-8 group h-fit w-fit"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Arama Sonuçlarına Dön
                </button>
            </div>

            {/* AI STRATEGY SECTION (UPDATED) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* 1. AI Opportunity Score */}
                <div className="lg:col-span-2 glass-card rounded-3xl p-8 border border-white/10 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><BrainCircuit className="w-32 h-32 text-indigo-400" /></div>

                    {!isAdvancedStats && <TierLock tier="PRO" />}

                    <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                        <BrainCircuit className="w-6 h-6 text-indigo-400" />
                        AI Fırsat Skoru
                    </h3>

                    <div className="flex flex-col md:flex-row gap-8 items-center mb-8">
                        {/* Score Circle */}
                        <div className="relative w-40 h-40 shrink-0">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff10" strokeWidth="8" />
                                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8"
                                    className={cn("text-primary transition-all duration-1000",
                                        strategy.opportunityScore.score > 70 ? "text-emerald-500" :
                                            strategy.opportunityScore.score > 40 ? "text-yellow-500" : "text-red-500"
                                    )}
                                    strokeDasharray={`${strategy.opportunityScore.score * 2.83} 283`}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-4xl font-black text-white">{strategy.opportunityScore.score}</span>
                                <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">SKOR</span>
                            </div>
                        </div>

                        {/* Breakdown Metrics */}
                        <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="text-[10px] text-white/40 uppercase font-bold mb-1">TALEP</div>
                                <div className="text-xl font-bold text-white">{strategy.opportunityScore.breakdown.demandScore}</div>
                                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${strategy.opportunityScore.breakdown.demandScore}%` }} />
                                </div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="text-[10px] text-white/40 uppercase font-bold mb-1">REKABET DİRENCİ</div>
                                <div className="text-xl font-bold text-white">{strategy.opportunityScore.breakdown.competitionScore}</div>
                                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-red-500" style={{ width: `${strategy.opportunityScore.breakdown.competitionScore}%` }} />
                                </div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="text-[10px] text-white/40 uppercase font-bold mb-1">DİJİTAL BOŞLUK</div>
                                <div className="text-xl font-bold text-white">{strategy.opportunityScore.breakdown.digitalGapScore}</div>
                                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: `${strategy.opportunityScore.breakdown.digitalGapScore}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <h4 className="text-sm font-bold text-indigo-300 mb-2 flex items-center gap-2">
                                <BrainCircuit className="w-4 h-4" /> AI İÇGÖRÜSÜ
                            </h4>
                            <ul className="space-y-2">
                                {strategy.swot.opportunities.slice(0, 3).map((opp, i) => (
                                    <li key={i} className="text-sm text-white/80 flex items-start gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                        {opp}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* 2. Action Plan */}
                <div className="glass-card rounded-3xl p-6 border border-white/10 bg-white/5 flex flex-col relative overflow-hidden">
                    {!isAdvancedStats && <TierLock tier="PRO" />}
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Star className="w-5 h-5 text-yellow-400" /> Aksiyon Planı
                    </h3>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar max-h-[300px]">
                        {strategy.actionPlan.map((plan, i) => (
                            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-primary/30 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-white text-sm">{plan.title}</h4>
                                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                                        plan.priority === "HIGH" ? "bg-red-500/20 text-red-400" :
                                            plan.priority === "MEDIUM" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"
                                    )}>{plan.priority}</span>
                                </div>
                                <ul className="space-y-2">
                                    {plan.steps.map((step, j) => (
                                        <li key={j} className="text-xs text-white/60 flex items-start gap-2">
                                            <div className="min-w-4 min-h-4 rounded border border-white/20 flex items-center justify-center mt-0.5">
                                                <div className="w-2 h-2 rounded-sm bg-primary opacity-0 group-hover:opacity-100" />
                                            </div>
                                            {step}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* COMPETITOR RADAR (BUSINESS EXCLUSIVE) */}
            <div className="w-full bg-white/5 rounded-3xl border border-white/5 overflow-hidden relative mb-8">
                {!isBusinessStats && <TierLock tier="BUSINESS" />}
                <div className="p-6 border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                        <RadarIcon className="w-5 h-5 text-primary" /> Rakip Keşif Radarı
                    </h3>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Canlı Analiz
                    </div>
                </div>
                <div className="h-[500px] w-full p-6 bg-gradient-to-b from-black/40 to-transparent">
                    <CompetitorRadar competitors={results} />
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white/5 p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Star className="w-16 h-16" /></div>
                    <div className="text-muted-foreground text-xs mb-2 font-bold uppercase tracking-wider">ORTALAMA PUAN</div>
                    <div className="text-3xl font-bold text-white">{stats.avgRating.toFixed(1)} <span className="text-sm text-yellow-500">★</span></div>
                </div>
                <div className="bg-white/5 p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Activity className="w-16 h-16" /></div>
                    <div className="text-muted-foreground text-xs mb-2 font-bold uppercase tracking-wider">TOPLAM YORUM</div>
                    <div className="text-3xl font-bold text-white">{stats.totalReviews.toLocaleString()}</div>
                </div>
                <div className="bg-white/5 p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Users className="w-16 h-16" /></div>
                    <div className="text-muted-foreground text-xs mb-2 font-bold uppercase tracking-wider">TELEFON MEVCUT</div>
                    <div className="text-3xl font-bold text-green-400">{stats.withPhone}</div>
                </div>
                <div className="bg-white/5 p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-16 h-16" /></div>
                    <div className="text-muted-foreground text-xs mb-2 font-bold uppercase tracking-wider">WEB SİTESİ MEVCUT</div>
                    <div className="text-3xl font-bold text-blue-400">{stats.withWebsite}</div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Heatmap - Pro+ */}
                <div className="col-span-1 lg:col-span-2 bg-white/5 rounded-3xl border border-white/5 overflow-hidden relative min-h-[460px]">
                    {!isAdvancedStats && <TierLock tier="PRO" />}
                    <div className="p-6 border-b border-white/5">
                        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                            <MapIcon className="w-5 h-5 text-red-400" /> Yoğunluk Haritası
                        </h3>
                    </div>
                    <div className="h-[400px] w-full">
                        <AnalyticsMap results={results} />
                    </div>
                </div>

                {/* Rating Distribution - Starter+ */}
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col relative min-h-[440px]">
                    {!isBasicStats && <TierLock tier="STARTER" />}
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <BarChart className="w-5 h-5 text-purple-400" /> Puan Dağılımı
                    </h3>
                    <div className="h-[300px] w-full mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsBarChart data={ratingData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="name" stroke="#888" tick={{ fill: '#888' }} />
                                <YAxis stroke="#888" tick={{ fill: '#888' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#171717', borderColor: '#333' }} />
                                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </RechartsBarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Quality Chart - Pro+ */}
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col relative min-h-[440px]">
                    {!isAdvancedStats && <TierLock tier="PRO" />}
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-orange-400" /> Kalite Matrisi
                    </h3>
                    <div className="h-[300px] w-full mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis type="number" dataKey="x" name="Puan" domain={[0, 5]} stroke="#888" />
                                <YAxis type="number" dataKey="y" name="Yorum" stroke="#888" />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                <Scatter name="İşletmeler" data={scatterData} fill="#f97316" fillOpacity={0.6} />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Distribution - Business */}
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col relative min-h-[440px]">
                    {!isBusinessStats && <TierLock tier="BUSINESS" />}
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <PieChartIcon className="w-5 h-5 text-pink-400" /> Sektörel Dağılım
                    </h3>
                    <div className="h-[300px] w-full flex items-center justify-center mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={100} fill="#8884d8" dataKey="value">
                                    {categoryData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#171717', borderColor: '#333' }} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Business Status - Starter+ */}
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col relative min-h-[440px]">
                    {!isBasicStats && <TierLock tier="STARTER" />}
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-emerald-400" /> İşletme Durumu
                    </h3>
                    <div className="h-[300px] w-full mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsBarChart layout="vertical" data={statusData}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#333" />
                                <XAxis type="number" stroke="#888" />
                                <YAxis dataKey="name" type="category" stroke="#888" width={100} />
                                <Tooltip contentStyle={{ backgroundColor: '#171717', borderColor: '#333' }} />
                                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                            </RechartsBarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                {/* Social Media Presence - Business */}
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col relative min-h-[440px]">
                    {!isBusinessStats && <TierLock tier="BUSINESS" />}
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-400" /> Sosyal Medya Varlığı
                    </h3>
                    <div className="h-[300px] w-full mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsBarChart data={socialData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#333" />
                                <XAxis type="number" stroke="#888" hide />
                                <YAxis dataKey="name" type="category" stroke="#888" width={80} />
                                <Tooltip contentStyle={{ backgroundColor: '#171717', borderColor: '#333' }} />
                                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                                    {socialData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </RechartsBarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Photo Analysis - Pro+ */}
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col relative min-h-[440px]">
                    {!isAdvancedStats && <TierLock tier="PRO" />}
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-yellow-400" /> Fotoğraf Analizi
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">Puan aralığına göre ortalama fotoğraf sayısı</p>
                    <div className="h-[300px] w-full mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsBarChart data={photoData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="name" stroke="#888" tick={{ fill: '#888', fontSize: 10 }} />
                                <YAxis stroke="#888" tick={{ fill: '#888' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#171717', borderColor: '#333' }} />
                                <Bar dataKey="avgPhotos" name="Ort. Fotoğraf" fill="#eab308" radius={[4, 4, 0, 0]} />
                            </RechartsBarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
