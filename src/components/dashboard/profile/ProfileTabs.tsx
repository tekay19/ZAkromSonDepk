"use client";

import { useState } from "react";
import { User, Shield, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import GeneralTab from "./GeneralTab";
import SecurityTab from "./SecurityTab";
import BillingTab from "./BillingTab";

interface ProfileTabsProps {
    userProfile: any;
    session: any;
    history: any[];
    onUpdate: () => void;
    initialTab?: string;
}

export default function ProfileTabs({ userProfile, session, history, onUpdate, initialTab = "general" }: ProfileTabsProps) {
    const [activeTab, setActiveTab] = useState(initialTab);

    const tabs = [
        { id: "general", label: "Genel Bilgiler", icon: User },
        { id: "security", label: "Güvenlik", icon: Shield },
        { id: "billing", label: "Abonelik ve Kullanım", icon: CreditCard },
    ];

    return (
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2 mb-8 p-1.5 bg-white/5 rounded-2xl border border-white/10 w-fit backdrop-blur-xl">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300",
                            activeTab === tab.id
                                ? "bg-primary text-white shadow-lg shadow-primary/25 scale-[1.02]"
                                : "text-white/60 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="min-h-[400px]">
                {activeTab === "general" && <GeneralTab userProfile={userProfile} onUpdate={onUpdate} />}
                {activeTab === "security" && <SecurityTab userProfile={userProfile} onUpdate={onUpdate} />}
                {activeTab === "billing" && <BillingTab userProfile={userProfile} history={history} onUpdate={onUpdate} />}
            </div>
        </div>
    );
}
