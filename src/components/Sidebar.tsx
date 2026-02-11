
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, LayoutDashboard, Users, Settings, BarChart3, LogOut, Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";


import { motion, AnimatePresence } from "framer-motion";

const navigation = [
    { name: 'Keşfet', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Potansiyel Müşteriler', href: '/dashboard/leads', icon: Users },
    { name: 'Analizler', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Ayarlar', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar({
    collapsed,
    onToggleCollapsed,
}: {
    collapsed: boolean;
    onToggleCollapsed: () => void;
}) {
    const pathname = usePathname();

    return (
        <div className="flex flex-col h-full p-4 relative">
            {/* Header / Logo */}
            <div className={cn("flex items-center gap-3 px-3 py-6 mb-8 transition-all duration-300", collapsed ? "justify-center" : "")}>
                <motion.div
                    whileHover={{ scale: 1.05, rotate: 5 }}
                    className="bg-gradient-to-br from-primary via-indigo-500 to-accent p-2.5 rounded-2xl shadow-xl shadow-primary/20 cursor-pointer"
                >
                    <Hexagon className="w-6 h-6 text-white fill-white/20" />
                </motion.div>

                <AnimatePresence mode="wait">
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="min-w-0 flex items-center gap-2"
                        >
                            <h1 className="text-2xl font-black bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent tracking-tighter">
                                Zakrom
                            </h1>
                            <span className="text-[9px] uppercase tracking-widest text-white/90 font-black bg-white/10 border border-white/10 px-2 py-0.5 rounded-full backdrop-blur-md">
                                Pro
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-2">
                {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            title={collapsed ? item.name : undefined}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all relative group overflow-hidden",
                                collapsed ? "justify-center px-0" : "",
                                isActive
                                    ? "text-white"
                                    : "text-white/40 hover:text-white"
                            )}
                        >
                            {/* Active/Hover Background */}
                            <AnimatePresence>
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className="absolute inset-0 bg-gradient-to-r from-primary/80 to-accent/80 backdrop-blur-xl -z-10 shadow-lg shadow-primary/30"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    />
                                )}
                            </AnimatePresence>

                            {!isActive && (
                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity -z-10" />
                            )}

                            <item.icon className={cn(
                                "w-5 h-5 transition-transform duration-300 group-hover:scale-110",
                                isActive ? "text-white" : "text-white/40 group-hover:text-white"
                            )} />

                            {!collapsed && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="whitespace-nowrap"
                                >
                                    {item.name}
                                </motion.span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Actions */}
            <div className="mt-auto pt-6 border-t border-white/10">
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    title={collapsed ? "Çıkış Yap" : undefined}
                    className={cn(
                        "flex items-center gap-3 px-4 py-4 w-full rounded-2xl text-sm font-black text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all group",
                        collapsed ? "justify-center px-0" : ""
                    )}
                >
                    <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    {!collapsed && <span>Çıkış Yap</span>}
                </button>
            </div>

            {/* Toggle Button Inside Sidebar Content for easier access */}
            <button
                onClick={onToggleCollapsed}
                className={cn(
                    "absolute -right-3 top-24 w-6 h-6 rounded-full bg-primary border border-white/20 flex items-center justify-center text-white shadow-xl hover:scale-110 transition-transform z-50",
                    collapsed ? "rotate-0" : "rotate-0"
                )}
            >
                {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
}
