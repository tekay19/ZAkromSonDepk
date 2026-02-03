"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Search, Map, BarChart3, Download, ArrowRight, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-primary/30 overflow-x-hidden">
            {/* Header */}
            <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/20 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="relative w-8 h-8">
                            <Image src="/logo.png" alt="Zakrom Logo" fill className="object-contain" />
                        </div>
                        <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">ZAKROM PRO</span>
                    </div>
                    <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
                        <a href="#features" className="hover:text-white transition-colors">Özellikler</a>
                        <a href="#pricing" className="hover:text-white transition-colors">Fiyatlandırma</a>
                        <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
                    </nav>
                    <Link
                        href="/dashboard"
                        className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-bold hover:bg-white/90 transition-all shadow-xl shadow-white/10 active:scale-95"
                    >
                        Hemen Başla
                    </Link>
                </div>
            </header>

            <main>
                {/* Hero Section */}
                <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6">
                    {/* Background Glows */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/20 rounded-full blur-[120px] opacity-40 -z-10" />

                    <div className="max-w-5xl mx-auto text-center space-y-8">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-primary-light text-xs font-bold tracking-widest uppercase mb-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
                            🚀 Yeni Nesil İş Zekası Platformu
                        </div>
                        <h1 className="text-5xl md:text-8xl font-black tracking-tighter leading-[0.9] animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-100">
                            SANİYELER İÇİNDE <br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-b from-primary to-blue-600">BİNLERCE LEAD</span> BULUN.
                        </h1>
                        <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
                            Dünya çapındaki milyonlarca işletmeyi analiz edin, iletişim bilgilerini listeleyin ve satış ekibinizin verimliliğini %300 artırın.
                        </p>

                        <div className="flex flex-col md:flex-row items-center justify-center gap-4 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
                            <Link
                                href="/dashboard"
                                className="w-full md:w-auto bg-primary text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-primary/90 transition-all shadow-2xl shadow-primary/20 group"
                            >
                                Ücretsiz Dene <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </Link>
                            <button className="w-full md:w-auto bg-white/5 border border-white/10 text-white px-8 py-4 rounded-2xl font-bold hover:bg-white/10 transition-all">
                                Demo Talebi
                            </button>
                        </div>

                        {/* Social Proof / Trusted By */}
                        <div className="pt-20 opacity-30 animate-in fade-in duration-1000 delay-500">
                            <p className="text-sm font-medium mb-6 uppercase tracking-widest">GÜVENEN MARKALAR</p>
                            <div className="flex flex-wrap justify-center gap-8 md:gap-16 grayscale brightness-200">
                                <div className="text-2xl font-bold italic tracking-tighter">TECHCORP</div>
                                <div className="text-2xl font-bold italic tracking-tighter">DATAWAVE</div>
                                <div className="text-2xl font-bold italic tracking-tighter">ZEPHYR</div>
                                <div className="text-2xl font-bold italic tracking-tighter">QUANTUM</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section id="features" className="py-32 px-6">
                    <div className="max-w-7xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Feature 1 */}
                            <div className="glass-card p-10 rounded-3xl border border-white/5 space-y-6 hover:bg-white/[0.03] transition-colors group">
                                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <Search className="w-8 h-8" />
                                </div>
                                <h3 className="text-2xl font-bold">Derinlemesine Arama</h3>
                                <p className="text-white/40 leading-relaxed">
                                    Kıta, ülke ve ilçe bazlı gelişmiş filtreleme ile ihtiyacınız olan hedef kitleye nokta atışı ulaşın.
                                </p>
                            </div>
                            {/* Feature 2 */}
                            <div className="glass-card p-10 rounded-3xl border border-white/5 space-y-6 hover:bg-white/[0.03] transition-colors group">
                                <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                                    <Map className="w-8 h-8" />
                                </div>
                                <h3 className="text-2xl font-bold">Harita Analizi</h3>
                                <p className="text-white/40 leading-relaxed">
                                    İşletme yoğunluklarını ısı haritaları ile görselleştirin ve rekabetin az olduğu bölgeleri keşfedin.
                                </p>
                            </div>
                            {/* Feature 3 */}
                            <div className="glass-card p-10 rounded-3xl border border-white/5 space-y-6 hover:bg-white/[0.03] transition-colors group">
                                <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-400 group-hover:scale-110 transition-transform">
                                    <Download className="w-8 h-8" />
                                </div>
                                <h3 className="text-2xl font-bold">Hızlı Dışa Aktar</h3>
                                <p className="text-white/40 leading-relaxed">
                                    Bulduğunuz tüm verileri saniyeler içinde CSV veya Excel formatında indirip CRM sisteminize aktarın.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Stats Section */}
                <section className="py-32 bg-white/5 border-y border-white/5">
                    <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
                        <div className="space-y-2">
                            <div className="text-4xl md:text-5xl font-black text-primary tracking-tighter">50M+</div>
                            <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Kayıtlı İşletme</p>
                        </div>
                        <div className="space-y-2">
                            <div className="text-4xl md:text-5xl font-black text-primary tracking-tighter">190+</div>
                            <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Desteklenen Ülke</p>
                        </div>
                        <div className="space-y-2">
                            <div className="text-4xl md:text-5xl font-black text-primary tracking-tighter">10K+</div>
                            <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Aktif Kullanıcı</p>
                        </div>
                        <div className="space-y-2">
                            <div className="text-4xl md:text-5xl font-black text-primary tracking-tighter">%99.9</div>
                            <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Veri Doğruluğu</p>
                        </div>
                    </div>
                </section>

                {/* Pricing Section Mockup */}
                <section id="pricing" className="py-32 px-6">
                    <div className="max-w-3xl mx-auto text-center space-y-12">
                        <div className="space-y-4">
                            <h2 className="text-4xl md:text-6xl font-black tracking-tighter">ESNEK FİYATLANDIRMA</h2>
                            <p className="text-white/50">İstediğiniz kadar kredi yükleyin, sadece kullandığınız kadar ödeyin.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="p-8 rounded-3xl border border-white/5 bg-white/5 space-y-6 text-left relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 bg-primary/20 rounded-bl-2xl text-[10px] font-black uppercase tracking-widest text-primary">En Popüler</div>
                                <div className="space-y-2">
                                    <h4 className="text-xl font-bold">Professional</h4>
                                    <p className="text-3xl font-black text-white">$29<span className="text-sm font-normal text-white/40">/Ay</span></p>
                                </div>
                                <ul className="space-y-4 text-sm text-white/60 font-medium">
                                    <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-primary" /> 5,000 Lead Arama</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-primary" /> Sınırsız Excel Export</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-primary" /> Gelişmiş Harita Analizi</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-primary" /> 7/24 Destek</li>
                                </ul>
                                <button className="w-full bg-primary text-white py-4 rounded-2xl font-bold">Hemen Satın Al</button>
                            </div>

                            <div className="p-8 rounded-3xl border border-white/5 space-y-6 text-left hover:bg-white/5 transition-colors">
                                <div className="space-y-2">
                                    <h4 className="text-xl font-bold">Enterprise</h4>
                                    <p className="text-3xl font-black text-white">Özel</p>
                                </div>
                                <ul className="space-y-4 text-sm text-white/60 font-medium">
                                    <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-white/20" /> Sınırsız Arama</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-white/20" /> API Erişimi</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-white/20" /> Özel Lead Botu</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-white/20" /> Account Manager</li>
                                </ul>
                                <button className="w-full bg-white/10 text-white py-4 rounded-2xl font-bold">Satışla Görüş</button>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="py-20 px-6 border-t border-white/5 bg-black">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-2">
                        <div className="relative w-6 h-6">
                            <Image src="/logo.png" alt="Zakrom Logo" fill className="object-contain" />
                        </div>
                        <span className="font-bold text-lg tracking-tight">ZAKROM PRO</span>
                    </div>
                    <p className="text-xs text-white/30">© 2026 Zakrom Pro. Tüm Hakları Saklıdır.</p>
                    <div className="flex gap-8 text-xs font-bold text-white/40 uppercase tracking-widest">
                        <a href="#" className="hover:text-white transition-colors">Gizlilik</a>
                        <a href="#" className="hover:text-white transition-colors">Şartlar</a>
                        <a href="#" className="hover:text-white transition-colors">İletişim</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
