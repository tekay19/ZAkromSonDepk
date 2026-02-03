"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setStatus(null);

        if (!token) {
            setError("Sifirlama tokeni bulunamadi.");
            return;
        }
        if (password !== confirm) {
            setError("Sifreler eslesmiyor.");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch("/api/auth/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data?.message ?? "Islem basarisiz.");
                return;
            }
            setStatus("Sifreniz guncellendi. Giris sayfasina yonlendiriliyorsunuz.");
            setPassword("");
            setConfirm("");
            setTimeout(() => router.push("/auth/signin"), 1200);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col items-center text-center space-y-4">
                <Link href="/auth/signin" className="mb-8 flex items-center gap-2 text-white/40 hover:text-white transition-colors group">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Girise Don
                </Link>
                <div className="relative w-20 h-20 mb-2">
                    <Image src="/logo.png" alt="Zakrom Logo" fill className="object-contain" />
                </div>
                <h1 className="text-3xl font-black tracking-tighter">Yeni Sifre Belirle</h1>
                <p className="text-white/50">Guclu bir sifre belirleyin ve hesabinizi koruyun.</p>
            </div>

            <div className="glass-card p-8 rounded-3xl border border-white/5 space-y-4">
                {!token ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                        Sifirlama tokeni bulunamadi. Lutfen{" "}
                        <Link href="/auth/forgot" className="underline">
                            yeni bir sifirlama istegi
                        </Link>{" "}
                        olusturun.
                    </div>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-widest text-white/40">Yeni Sifre</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            required
                            className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                            placeholder="En az 10 karakter"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-widest text-white/40">Yeni Sifre (Tekrar)</label>
                        <input
                            type="password"
                            value={confirm}
                            onChange={(event) => setConfirm(event.target.value)}
                            autoComplete="new-password"
                            required
                            className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                            placeholder="Tekrar yazin"
                        />
                    </div>

                    {error ? <p className="text-sm text-red-400">{error}</p> : null}
                    {status ? <p className="text-sm text-white/70">{status}</p> : null}

                    <button
                        type="submit"
                        disabled={loading || !token}
                        className="w-full bg-primary text-white h-12 rounded-2xl font-bold hover:bg-primary/90 transition-all disabled:opacity-60"
                    >
                        {loading ? "Guncelleniyor..." : "Sifreyi Guncelle"}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 rounded-full blur-[120px] opacity-30 -z-10" />

            <Suspense fallback={<div className="text-white">Yukleniyor...</div>}>
                <ResetPasswordForm />
            </Suspense>
        </div>
    );
}
