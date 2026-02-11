"use client";

import { useEffect, useState } from "react";
import { getCreditSummary } from "@/app/actions/get-credit-history";
import { getLeads } from "@/app/actions/get-leads";
import { UsageView } from "@/components/UsageView";
import { AnalyticsSlot } from "@/components/AnalyticsSlot";
import type { SubscriptionTier } from "@/lib/plans";
import type { PlaceResult } from "@/lib/types";
import { BarChart3, Loader2 } from "lucide-react";

export default function AnalyticsPage() {
  const [tier, setTier] = useState<SubscriptionTier>("FREE");
  const [leads, setLeads] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCreditSummary(), getLeads(200)])
      .then(([s, l]) => {
        setTier((s.subscriptionTier as SubscriptionTier) || "FREE");
        setLeads(l || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-primary" />
          Analizler
        </h1>
        <p className="text-gray-400 mt-1">Kredi kullanımı ve pazar görünümü.</p>
      </div>

      <UsageView tier={tier} />

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white">Pazar Görünümü (Lead Seti)</h2>
        {leads.length > 0 ? (
          <div className="h-[220px] bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <AnalyticsSlot results={leads} />
          </div>
        ) : (
          <div className="text-sm text-white/50 bg-white/5 border border-white/10 rounded-2xl p-6">
            Henüz lead yok. Önce keşif yapıp mail kilidini açın.
          </div>
        )}
      </div>
    </div>
  );
}

