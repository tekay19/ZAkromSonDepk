"use client";

import { Suspense, useState, useMemo, type FormEvent } from "react";
import Image from "next/image";
import { ArrowLeft, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

function SignInForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const verified = searchParams.get("verified");
    const emailChanged = searchParams.get("emailChanged");

    // Notifications logic
    const verifiedMessage = useMemo(() => {
        if (verified === "1") return { type: "success", text: "E-posta doğrulandı. Giriş yapabilirsiniz." };
        if (verified === "0") return { type: "error", text: "Doğrulama linki geçersiz veya süresi dolmuş." };
        if (emailChanged === "1") return { type: "success", text: "E-posta adresiniz güncellendi." };
        if (emailChanged === "0") return { type: "error", text: "E-posta değişimi doğrulanamadı." };
        return null;
    }, [verified, emailChanged]);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [twoFactorRequired, setTwoFactorRequired] = useState(false);
    const [twoFactorMethods, setTwoFactorMethods] = useState<string[]>([]);
    const [twoFactorMethod, setTwoFactorMethod] = useState<"email" | "totp">("email");
    const [info, setInfo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Variantes for Framer Motion
    const containerVariants = {
        hidden: { opacity: 0, scale: 0.95 },
        visible: {
            opacity: 1,
            scale: 1,
            transition: { duration: 0.5, ease: "easeOut", staggerChildren: 0.1 }
        },
        exit: { opacity: 0, scale: 0.95, transition: { duration: 0.3 } }
    } as const;

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    const requestTwoFactor = async () => {
        setError(null);
        setInfo(null);
        setLoading(true);
        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data?.message ?? "Giriş başarısız.");
                return;
            }
            if (data?.requiresTwoFactor) {
                setTwoFactorRequired(true);
                const methods = Array.isArray(data?.methods) ? data.methods : [];
                setTwoFactorMethods(methods);
                if (methods.includes("totp") && !methods.includes("email")) {
                    setTwoFactorMethod("totp");
                    setInfo("Authenticator kodunu girin.");
                } else {
                    setTwoFactorMethod("email");
                    setInfo("E-postanıza 6 haneli doğrulama kodu gönderildi.");
                }
                return;
            }

            const target = data?.redirectUrl ?? "/dashboard";
            if (target.startsWith("http")) {
                window.location.href = target;
            } else {
                router.push(target);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await requestTwoFactor();
    };

    const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setInfo(null);
        setLoading(true);
        try {
            const response = await fetch("/api/auth/2fa/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, code }),
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data?.message ?? "Kod doğrulanamadı.");
                return;
            }
            const target = data?.redirectUrl ?? "/dashboard";
            if (target.startsWith("http")) {
                window.location.href = target;
            } else {
                router.push(target);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md relative z-10">
            {/* Header / Logo Area */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="flex flex-col items-center text-center space-y-4 mb-8"
            >
                <Link href="/" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors group mb-4">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">Ana Sayfaya Dön</span>
                </Link>

                <div className="relative w-24 h-24 mb-4 filter drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] animate-float">
                    <Image src="/logo.png" alt="ZAKROM PRO" fill className="object-contain" />
                </div>

                <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">
                    ZAKROM PRO
                </h1>
                <p className="text-white/50 text-sm max-w-[280px]">
                    Yeni nesil veri analitiği ve lead toplama platformuna hoş geldiniz.
                </p>
            </motion.div>

            {/* Main Card */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={twoFactorRequired ? "2fa" : "login"}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="glass-card p-8 rounded-[2rem] border border-white/10 relative overflow-hidden"
                >
                    {/* Background Glow inside card */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -z-10 translate-x-1/2 -translate-y-1/2" />

                    {/* Notification Message */}
                    {verifiedMessage && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className={`mb-6 rounded-xl px-4 py-3 text-sm flex items-center gap-2 border ${verifiedMessage.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
                        >
                            <ShieldCheck className="w-4 h-4 shrink-0" />
                            {verifiedMessage.text}
                        </motion.div>
                    )}

                    {!twoFactorRequired ? (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <motion.div variants={itemVariants} className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-white/40 ml-1">E-posta</label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-primary transition-colors" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="glass-input w-full h-14 pl-12 pr-4 rounded-xl"
                                        placeholder="isim@sirket.com"
                                    />
                                </div>
                            </motion.div>

                            <motion.div variants={itemVariants} className="space-y-2">
                                <div className="flex justify-between items-center ml-1">
                                    <label className="text-xs font-bold uppercase tracking-widest text-white/40">Şifre</label>
                                    <Link href="/auth/forgot" className="text-xs text-primary/80 hover:text-primary transition-colors">
                                        Şifremi unuttum?
                                    </Link>
                                </div>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-primary transition-colors" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="glass-input w-full h-14 pl-12 pr-4 rounded-xl"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </motion.div>

                            {error && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-sm text-red-400 bg-red-500/5 p-3 rounded-lg border border-red-500/10 text-center"
                                >
                                    {error}
                                </motion.p>
                            )}

                            <motion.button
                                variants={itemVariants}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-primary to-blue-600 text-white h-14 rounded-xl font-bold text-lg shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                                {loading ? "Giriş Yapılıyor..." : "Giriş Yap"}
                            </motion.button>
                        </form>
                    ) : (
                        <form onSubmit={handleVerify} className="space-y-6">
                            <motion.div variants={itemVariants} className="text-center space-y-2">
                                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary mb-4">
                                    <ShieldCheck className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-white">İki Adımlı Doğrulama</h3>
                                <p className="text-white/50 text-sm">
                                    {twoFactorMethod === "totp"
                                        ? "Authenticator uygulamasındaki kodu girin."
                                        : "E-posta adresinize gönderilen kodu girin."}
                                </p>
                            </motion.div>

                            {twoFactorMethods.length > 1 && (
                                <motion.div variants={itemVariants} className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setTwoFactorMethod("email")}
                                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${twoFactorMethod === "email" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"}`}
                                    >
                                        E-posta
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTwoFactorMethod("totp")}
                                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${twoFactorMethod === "totp" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"}`}
                                    >
                                        Authenticator
                                    </button>
                                </motion.div>
                            )}

                            <motion.div variants={itemVariants} className="space-y-2">
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    required
                                    maxLength={6}
                                    className="glass-input w-full h-16 text-center text-3xl tracking-[0.5em] font-mono rounded-xl"
                                    placeholder="••••••"
                                />
                            </motion.div>

                            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
                            {info && <p className="text-sm text-white/50 text-center">{info}</p>}

                            <motion.div variants={itemVariants} className="space-y-3">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-primary text-white h-12 rounded-xl font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Doğrula"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setTwoFactorRequired(false);
                                        setCode("");
                                    }}
                                    className="w-full text-white/40 text-sm hover:text-white transition-colors"
                                >
                                    Geri Dön
                                </button>
                            </motion.div>
                        </form>
                    )}

                    {/* Footer / Social Login */}
                    {!twoFactorRequired && (
                        <motion.div variants={itemVariants} className="mt-8 pt-6 border-t border-white/5 space-y-6">
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-[#030303] px-2 text-white/20 font-bold relative top-[-1.6rem]">VEYA</span>
                            </div>

                            <button
                                onClick={() => router.push("/api/auth/signin/google?callbackUrl=/dashboard")}
                                className="w-full bg-white text-black h-14 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-gray-100 transition-all active:scale-95 group"
                            >
                                <Image
                                    src="/google.svg"
                                    alt="Google"
                                    width={24}
                                    height={24}
                                    className="group-hover:scale-110 transition-transform"
                                />
                                Google ile Devam Et
                            </button>

                            <p className="text-center text-sm text-white/30">
                                Hesabın yok mu?{" "}
                                <Link href="/auth/signup" className="text-primary hover:text-primary/80 font-medium transition-colors">
                                    Hemen Kaydol
                                </Link>
                            </p>
                        </motion.div>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Disclaimer */}
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-center text-xs text-white/20 mt-8 max-w-xs mx-auto"
            >
                Giriş yaparak <Link href="#" className="hover:text-white/40 transition-colors">Kullanım Şartları</Link> ve <Link href="#" className="hover:text-white/40 transition-colors">Gizlilik Politikası</Link>'nı kabul etmiş sayılırsınız.
            </motion.p>
        </div>
    );
}

export default function SignInPage() {
    return (
        <div className="min-h-screen bg-[#030303] flex items-center justify-center p-4 relative overflow-hidden selection:bg-primary/30">
            {/* Dynamic Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] opacity-20 animate-pulse" />
                <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] opacity-20 animate-pulse" style={{ animationDelay: "2s" }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-900/10 rounded-full blur-[100px] opacity-20" />

                {/* Grid Pattern */}
                <div className="absolute inset-0 bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
            </div>

            <Suspense fallback={<div className="text-white">Yükleniyor...</div>}>
                <SignInForm />
            </Suspense>
        </div>
    );
}
