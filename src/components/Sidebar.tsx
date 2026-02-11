
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, LayoutDashboard, Users, Settings, BarChart3, LogOut, Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";

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
        <div className="flex flex-col h-full p-4">
            <div className={cn("flex items-center gap-3 px-4 py-6 mb-6", collapsed ? "px-2" : "")}>
                <div className="bg-gradient-to-br from-primary to-purple-600 p-2 rounded-xl shadow-lg shadow-primary/20">
                    <Hexagon className="w-6 h-6 text-white fill-white/20" />
                </div>
                {collapsed ? null : (
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                            Zakrom
                        </h1>
                        <span className="text-[10px] uppercase tracking-wider text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded">
                            Pro
                        </span>
                    </div>
                )}

                <button
                    onClick={onToggleCollapsed}
                    className={cn(
                        "ml-auto inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors",
                        collapsed ? "w-9 h-9" : "w-9 h-9"
                    )}
                    title={collapsed ? "Menüyü aç" : "Menüyü kapat"}
                >
                    {collapsed ? <ChevronRight className="w-4 h-4 text-white/70" /> : <ChevronLeft className="w-4 h-4 text-white/70" />}
                </button>
            </div>

            <nav className="flex-1 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            title={collapsed ? item.name : undefined}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
                                collapsed ? "justify-center px-0" : "",
                                isActive
                                    ? "bg-primary text-white shadow-lg shadow-primary/25"
                                    : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <item.icon className={cn(
                                "w-5 h-5 transition-colors",
                                isActive ? "text-white" : "text-gray-500 group-hover:text-white"
                            )} />
                            {collapsed ? null : item.name}
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto pt-6 border-t border-white/5">
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    title={collapsed ? "Çıkış Yap" : undefined}
                    className={cn(
                        "flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors group",
                        collapsed ? "justify-center px-0" : ""
                    )}
                >
                    <LogOut className="w-5 h-5 group-hover:text-red-300" />
                    {collapsed ? null : "Çıkış Yap"}
                </button>
            </div>
        </div>
    );
}
