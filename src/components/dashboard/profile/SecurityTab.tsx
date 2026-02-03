"use client";

import { useState } from "react";
import { ShieldCheck, KeyRound, Mail, LogOut, Smartphone, Lock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";

interface SecurityTabProps {
    userProfile: any;
    onUpdate: () => void;
}

export default function SecurityTab({ userProfile, onUpdate }: SecurityTabProps) {
    // Password State
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordError, setPasswordError] = useState("");
    const [passwordSuccess, setPasswordSuccess] = useState("");

    // 2FA State
    const [email2faLoading, setEmail2faLoading] = useState(false);

    // TOTP State
    const [totpSetup, setTotpSetup] = useState<any>(null);
    const [totpCode, setTotpCode] = useState("");
    const [totpLoading, setTotpLoading] = useState(false);
    const [totpError, setTotpError] = useState("");

    // Account Deletion
    const [deleteConfirm, setDeleteConfirm] = useState("");
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteCode, setDeleteCode] = useState("");
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setPasswordError("Yeni şifreler eşleşmiyor.");
            return;
        }
        setPasswordLoading(true);
        setPasswordError("");
        setPasswordSuccess("");

        try {
            const res = await fetch("/api/account/password", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setPasswordSuccess("Şifreniz başarıyla güncellendi.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err: any) {
            setPasswordError(err.message);
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleToggleEmail2fa = async () => {
        setEmail2faLoading(true);
        try {
            const res = await fetch("/api/account/2fa/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: !userProfile?.twoFactorEnabled }),
            });
            if (!res.ok) throw new Error("İşlem başarısız.");
            onUpdate();
        } catch (error) {
            console.error(error);
        } finally {
            setEmail2faLoading(false);
        }
    };

    const handleTotpSetup = async () => {
        setTotpLoading(true);
        try {
            const res = await fetch("/api/account/2fa/totp/setup", { method: "POST" });
            const data = await res.json();
            if (data.qrDataUrl) setTotpSetup(data);
        } catch (error) {
            console.error(error);
        } finally {
            setTotpLoading(false);
        }
    };

    const handleTotpVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setTotpLoading(true);
        setTotpError("");
        try {
            const res = await fetch("/api/account/2fa/totp/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: totpCode, secret: totpSetup.secret }),
            });

            if (!res.ok) throw new Error("Doğrulama başarısız. Kodu kontrol edin.");

            setTotpSetup(null);
            setTotpCode("");
            onUpdate();
        } catch (err: any) {
            setTotpError(err.message);
        } finally {
            setTotpLoading(false);
        }
    };

    const handleTotpDisable = async () => {
        if (!confirm("Authenticator'ı devre dışı bırakmak istediğinize emin misiniz?")) return;
        setTotpLoading(true);
        try {
            await fetch("/api/account/2fa/totp/disable", { method: "POST" });
            onUpdate();
        } catch (e) { console.error(e); }
        finally { setTotpLoading(false); }
    };

    const handleAccountDelete = async (e: React.FormEvent) => {
        e.preventDefault();
        if (deleteConfirm !== "DELETE") {
            setDeleteError("Onay metnini doğru girmediniz.");
            return;
        }
        setDeleteLoading(true);
        setDeleteError("");

        try {
            const res = await fetch("/api/account/delete", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    password: deletePassword,
                    code: deleteCode
                })
            });
            if (!res.ok) {
                const data = await res.json();
                // Basic error handling logic for 2FA requirement
                if (res.status === 403 && data.requires2fa) {
                    setDeleteError("Güvenlik nedeniyle 2FA kodu gereklidir.");
                    // Logic to show 2FA input could be added here, simplified for now
                    return;
                }
                throw new Error(data.error || "Hesap silinemedi.");
            }

            signOut({ callbackUrl: "/" });
        } catch (err: any) {
            setDeleteError(err.message);
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Password Section */}
            <div className="glass-card rounded-3xl p-8 border border-white/10 bg-white/5">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-primary/10 rounded-xl text-primary"><KeyRound className="w-6 h-6" /></div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Şifre Değiştir</h3>
                        <p className="text-sm text-white/50">Hesabınızın şifresini düzenli olarak güncellemeniz önerilir.</p>
                    </div>
                </div>

                <form onSubmit={handlePasswordChange} className="space-y-4 max-w-xl">
                    <input
                        type="password"
                        placeholder="Mevcut Şifre"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full h-12 rounded-xl bg-white/5 border border-white/10 px-4 text-white placeholder:text-white/30 focus:border-primary focus:outline-none"
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <input
                            type="password"
                            placeholder="Yeni Şifre"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full h-12 rounded-xl bg-white/5 border border-white/10 px-4 text-white placeholder:text-white/30 focus:border-primary focus:outline-none"
                        />
                        <input
                            type="password"
                            placeholder="Yeni Şifre (Tekrar)"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full h-12 rounded-xl bg-white/5 border border-white/10 px-4 text-white placeholder:text-white/30 focus:border-primary focus:outline-none"
                        />
                    </div>

                    {passwordError && <p className="text-red-400 text-sm">{passwordError}</p>}
                    {passwordSuccess && <p className="text-emerald-400 text-sm">{passwordSuccess}</p>}

                    <button
                        type="submit"
                        disabled={passwordLoading}
                        className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all disabled:opacity-50"
                    >
                        {passwordLoading ? "Güncelleniyor..." : "Şifreyi Güncelle"}
                    </button>
                </form>
            </div>

            {/* 2FA Section */}
            <div className="glass-card rounded-3xl p-8 border border-white/10 bg-white/5">
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400"><Smartphone className="w-6 h-6" /></div>
                    <div>
                        <h3 className="text-xl font-bold text-white">İki Adımlı Doğrulama (2FA)</h3>
                        <p className="text-sm text-white/50">Hesabınızı ekstra güvenlik katmanı ile koruyun.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Email 2FA */}
                    <div className="p-6 rounded-2xl border border-white/5 bg-white/5 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <Mail className="w-5 h-5 text-white/60" />
                                <h4 className="font-bold text-white">E-posta Doğrulama</h4>
                            </div>
                            <p className="text-xs text-white/40 mb-6 group-hover:text-white/60 transition-colors">
                                Giriş yaparken e-posta adresinize gönderilen kodu girmeniz gerekir.
                            </p>
                        </div>
                        <div className="flex items-center justify-between mt-auto">
                            <span className={cn("text-xs font-bold uppercase", userProfile?.twoFactorEnabled ? "text-emerald-400" : "text-white/30")}>
                                {userProfile?.twoFactorEnabled ? "Aktif" : "Pasif"}
                            </span>
                            <button
                                onClick={handleToggleEmail2fa}
                                disabled={email2faLoading}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-bold ring-1 transition-all",
                                    userProfile?.twoFactorEnabled
                                        ? "bg-emerald-500/10 ring-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                                        : "bg-white/5 ring-white/10 text-white hover:bg-white/10"
                                )}
                            >
                                {userProfile?.twoFactorEnabled ? "Devre Dışı Bırak" : "Etkinleştir"}
                            </button>
                        </div>
                    </div>

                    {/* TOTP */}
                    <div className="p-6 rounded-2xl border border-white/5 bg-white/5 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <Lock className="w-5 h-5 text-white/60" />
                                <h4 className="font-bold text-white">Authenticator Uygulaması</h4>
                            </div>
                            <p className="text-xs text-white/40 mb-6">
                                Google Authenticator veya Authy gibi uygulamalarla kod üretin.
                            </p>
                        </div>

                        {!totpSetup ? (
                            <div className="flex items-center justify-between mt-auto">
                                <span className={cn("text-xs font-bold uppercase", userProfile?.totpEnabled ? "text-emerald-400" : "text-white/30")}>
                                    {userProfile?.totpEnabled ? "Aktif" : "Pasif"}
                                </span>
                                <button
                                    onClick={userProfile?.totpEnabled ? handleTotpDisable : handleTotpSetup}
                                    disabled={totpLoading}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-xs font-bold ring-1 transition-all",
                                        userProfile?.totpEnabled
                                            ? "bg-red-500/10 ring-red-500/30 text-red-400 hover:bg-red-500/20"
                                            : "bg-white/5 ring-white/10 text-white hover:bg-white/10"
                                    )}
                                >
                                    {userProfile?.totpEnabled ? "Kaldır" : "Kur"}
                                </button>
                            </div>
                        ) : (
                            <div className="mt-4 animate-in theme-dark fade-in zoom-in-95 duration-200">
                                <div className="bg-white p-2 rounded-xl w-fit mb-4">
                                    <img src={totpSetup.qrDataUrl} alt="QR" className="w-24 h-24" />
                                </div>
                                <form onSubmit={handleTotpVerify} className="flex gap-2">
                                    <input
                                        className="w-full bg-black/20 text-white text-center tracking-[0.5em] text-sm rounded-lg border border-white/10 focus:border-primary focus:outline-none"
                                        placeholder="000000"
                                        maxLength={6}
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value)}
                                    />
                                    <button type="submit" className="px-3 bg-primary text-white rounded-lg text-xs font-bold">
                                        Onayla
                                    </button>
                                </form>
                                {totpError && <p className="text-red-400 text-[10px] mt-2">{totpError}</p>}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete Account */}
            <div className="glass-card rounded-3xl p-8 border border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-red-500/10 rounded-xl text-red-500"><LogOut className="w-6 h-6" /></div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Hesabı Sil</h3>
                        <p className="text-sm text-red-200/60">Bu işlem geri alınamaz ve tüm verileriniz kalıcı olarak silinir.</p>
                    </div>
                </div>

                <form onSubmit={handleAccountDelete} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="w-full md:w-auto flex-1 space-y-2">
                        <label className="text-xs uppercase font-bold text-red-300/50">Onaylamak için "DELETE" yazın</label>
                        <input
                            className="w-full bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-white placeholder:text-red-300/20 focus:outline-none focus:border-red-500/50"
                            placeholder="DELETE"
                            value={deleteConfirm}
                            onChange={(e) => setDeleteConfirm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-auto flex-1 space-y-2">
                        <label className="text-xs uppercase font-bold text-red-300/50">Mevcut Şifre</label>
                        <input
                            type="password"
                            className="w-full bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-white placeholder:text-red-300/20 focus:outline-none focus:border-red-500/50"
                            placeholder="••••••••"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={deleteLoading || deleteConfirm !== "DELETE"}
                        className="w-full md:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl disabled:opacity-50 transition-all"
                    >
                        {deleteLoading ? "Siliniyor..." : "Hesabı Sil"}
                    </button>
                </form>
                {deleteError && <p className="mt-4 text-red-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {deleteError}</p>}
            </div>
        </div>
    );
}
