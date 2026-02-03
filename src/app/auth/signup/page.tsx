"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";

export default function SignUpPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);
        try {
            const response = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            const contentType = response.headers.get("Content-Type");
            let data: any = null;

            if (contentType && contentType.includes("application/json")) {
                try {
                    data = await response.json();
                } catch (e) {
                    console.error("JSON parse error:", e);
                }
            } else {
                // Try to get text if not JSON, to log or show
                const text = await response.text();
                console.warn("Non-JSON response:", text);
                data = { message: "Sunucu yanit vermedi. Lutfen tekrar deneyin." };
            }

            if (!response.ok) {
                setError(data?.message ?? "Kayit basarisiz. Bir hata olustu.");
                return;
            }
            setSuccess(data?.message ?? "Kayit basarili. Lutfen e-postanizi kontrol edin.");
            setName("");
            setEmail("");
            setPassword("");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 rounded-full blur-[120px] opacity-30 -z-10" />

            <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col items-center text-center space-y-4">
                    <Link href="/" className="mb-8 flex items-center gap-2 text-white/40 hover:text-white transition-colors group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Geri Dön
                    </Link>
                    <div className="relative w-20 h-20 mb-2">
                        <Image src="/logo.png" alt="Zakrom Logo" fill className="object-contain" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter">Hesap Olustur</h1>
                    <p className="text-white/50">Hemen kaydolun ve platformu kesfetmeye baslayin.</p>
                </div>

                <div className="glass-card p-8 rounded-3xl border border-white/5 space-y-4">
                    {success ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                            {success}
                        </div>
                    ) : null}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs uppercase tracking-widest text-white/40">Isim</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                autoComplete="name"
                                className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                                placeholder="Ad Soyad"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs uppercase tracking-widest text-white/40">E-posta</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                autoComplete="email"
                                required
                                className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                                placeholder="ornek@firma.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs uppercase tracking-widest text-white/40">Sifre</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="new-password"
                                required
                                className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                                placeholder="En az 10 karakter"
                            />
                            <p className="text-xs text-white/30">
                                En az 10 karakter, buyuk/kucuk harf, rakam ve sembol icermeli.
                            </p>
                        </div>

                        {error ? <p className="text-sm text-red-400">{error}</p> : null}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-white h-12 rounded-2xl font-bold hover:bg-primary/90 transition-all disabled:opacity-60"
                        >
                            {loading ? "Kayit olusturuluyor..." : "Kaydol"}
                        </button>
                    </form>

                    <div className="text-xs text-white/40 text-center">
                        Zaten hesabiniz var mi?{" "}
                        <Link href="/auth/signin" className="hover:text-white">
                            Giris yap
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
