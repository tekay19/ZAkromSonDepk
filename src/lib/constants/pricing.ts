
export const SUBSCRIPTION_PLANS = [
    {
        id: "FREE",
        name: "Ücretsiz",
        price: 0,
        credits: 50,
        description: "Ürünü keşfedin - ücretsiz başlayın.",
        features: [
            "50 Kredi / Ay",
            "~3 Arama",
            "Temel Sonuçlar",
            "Topluluk Desteği",
        ],
        highlight: false,
    },
    {
        id: "STARTER",
        name: "Starter",
        price: 39,
        credits: 500,
        description: "Girişimciler ve küçük projeler için.",
        features: [
            "500 Kredi / Ay",
            "~33 Arama",
            "Sınırsız CSV / Excel Export",
            "30 Gün Arama Geçmişi",
            "Email Desteği",
        ],
        highlight: false,
    },
    {
        id: "PRO",
        name: "Growth",
        price: 129,
        credits: 2500,
        description: "Büyüyen ekipler ve ajanslar için.",
        features: [
            "2,500 Kredi / Ay",
            "~166 Arama",
            "Sınırsız Export (Tüm Formatlar)",
            "Email Bulma & Doğrulama",
            "Harita Export (PNG/PDF)",
            "Öncelikli Destek",
        ],
        highlight: true,
    },
    {
        id: "BUSINESS",
        name: "Business",
        price: 349,
        credits: 7500,
        description: "Büyük ölçekli veri operasyonları için.",
        features: [
            "7,500 Kredi / Ay",
            "~500 Arama",
            "Sınırsız Export (Tüm Formatlar)",
            "Tam API Erişimi",
            "Özel Hesap Yöneticisi",
            "Toplu İşlem Desteği",
        ],
        highlight: false,
    },
];

export const CREDIT_COSTS = {
    // Arama Maliyetleri
    SEARCH: 15,            // Derin arama başlatma (grid tarama)
    PAGINATION: 1,         // Sonraki sayfa yükleme
    RECURSIVE_SPLIT: 1,    // Akıllı tarama: 60 sonuç limitine takılınca hücreyi bölüp yeniden tarama

    // İletişim Bilgisi
    UNLOCK_CONTACT: 3,     // Email/telefon açma (lead başına)

    // Export Maliyetleri
    EXPORT_ROW: 0,         // CSV/Excel/JSON export (ücretsiz)
    EXPORT_PDF: 5,         // PDF harita export
    EXPORT_PNG: 3,         // PNG harita export
};

// Tier-based overrides for actions where we intentionally want plan-specific pricing.
// Keep `CREDIT_COSTS` as defaults; use these maps in business logic when needed.
export const CREDIT_COSTS_BY_TIER = {
    // "Daha fazla" (Load more) / pagination cost for deep search and standard paging.
    // Free is higher to prevent abuse; paid tiers keep it low for smoother UX.
    PAGE_LOAD: {
        FREE: 2,
        STARTER: 1,
        PRO: 1,
        BUSINESS: 1,
    },
} as const;
