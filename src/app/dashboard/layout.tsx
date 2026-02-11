
"use client";

import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
        <div className="flex h-screen bg-[#030303] text-white overflow-hidden font-sans selection:bg-primary/30 selection:text-white">
            {/* Ambient Background Glows */}
            <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.05)_0,transparent_50%)]" />
            <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.05)_0,transparent_50%)]" />

            {/* Sidebar Container */}
            <motion.aside
                initial={false}
                animate={{ width: collapsed ? 100 : 256 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="hidden md:block h-full border-r border-white/10 bg-black/40 backdrop-blur-3xl z-40"
            >
                <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
            </motion.aside>

            {/* Main Content Area */}
            <main className="flex-1 h-full overflow-hidden relative flex flex-col">
                <div className="flex-1 overflow-y-auto px-6 py-10 md:px-12 md:py-16 scroll-smooth scrollbar-hide">
                    {/* Page Header Accent Glow */}
                    <div className="absolute top-0 left-1/4 w-1/2 h-64 bg-primary/10 rounded-full blur-[120px] -z-10 pointer-events-none transform -translate-y-1/2" />

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="max-w-[1600px] mx-auto w-full"
                    >
                        {children}
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
