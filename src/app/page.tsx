"use client";

import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Zap, Globe, Download, Play } from "lucide-react";
import { SUBSCRIPTION_PLANS } from "@/lib/constants/pricing";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
};

const staggerContainer = {
    animate: {
        transition: {
            staggerChildren: 0.1
        }
    }
};

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-white/20 relative overflow-hidden">
            {/* Background Texture */}
            <div className="fixed inset-0 bg-mesh opacity-50 z-0 pointer-events-none" />
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full z-0" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full z-0" />

            {/* Header */}
            <motion.header
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl"
            >
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
                            <span className="text-black font-black text-xl italic mt-[-2px] ml-[-2px]">Z</span>
                        </div>
                        <span className="font-bold text-xl tracking-tighter">ZAKROM</span>
                    </div>
                    <nav className="hidden md:flex items-center gap-8">
                        <Link href="#features" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Özellikler</Link>
                        <Link href="#pricing" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Fiyatlandırma</Link>
                        <Link
                            href="/dashboard"
                            className="text-sm font-bold bg-white text-black px-5 py-2.5 rounded-full hover:bg-neutral-200 transition-all active:scale-95"
                        >
                            Dashboard
                        </Link>
                    </nav>
                </div>
            </motion.header>

            <main className="relative z-10 pt-32 pb-20">
                {/* Hero Section */}
                <section className="max-w-7xl mx-auto px-6 flex flex-col items-center text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-neutral-400 mb-8"
                    >
                        <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        V1.0 LANSMAN ÖZEL
                    </motion.div>

                    <motion.div
                        variants={staggerContainer}
                        initial="initial"
                        animate="animate"
                        className="space-y-8 max-w-4xl mx-auto"
                    >
                        <motion.h1
                            variants={fadeInUp}
                            className="text-6xl md:text-8xl font-black tracking-tight leading-[0.9] text-glow"
                        >
                            GLOBAL <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-neutral-500">LEAD ENGINE</span>
                        </motion.h1>

                        <motion.p
                            variants={fadeInUp}
                            className="text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed"
                        >
                            Saniyeler içinde binlerce doğrulanmış B2B verisine ulaşın.
                            Gelişmiş yapay zeka ve harita senkronizasyonu ile satış ekibiniz için sınırsız potansiyel.
                        </motion.p>

                        <motion.div
                            variants={fadeInUp}
                            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
                        >
                            <Link
                                href="/dashboard"
                                className="group relative bg-white text-black px-10 py-5 rounded-full font-bold transition-all hover:pr-12 active:scale-95 glow-primary overflow-hidden"
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    Hemen Başla <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </span>
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                            </Link>
                            <button className="px-10 py-5 rounded-full font-bold bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-2 group active:scale-95">
                                <Play className="w-4 h-4 fill-white" /> Demo İzle
                            </button>
                        </motion.div>
                    </motion.div>

                    {/* Hero Image / Dashboard Preview */}
                    <motion.div
                        initial={{ opacity: 0, y: 100 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className="w-full max-w-6xl mx-auto mt-24 relative"
                    >
                        <div className="absolute inset-0 bg-blue-500/20 blur-[100px] -z-10" />
                        <div className="rounded-2xl overflow-hidden border border-white/10 bg-neutral-900/50 backdrop-blur shadow-2xl">
                            <div className="h-10 border-b border-white/5 bg-white/5 flex items-center px-4 gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
                                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20" />
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500/20" />
                            </div>
                            <div className="relative aspect-[16/9]">
                                <Image
                                    src="/dashboard-preview.png"
                                    alt="Dashboard Preview"
                                    fill
                                    className="object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                    priority
                                />
                            </div>
                        </div>
                    </motion.div>
                </section>

                {/* Features Section */}
                <section id="features" className="py-32 max-w-7xl mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="text-center mb-20"
                    >
                        <h2 className="text-4xl font-bold tracking-tight mb-4">Üst Düzey Teknoloji</h2>
                        <p className="text-neutral-500">Lead generation sürecinizi dönüştüren akıllı çözümler.</p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                icon: <Globe className="w-6 h-6 text-blue-400" />,
                                title: "Derinlemesine Analiz",
                                desc: "Kıta, ülke ve ilçe bazlı gelişmiş filtreleme ile nokta atışı hedefleme yapın."
                            },
                            {
                                icon: <Zap className="w-6 h-6 text-yellow-400" />,
                                title: "Harita Görselleştirme",
                                desc: "İşletme yoğunluklarını ısı haritaları üzerinde görün. Yeni pazar fırsatlarını anında keşfedin."
                            },
                            {
                                icon: <Download className="w-6 h-6 text-purple-400" />,
                                title: "Anlık Export",
                                desc: "CSV, Excel veya JSON. Binlerce veriyi tek tıkla saniyeler içinde sisteminize aktarın."
                            }
                        ].map((feature, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.1 }}
                                whileHover={{ y: -5 }}
                                className="p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300"
                            >
                                <div className="w-12 h-12 bg-white/5 flex items-center justify-center rounded-2xl mb-6">
                                    {feature.icon}
                                </div>
                                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                                <p className="text-neutral-400 leading-relaxed text-sm">{feature.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* Pricing Section */}
                <section id="pricing" className="py-32 max-w-7xl mx-auto px-6 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 blur-[150px] -z-10" />

                    <div className="text-center mb-20">
                        <h2 className="text-4xl font-bold tracking-tight mb-4">Performans Odaklı Planlar</h2>
                        <p className="text-neutral-500">İşletmenizin ölçeğine en uygun büyüme planını seçin.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {SUBSCRIPTION_PLANS.map((plan, idx) => (
                            <motion.div
                                key={plan.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.1 }}
                                className={cn(
                                    "relative p-8 rounded-[32px] border flex flex-col transition-all duration-500",
                                    plan.highlight
                                        ? "bg-white text-black border-white shadow-[0_0_50px_-12px_rgba(255,255,255,0.3)] scale-105 z-10"
                                        : "bg-white/[0.02] border-white/5 text-white hover:border-white/10"
                                )}
                            >
                                {plan.highlight && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full tracking-widest uppercase">
                                        EN POPÜLER
                                    </div>
                                )}

                                <div className="mb-8">
                                    <h4 className={cn(
                                        "text-lg font-bold mb-1",
                                        plan.highlight ? "text-neutral-800" : "text-white"
                                    )}>{plan.name}</h4>
                                    <p className="text-4xl font-black tracking-tight">
                                        {plan.price === 0 ? "Free" : `$${plan.price}`}
                                        {plan.price > 0 && <span className="text-sm font-normal opacity-60">/Ay</span>}
                                    </p>
                                </div>

                                <div className={cn(
                                    "flex items-baseline gap-2 mb-8 p-3 rounded-2xl",
                                    plan.highlight ? "bg-black/5" : "bg-white/5"
                                )}>
                                    <span className="text-2xl font-black">{plan.credits.toLocaleString()}</span>
                                    <span className="text-xs font-bold opacity-60 uppercase tracking-widest">Kredi</span>
                                </div>

                                <ul className="space-y-4 text-sm font-medium flex-1 mb-10">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <CheckCircle2 className={cn(
                                                "w-4 h-4 mt-0.5 shrink-0",
                                                plan.highlight ? "text-blue-600" : "text-blue-400"
                                            )} />
                                            <span className={plan.highlight ? "text-neutral-700" : "text-neutral-400"}>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Link
                                    href={plan.price === 0 ? "/auth/signup" : `/dashboard/settings?upgrade=${plan.id}`}
                                    className={cn(
                                        "block w-full text-center py-4 rounded-2xl font-bold transition-all text-sm active:scale-95",
                                        plan.highlight
                                            ? "bg-black text-white hover:bg-neutral-800"
                                            : "bg-white text-black hover:bg-neutral-200 shadow-xl"
                                    )}
                                >
                                    Planı Başlat
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="py-20 border-t border-white/5 bg-black/50 relative z-10">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-10">
                    <div className="flex flex-col items-center md:items-start gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-white rounded flex items-center justify-center">
                                <span className="text-black font-black text-xs italic">Z</span>
                            </div>
                            <span className="font-bold text-lg tracking-tighter">ZAKROM</span>
                        </div>
                        <p className="text-neutral-500 text-sm max-w-sm text-center md:text-left">
                            Yeni nesil B2B lead generation platformu. Veriyi fırsata dönüştürün.
                        </p>
                    </div>

                    <div className="flex gap-12 text-sm">
                        <div className="flex flex-col gap-4">
                            <span className="font-bold">Ürün</span>
                            <Link href="#" className="text-neutral-500 hover:text-white transition-colors">Özellikler</Link>
                            <Link href="#" className="text-neutral-500 hover:text-white transition-colors">Fiyatlandırma</Link>
                        </div>
                        <div className="flex flex-col gap-4">
                            <span className="font-bold">Yasal</span>
                            <Link href="#" className="text-neutral-500 hover:text-white transition-colors">Gizlilik</Link>
                            <Link href="#" className="text-neutral-500 hover:text-white transition-colors">Şartlar</Link>
                        </div>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-6 mt-20 pt-8 border-t border-white/5 text-center">
                    <p className="text-[10px] text-neutral-600 font-mono tracking-widest uppercase">© 2026 ZAKROM INTERNATIONAL LTD. ALL RIGHTS RESERVED.</p>
                </div>
            </footer>
        </div>
    );
}

