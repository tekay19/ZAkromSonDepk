import { PlaceResult } from "@/lib/types";

export interface StrategyReport {
    opportunityScore: {
        score: number; // 0-100
        level: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
        breakdown: {
            demandScore: number;
            competitionScore: number;
            digitalGapScore: number;
        };
    };
    saturation: {
        score: number;
        level: "LOW" | "MODERATE" | "HIGH";
        description: string;
    };
    digitalMaturity: {
        score: number;
        websitePercentage: number;
        socialPercentage: number;
        level: "UNDERSERVED" | "GROWING" | "ESTABLISHED";
    };
    swot: {
        strengths: string[];
        weaknesses: string[];
        opportunities: string[];
        threats: string[];
    };
    actionPlan: {
        title: string;
        steps: string[];
        priority: "HIGH" | "MEDIUM" | "LOW";
    }[];
}

export function generateMarketStrategy(results: PlaceResult[]): StrategyReport {
    if (!results || results.length === 0) {
        return {
            opportunityScore: { score: 0, level: "LOW", breakdown: { demandScore: 0, competitionScore: 0, digitalGapScore: 0 } },
            saturation: { score: 0, level: "LOW", description: "Veri yok" },
            digitalMaturity: { score: 0, websitePercentage: 0, socialPercentage: 0, level: "UNDERSERVED" },
            swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
            actionPlan: []
        };
    }

    // 1. Calculate Core Metrics
    const total = results.length;
    const withWebsite = results.filter(p => p.website).length;
    const withSocials = results.filter(p => p.socials && Object.keys(p.socials).length > 0).length;

    // Rating Analysis
    const validRatings = results.filter(p => p.rating && p.rating > 0);
    const avgRating = validRatings.reduce((acc, curr) => acc + (curr.rating || 0), 0) / (validRatings.length || 1);
    const lowRated = results.filter(p => (p.rating || 0) < 3.8).length;
    const highRated = results.filter(p => (p.rating || 0) > 4.5).length;

    // Review Volume (Demand Indicator)
    const totalReviews = results.reduce((acc, curr) => acc + (curr.user_ratings_total || 0), 0);
    const avgReviews = totalReviews / total;
    const establishedPlayers = results.filter(p => (p.user_ratings_total || 0) > 100).length;

    // 2. Scientific Scoring Algorithms

    // A. Demand Score (0-100): Based on review volume and density
    // Higher reviews = Higher demand
    const demandScore = Math.min(100, (avgReviews / 50) * 100 * 0.7 + (total / 20) * 30);

    // B. Competition Score (0-100): Higher score = ToUGHER competition
    // High rating + high count + many established players
    const competitionScore = Math.min(100,
        (avgRating / 5) * 40 +
        (establishedPlayers / total) * 40 +
        (Math.min(total, 50) / 50) * 20
    );

    // C. Digital Gap Score (0-100): Higher score = BIGGER gap (More opportunity)
    // Low website % + Low social %
    const digitalGapScore = (1 - (withWebsite / total)) * 50 + (1 - (withSocials / total)) * 50;

    // D. Final Opportunity Score
    // Formula: Demand (40%) + Digital Gap (40%) - Competition (20%)
    let rawOpScore = (demandScore * 0.4) + (digitalGapScore * 0.4) + ((100 - competitionScore) * 0.2);
    const opportunityScore = Math.round(Math.max(0, Math.min(100, rawOpScore)));

    let opLevel: StrategyReport["opportunityScore"]["level"] = "MODERATE";
    if (opportunityScore > 80) opLevel = "VERY_HIGH";
    else if (opportunityScore > 60) opLevel = "HIGH";
    else if (opportunityScore < 40) opLevel = "LOW";

    // 3. Other Indices
    // Saturation: Mostly competition score
    let saturationLevel: "LOW" | "MODERATE" | "HIGH" = "MODERATE";
    if (competitionScore < 40) saturationLevel = "LOW";
    else if (competitionScore > 75) saturationLevel = "HIGH";

    // Digital Maturity
    const digitalScore = 100 - digitalGapScore;
    let maturityLevel: "UNDERSERVED" | "GROWING" | "ESTABLISHED" = "GROWING";
    if (digitalScore < 30) maturityLevel = "UNDERSERVED";
    else if (digitalScore > 70) maturityLevel = "ESTABLISHED";

    // 4. SWOT Analysis
    const strengths = [];
    const weaknesses = [];
    const opportunities = [];
    const threats = [];

    // Strengths
    if (avgRating > 4.2) strengths.push(`Bölgedeki işletmelerin ortalama puanı çok yüksek (${avgRating.toFixed(1)}). Müşteri memnuniyeti oturmuş.`);
    if (demandScore > 70) strengths.push("Pazarda yüksek talep ve yorum hacmi var. Müşteriler aktif.");
    if (establishedPlayers > total * 0.5) strengths.push("Pazar kurumsal ve oturmuş işletmelerden oluşuyor.");

    // Weaknesses
    if (digitalGapScore > 60) weaknesses.push("Bölgedeki işletmelerin dijital varlıkları (Web/Sosyal) çok zayıf.");
    if (lowRated > total * 0.3) weaknesses.push(`İşletmelerin %${Math.round((lowRated / total) * 100)}'ü düşük puanlı (<3.8). Hizmet kalitesi sorunu var.`);
    if (avgReviews < 10) weaknesses.push("İşletmeler yeterince geri bildirim alamıyor veya müşteri etkileşimi düşük.");

    // Opportunities (ACTIONABLE)
    if (digitalGapScore > 50) opportunities.push("Web Tasarım & SEO: İşletmelerin yarısından çoğunun web sitesi yok/yetersiz.");
    if (lowRated > 0 && demandScore > 40) opportunities.push("İtibar Yönetimi: Düşük puanlı ancak talep gören işletmeler için puan düzeltme hizmeti.");
    if (competitionScore < 40 && demandScore > 50) opportunities.push("Yeni Girişim: Rekabet düşük ama talep var. Yeni bir marka için ideal ortam.");
    if (withSocials < total * 0.3) opportunities.push("SMM Ajansı: Sosyal medya yönetimi için bakir bir pazar.");

    // Threats
    if (competitionScore > 85) threats.push("Kırmızı Okyanus: Rekabet çok yüksek ve agresif.");
    if (demandScore < 20) threats.push("Ölü Pazar: Bölgedeki talep çok düşük, yatırım riski yüksek.");
    const dominants = results.filter(p => (p.user_ratings_total || 0) > 1000).length;
    if (dominants > 0) threats.push(`${dominants} adet pazar lideri (1000+ yorum) var. Pazar payı almak zor olabilir.`);

    // 5. Action Plan & Market Persona
    const actionPlan: StrategyReport["actionPlan"] = [];

    // Determine Market Persona
    let marketPersona = "Dengeli Pazar";
    if (competitionScore > 80 && demandScore > 80) marketPersona = "Savaş Alanı (Yüksek Rekabet/Talep)";
    else if (competitionScore < 30 && demandScore > 60) marketPersona = "Gizli Cevher (Düşük Rekabet/Yüksek Talep)";
    else if (demandScore < 30) marketPersona = "Durgun Pazar";
    else if (digitalGapScore > 70) marketPersona = "Dijital Çöl (İnternet Varlığı Yok)";

    // Plan A: Digital Transformation (If gap is high)
    if (digitalGapScore > 50) {
        actionPlan.push({
            title: "Dijital Dönüşüm Paketi",
            priority: "HIGH",
            steps: [
                `Web sitesi olmayan ${total - withWebsite} işletmeyi hedefle.`,
                "Google Harita optimizasyonu (SEO) teklifi hazırla.",
                "Basit bir 'Öncesi/Sonrası' raporu ile git."
            ]
        });
    }

    // Plan B: Reputation Rescue (If ratings explain opportunity)
    if (lowRated > 0 && (demandScore > 40 || avgReviews > 20)) {
        actionPlan.push({
            title: "İtibar Kurtarma Operasyonu",
            priority: "HIGH",
            steps: [
                `${lowRated} adet düşük puanlı (<3.8) ancak aktif işletme tespit edildi.`,
                "Negatif yorumları silme/yönetme danışmanlığı ver.",
                "Otomatik yorum toplama sistemi (QR Menü) sat."
            ]
        });
    }

    // Plan C: Blue Ocean Strategy (If new market)
    if (competitionScore < 30 && demandScore > 30) {
        actionPlan.push({
            title: "Erken Pazar Hakimiyeti",
            priority: "MEDIUM",
            steps: [
                "Henüz rekabet oluşmamışken bölgedeki en güçlü marka ol.",
                "Agresif reklamlarla pazar payını kapat.",
                "İşletmeleri sisteme ilk dahil eden ol."
            ]
        });
    }

    // Fallback Plan
    if (actionPlan.length === 0) {
        actionPlan.push({
            title: "Pazar Takibi ve Niş Analizi",
            priority: "LOW",
            steps: [
                "Pazar şu an dengeli, büyük fırsat görünmüyor.",
                "Haftalık olarak değişimleri izle.",
                "Spesifik bir alt kategoriye (örn: sadece vegan kafeler) odaklanmayı dene."
            ]
        });
    }

    return {
        opportunityScore: {
            score: opportunityScore,
            level: opLevel,
            breakdown: {
                demandScore: Math.round(demandScore),
                competitionScore: Math.round(competitionScore),
                digitalGapScore: Math.round(digitalGapScore)
            }
        },
        saturation: {
            score: Math.round(competitionScore),
            level: saturationLevel,
            description: marketPersona
        },
        digitalMaturity: {
            score: Math.round(digitalScore),
            websitePercentage: Math.round((withWebsite / total) * 100),
            socialPercentage: Math.round((withSocials / total) * 100),
            level: maturityLevel
        },
        swot: { strengths, weaknesses, opportunities, threats },
        actionPlan
    };
}
