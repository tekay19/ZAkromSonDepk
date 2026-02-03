
import { CreditTransaction } from "@prisma/client";
import { ArrowDownLeft, ArrowUpRight, Search, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UsageHistoryTableProps {
    transactions: CreditTransaction[];
}

export function UsageHistoryTable({ transactions }: UsageHistoryTableProps) {

    if (!transactions || transactions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-white/5 rounded-2xl border border-white/5 text-center">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-3">
                    <Clock className="w-6 h-6 text-white/20" />
                </div>
                <h4 className="text-white font-medium mb-1">Henüz işlem yok</h4>
                <p className="text-xs text-white/40">Kredi kullanım geçmişiniz burada listelenecek.</p>
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                            <th className="px-6 py-4 font-bold text-xs text-white/40 uppercase tracking-wider">İşlem Türü</th>
                            <th className="px-6 py-4 font-bold text-xs text-white/40 uppercase tracking-wider text-right">Miktar</th>
                            <th className="px-6 py-4 font-bold text-xs text-white/40 uppercase tracking-wider text-right">Tarih</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {transactions.map((tx) => {
                            const isNegative = tx.amount < 0;
                            return (
                                <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center border",
                                                isNegative
                                                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                                                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                            )}>
                                                {isNegative ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                                            </div>
                                            <div>
                                                <div className="font-medium text-white group-hover:text-primary transition-colors">
                                                    {formatTransactionType(tx.type)}
                                                </div>
                                                <div className="text-[10px] text-white/40 font-mono hidden sm:block">
                                                    ID: {tx.id.substring(0, 8)}...
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className={cn(
                                            "font-bold font-mono",
                                            isNegative ? "text-white/80" : "text-emerald-400"
                                        )}>
                                            {tx.amount > 0 ? "+" : ""}{tx.amount}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="text-white/60 text-xs">
                                            {new Date(tx.createdAt).toLocaleDateString("tr-TR", {
                                                day: 'numeric',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </div>
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

function formatTransactionType(type: string): string {
    const map: Record<string, string> = {
        "SEARCH": "Standart Arama",
        "DEEP_SEARCH": "Derin Arama",
        "PAGE_LOAD": "Sayfa Yükleme",
        "PURCHASE": "Kredi Satın Alma",
        "BONUS": "Bonus Kredi",
        "REFUND": "İade",
        "EXPORT_EXCEL": "Excel Dışa Aktarma"
    };
    return map[type] || type.replace("_", " ");
}
