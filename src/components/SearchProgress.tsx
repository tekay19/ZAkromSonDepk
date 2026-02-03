"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Database, Mail, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchProgressProps {
    duration?: number; // Duration in ms, default 60000
    onComplete: () => void;
    isVisible: boolean;
}

export function SearchProgress({ duration = 60000, onComplete, isVisible }: SearchProgressProps) {
    const [progress, setProgress] = useState(0);
    const [stage, setStage] = useState(0); // 0: Searching, 1: Enriching, 2: Finalizing

    useEffect(() => {
        if (!isVisible) {
            setProgress(0);
            return;
        }

        const startTime = Date.now();
        const endTime = startTime + duration;

        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - startTime;
            const newProgress = Math.min(100, (elapsed / duration) * 100);

            setProgress(newProgress);

            // Update stage content based on progress
            if (newProgress < 30) setStage(0);
            else if (newProgress < 85) setStage(1);
            else setStage(2);

            if (now >= endTime) {
                clearInterval(interval);
                onComplete();
            }
        }, 100);

        return () => clearInterval(interval);
    }, [isVisible, duration, onComplete]);

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className="w-full max-w-md px-6">
                <div className="mb-8 flex justify-center">
                    <div className="relative">
                        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                            {stage === 0 && <Search className="w-10 h-10 text-primary animate-bounce" />}
                            {stage === 1 && <Globe className="w-10 h-10 text-blue-500 animate-spin-slow" />}
                            {stage === 2 && <Database className="w-10 h-10 text-green-500 animate-pulse" />}
                        </div>
                        {/* Orbiting particles */}
                        <div className="absolute inset-0 w-24 h-24 border-2 border-primary/20 rounded-full animate-[spin_3s_linear_infinite]" />
                        <div className="absolute inset-0 w-24 h-24 border-t-2 border-primary/60 rounded-full animate-[spin_2s_linear_infinite]" />
                    </div>
                </div>

                <div className="space-y-6 text-center">
                    <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-white tracking-tight">
                            {stage === 0 && "Google Haritalar Taranıyor..."}
                            {stage === 1 && "Veriler Zenginleştiriliyor..."}
                            {stage === 2 && "Sonuçlar Hazırlanıyor..."}
                        </h3>
                        <p className="text-muted-foreground text-sm">
                            {stage === 0 && "İşletmeler ve konumlar tespit ediliyor."}
                            {stage === 1 && "Web siteleri taranıyor, e-posta ve sosyal medya hesapları bulunuyor."}
                            {stage === 2 && "Veriler veritabanına kaydediliyor ve optimize ediliyor."}
                        </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="relative h-4 bg-white/5 rounded-full overflow-hidden border border-white/10">
                        <div
                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary via-blue-500 to-purple-500 transition-all duration-100 ease-linear shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                            style={{ width: `${progress}%` }}
                        />
                        {/* Stripe animation */}
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.1)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.1)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[slide_1s_linear_infinite]" />
                    </div>

                    <div className="flex justify-between text-xs font-mono text-muted-foreground/60 uppercase tracking-widest">
                        <span>Başlangıç</span>
                        <span>{Math.round(progress)}%</span>
                        <span>Tamamlanıyor</span>
                    </div>

                    <div className="pt-4 flex items-center justify-center gap-6 opacity-60">
                        <div className="flex flex-col items-center gap-2">
                            <Search className={cn("w-4 h-4", stage >= 0 ? "text-primary" : "text-slate-700")} />
                            <div className={cn("w-2 h-2 rounded-full", stage >= 0 ? "bg-primary" : "bg-slate-700")} />
                        </div>
                        <div className="w-8 h-px bg-white/10" />
                        <div className="flex flex-col items-center gap-2">
                            <Globe className={cn("w-4 h-4", stage >= 1 ? "text-blue-500" : "text-slate-700")} />
                            <div className={cn("w-2 h-2 rounded-full", stage >= 1 ? "bg-blue-500" : "bg-slate-700")} />
                        </div>
                        <div className="w-8 h-px bg-white/10" />
                        <div className="flex flex-col items-center gap-2">
                            <Database className={cn("w-4 h-4", stage >= 2 ? "text-green-500" : "text-slate-700")} />
                            <div className={cn("w-2 h-2 rounded-full", stage >= 2 ? "bg-green-500" : "bg-slate-700")} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
