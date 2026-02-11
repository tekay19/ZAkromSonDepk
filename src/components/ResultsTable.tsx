
"use client";

import { useState } from "react";
import { PlaceResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExternalLink, Mail, Phone, MapPin, Globe, Star, ShieldCheck, AlertTriangle } from "lucide-react";

export type { PlaceResult }; // Re-export for compatibility

interface ResultsTableProps {
    results: PlaceResult[];
    isLoading?: boolean;
}

export function ResultsTable({ results, isLoading }: ResultsTableProps) {
    if (isLoading) {
        return (
            <div className="w-full h-96 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!results || results.length === 0) {
        return (
            <div className="w-full p-8 text-center text-gray-500 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
                <p>Sonuç bulunamadı.</p>
            </div>
        );
    }

    const [unlockedPlaces, setUnlockedPlaces] = useState<Set<string>>(new Set());

    const isPlaceUnlocked = (placeId: string) => {
        // TODO: Check user subscription status as well
        return unlockedPlaces.has(placeId);
    };

    const handleUnlock = (placeId: string) => {
        // TODO: Implement unlock logic (modal, credit deduction)
        setUnlockedPlaces(prev => new Set(prev).add(placeId));
    };

    return (
        <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/20 backdrop-blur-md shadow-2xl">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-gray-400">
                            <th className="p-4 font-medium">İşletme Adı</th>
                            <th className="p-4 font-medium">Puan / Yorum</th>
                            <th className="p-4 font-medium">İletişim</th>
                            <th className="p-4 font-medium">Durum</th>
                            <th className="p-4 font-medium text-right">İşlem</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm text-gray-300">
                        {results.map((place) => {
                            const isUnlocked = isPlaceUnlocked(place.place_id || "");
                            // For demo purposes, let's assume if it has emails it might be considered premium/rich data
                            const hasPremiumData = (place.emails && place.emails.length > 0) || place.formatted_phone_number;

                            return (
                                <tr key={place.place_id} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-white group-hover:text-primary transition-colors">{place.name}</span>
                                            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                                <MapPin className="w-3 h-3" />
                                                <span className="truncate max-w-[200px]">{place.formatted_address}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <div className={cn(
                                                "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold",
                                                (place.rating || 0) >= 4.5 ? "bg-green-500/20 text-green-400" :
                                                    (place.rating || 0) >= 4.0 ? "bg-yellow-500/20 text-yellow-400" :
                                                        "bg-red-500/20 text-red-400"
                                            )}>
                                                <Star className="w-3 h-3 fill-current" />
                                                {place.rating || "N/A"}
                                            </div>
                                            <span className="text-xs text-gray-500">({place.user_ratings_total || 0})</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="space-y-1 relative">
                                            {!isUnlocked && hasPremiumData && (
                                                <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px] z-10 flex items-center justify-center rounded">
                                                    {/* Blur Effect Overlay */}
                                                </div>
                                            )}

                                            {place.website && (
                                                <a href={place.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-blue-400 hover:underline">
                                                    <Globe className="w-3 h-3" /> Website
                                                </a>
                                            )}
                                            {place.formatted_phone_number && (
                                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                                    <Phone className="w-3 h-3" />
                                                    {isUnlocked ? place.formatted_phone_number : (place.formatted_phone_number.slice(0, 4) + " *** ** **")}
                                                </div>
                                            )}
                                            {place.emails && place.emails.length > 0 ? (
                                                <div className="flex items-center gap-2 text-xs text-emerald-400">
                                                    <Mail className="w-3 h-3" />
                                                    {isUnlocked ? place.emails[0] : (place.emails[0].substring(0, 2) + "*****@" + place.emails[0].split('@')[1])}
                                                    {place.emails.length > 1 && <span className="text-gray-600">+{place.emails.length - 1}</span>}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-600 italic">E-posta yok</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {place.emails && place.emails.length > 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                <ShieldCheck className="w-3 h-3" /> Zenginleştirildi
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                                Standart
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {isUnlocked ? (
                                            <button className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
                                                İncelendi
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleUnlock(place.place_id || "")}
                                                className="px-3 py-1.5 text-xs font-semibold text-black bg-primary hover:bg-primary/90 rounded-md transition-colors shadow-lg shadow-primary/20"
                                            >
                                                Kilidi Aç
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
