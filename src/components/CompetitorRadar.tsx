"use client";

import { useMemo, useState } from "react";
import { PlaceResult } from "@/lib/types";
import { Radar, Target, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompetitorRadarProps {
    centerPlace?: PlaceResult;
    competitors: PlaceResult[];
}

interface RadarPoint extends PlaceResult {
    x: number;
    y: number;
    type: "THREAT" | "OPPORTUNITY" | "NEUTRAL";
}

export function CompetitorRadar({ centerPlace, competitors }: CompetitorRadarProps) {
    const [selectedCompetitor, setSelectedCompetitor] = useState<RadarPoint | null>(null);

    // Normalize coordinates relative to center
    const radarData = useMemo<RadarPoint[]>(() => {
        if (!competitors || competitors.length === 0) return [];

        // If no center place provided, use the first one or calculate average center
        const centerLat = centerPlace?.location?.latitude || competitors[0].location?.latitude || 0;
        const centerLng = centerPlace?.location?.longitude || competitors[0].location?.longitude || 0;

        return competitors.map(p => {
            const pLat = p.location?.latitude || 0;
            const pLng = p.location?.longitude || 0;

            // Calculate relative position (simple lat/lng diff approach for radar visualization)
            // Scale factor to fit in the circle
            const latDiff = (pLat - centerLat) * 1000;
            const lngDiff = (pLng - centerLng) * 1000;

            // Calculate threat level
            // High rating + High reviews = High Threat (Red)
            // Low rating = Opportunity (Green)
            const rating = p.rating || 0;
            const reviews = p.user_ratings_total || 0;

            let type: "THREAT" | "OPPORTUNITY" | "NEUTRAL" = "NEUTRAL";
            if (rating >= 4.5 && reviews > 100) type = "THREAT";
            else if (rating < 4.0 || reviews < 20) type = "OPPORTUNITY";

            return {
                ...p,
                x: lngDiff,
                y: latDiff, // Invert Y for screen coords
                type
            };
        });
    }, [competitors, centerPlace]);

    // Calculate max distance to normalize scaling
    const maxDist = useMemo(() => {
        if (radarData.length === 0) return 1;
        return Math.max(...radarData.map(d => Math.sqrt(d.x * d.x + d.y * d.y))) * 1.2;
    }, [radarData]);

    return (
        <div className="flex flex-col md:flex-row gap-6 h-full">
            {/* Radar Screen */}
            <div className="flex-1 aspect-square relative bg-black/40 rounded-full border-4 border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)_inset] overflow-hidden group">
                {/* Grid Lines */}
                <div className="absolute inset-0 rounded-full border border-white/10 scale-75" />
                <div className="absolute inset-0 rounded-full border border-white/10 scale-50" />
                <div className="absolute inset-0 rounded-full border border-white/10 scale-25" />

                {/* Crosshairs */}
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/10" />
                <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10" />

                {/* Scanning Animation */}
                <div className="absolute inset-0 rounded-full border-t-2 border-primary/50 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-[spin_4s_linear_infinite] origin-center shadow-[0_0_20px_rgba(59,130,246,0.2)]" />

                {/* Center Point (You are here) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_white] z-20">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white whitespace-nowrap bg-black/50 px-2 py-0.5 rounded">SİZ</div>
                </div>

                {/* Competitor Dots */}
                {radarData.map((place, i) => {
                    // Safe formatting for coordinates
                    if (Math.abs(place.x) > maxDist || Math.abs(place.y) > maxDist) return null; // Skip if too far

                    const xPercent = 50 + (place.x / maxDist) * 45;
                    const yPercent = 50 - (place.y / maxDist) * 45;

                    return (
                        <button
                            key={i}
                            className={cn(
                                "absolute w-3 h-3 rounded-full cursor-pointer transition-all hover:scale-150 z-10 hover:z-30 shadow-lg",
                                place.type === "THREAT" ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)] animate-pulse" :
                                    place.type === "OPPORTUNITY" ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]" : "bg-yellow-500"
                            )}
                            style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
                            onClick={() => setSelectedCompetitor(place)}
                            title={place.name}
                        />
                    );
                })}
            </div>

            {/* Info Panel */}
            <div className="w-full md:w-64 bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col h-full">
                <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Radar className="w-4 h-4 text-primary" /> Rakip Analizi
                </h4>

                {selectedCompetitor ? (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl">
                            <h3 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
                                {selectedCompetitor.name}
                            </h3>
                            <div className="space-y-4 text-sm text-gray-300">
                                <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                                    <span className="font-medium text-gray-400">Puan</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-yellow-400 text-lg">★</span>
                                        <span className="text-white font-bold">{selectedCompetitor.rating}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                                    <span className="font-medium text-gray-400">Yorum Sayısı</span>
                                    <span className="text-white font-bold">{selectedCompetitor.user_ratings_total}</span>
                                </div>

                                <div className={`mt-4 p-4 rounded-xl border ${(selectedCompetitor.user_ratings_total || 0) > 500 ? 'bg-red-500/10 border-red-500/30' :
                                        (selectedCompetitor.rating || 0) < 4.0 ? 'bg-green-500/10 border-green-500/30' :
                                            'bg-blue-500/10 border-blue-500/30'
                                    }`}>
                                    <h4 className="font-bold mb-1 text-white">Analiz Notu:</h4>
                                    <p className="text-xs leading-relaxed opacity-90">
                                        {(selectedCompetitor.user_ratings_total || 0) > 500
                                            ? "Bu işletme pazar lideri konumunda. Doğrudan rekabet zor olabilir."
                                            : (selectedCompetitor.rating || 0) < 4.0
                                                ? "Düşük puanlı bir rakip. Hizmet kalitenizle bu müşterileri kazanabilirsiniz."
                                                : "Benzer seviyede bir rakip. Dijital varlığınızı güçlendirerek öne geçin."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center text-white/30 p-4">
                        <Target className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-xs">Detaylarını görmek için radardaki bir noktaya tıklayın.</p>
                    </div>
                )}

                <div className="mt-auto pt-4 border-t border-white/5 grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 text-[10px] text-white/50">
                        <div className="w-2 h-2 rounded-full bg-red-500" /> Tehdit
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-white/50">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" /> Fırsat
                    </div>
                </div>
            </div>
        </div>
    );
}
