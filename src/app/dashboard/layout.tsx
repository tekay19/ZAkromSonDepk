

"use client";

import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem("dashboard_sidebar_collapsed");
            if (saved === "1") setCollapsed(true);
        } catch {
            // ignore
        }
    }, []);

    const toggleCollapsed = () => {
        setCollapsed((c) => {
            const next = !c;
            try {
                localStorage.setItem("dashboard_sidebar_collapsed", next ? "1" : "0");
            } catch {
                // ignore
            }
            return next;
        });
    };

    return (
        <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden font-sans">
            {/* Sidebar */}
            <aside
                className={cn(
                    "hidden md:block border-r border-white/5 bg-black/40 backdrop-blur-xl transition-[width] duration-200",
                    collapsed ? "w-[72px]" : "w-64"
                )}
            >
                <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto relative">
                {/* Background Glow */}
                <div className="absolute top-0 left-0 w-full h-96 bg-primary/5 rounded-full blur-3xl -z-10 translate-y-[-50%] pointer-events-none" />

                <div className="p-6 md:p-8 w-full space-y-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
