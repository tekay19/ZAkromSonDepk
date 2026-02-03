"use client";

import { useState, useEffect } from "react";
import { User, Mail, CheckCircle2, AlertCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneralTabProps {
    userProfile: any;
    onUpdate: () => void;
}

export default function GeneralTab({ userProfile, onUpdate }: GeneralTabProps) {
    const [name, setName] = useState(userProfile?.name || "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        if (userProfile?.name) {
            setName(userProfile.name);
        }
    }, [userProfile]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess("");

        try {
            const res = await fetch("/api/account/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Profil güncellenemedi");
            }

            setSuccess("Profil başarıyla güncellendi.");
            onUpdate();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass-card rounded-3xl p-8 border border-white/10 bg-white/5 space-y-8">
                <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                    <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
                        <User className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Kişisel Bilgiler</h3>
                        <p className="text-sm text-white/50">Hesap detaylarınızı buradan yönetin.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs uppercase tracking-widest text-white/40 font-bold ml-1">İsim Soyisim</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ad Soyad"
                                className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary focus:bg-white/10 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs uppercase tracking-widest text-white/40 font-bold ml-1">E-posta Adresi</label>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={userProfile?.email || ""}
                                    disabled
                                    className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white/50 cursor-not-allowed"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                    {userProfile?.emailVerified ? (
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-yellow-500" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                        <div className="p-2 bg-white/5 rounded-lg">
                            <Mail className="w-4 h-4 text-white/60" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-white/80">E-posta Durumu</p>
                            <p className={cn("text-xs font-bold", userProfile?.emailVerified ? "text-emerald-400" : "text-yellow-400")}>
                                {userProfile?.emailVerified ? "Hesabınız doğrulanmış." : "Lütfen e-posta adresinizi doğrulayın."}
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-sm flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            {success}
                        </div>
                    )}

                    <div className="flex justify-end pt-4 border-t border-white/5">
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-8 py-4 bg-primary text-white rounded-2xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                        >
                            {loading ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                        </button>
                    </div>
                </form>
            </div>

            {/* Side Info */}
            <div className="glass-card rounded-3xl p-8 border border-white/10 bg-white/5 h-fit">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Shield className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Hesap Güvenliği</h3>
                </div>
                <p className="text-sm text-white/60 mb-6 leading-relaxed">
                    Hesabınızın güvenliği bizim için önemlidir. Şifrenizi ve 2FA ayarlarınızı <b>Güvenlik</b> sekmesinden yönetebilirsiniz.
                </p>

                <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm py-2 border-b border-white/5">
                        <span className="text-white/40">Son Giriş</span>
                        <span className="text-white font-mono">{userProfile?.lastLoginAt ? new Date(userProfile.lastLoginAt).toLocaleDateString() : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm py-2 border-b border-white/5">
                        <span className="text-white/40">Kayıt Tarihi</span>
                        <span className="text-white font-mono">{userProfile?.createdAt ? new Date(userProfile.createdAt).toLocaleDateString() : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm py-2 border-b border-white/5">
                        <span className="text-white/40">IP Adresi</span>
                        <span className="text-white font-mono">{userProfile?.lastLoginIp || "—"}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
