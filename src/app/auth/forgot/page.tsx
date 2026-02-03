"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setStatus(null);
        setLoading(true);
        try {
            const response = await fetch("/api/auth/forgot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data?.message ?? "Istek basarisiz.");
                return;
            }
            setStatus("Eger kayitliysa sifre sifirlama linki gonderildi.");
            setEmail("");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 rounded-full blur-[120px] opacity-30 -z-10" />

            <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col items-center text-center space-y-4">
                    <Link href="/auth/signin" className="mb-8 flex items-center gap-2 text-white/40 hover:text-white transition-colors group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Girise Don
                    </Link>
                    <div className="relative w-20 h-20 mb-2">
                        <Image src="/logo.png" alt="Zakrom Logo" fill className="object-contain" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter">Sifreyi Yenile</h1>
                    <p className="text-white/50">E-postanizi girin, sifre sifirlama baglantisi gonderelim.</p>
                </div>

                <div className="glass-card p-8 rounded-3xl border border-white/5 space-y-4">
                    <form onSubmit={handleSubmit} className="space-y-4">
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

                        {error ? <p className="text-sm text-red-400">{error}</p> : null}
                        {status ? <p className="text-sm text-white/70">{status}</p> : null}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-white h-12 rounded-2xl font-bold hover:bg-primary/90 transition-all disabled:opacity-60"
                        >
                            {loading ? "Gonderiliyor..." : "Sifirlama Linki Gonder"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
