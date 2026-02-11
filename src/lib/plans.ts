export type SubscriptionTier = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';

export interface PlanConfig {
    name: string;
    price: string; // Display price (e.g., "0 TL", "299 TL")
    priceId?: string; // Stripe Price ID
    credits: number;
    resultsPerSearch: number;
    maxHistoryDays: number;
    features: {
        analytics: 'basic' | 'full' | 'priority';
        export: ('csv' | 'xlsx' | 'json')[];
        emailEnrichment: boolean;
        visualExport: {
            formats: ('png' | 'pdf')[];
            monthlyLimit: number; // 0 = disabled
        };
        apiAccess: boolean;
        backgroundWorker: boolean; // async jobs (search/export)
        savedSearches: boolean; // search history & cache reuse UX
    };
}

export const PLANS: Record<SubscriptionTier, PlanConfig> = {
    FREE: {
        name: 'Ücretsiz',
        price: '$0',
        credits: 50,
        resultsPerSearch: 20,
        maxHistoryDays: 7,
        features: {
            analytics: 'basic',
            export: [],
            emailEnrichment: false,
            visualExport: { formats: [], monthlyLimit: 0 },
            apiAccess: false,
            backgroundWorker: false,
            savedSearches: true,
        },
    },
    STARTER: {
        name: 'Starter',
        price: '$39',
        priceId: process.env.STRIPE_STARTER_PRICE_ID,
        credits: 500,
        resultsPerSearch: 20,
        maxHistoryDays: 30,
        features: {
            analytics: 'full',
            export: ['csv', 'xlsx', 'json'],
            emailEnrichment: false,
            visualExport: { formats: [], monthlyLimit: 0 },
            apiAccess: false,
            backgroundWorker: true,
            savedSearches: true,
        },
    },
    PRO: {
        name: 'Growth',
        price: '$129',
        priceId: process.env.STRIPE_PRO_PRICE_ID,
        credits: 2500,
        resultsPerSearch: 40,
        maxHistoryDays: 90,
        features: {
            analytics: 'full',
            export: ['csv', 'xlsx', 'json'],
            emailEnrichment: true,
            visualExport: { formats: ['png', 'pdf'], monthlyLimit: 3 },
            apiAccess: false,
            backgroundWorker: true,
            savedSearches: true,
        },
    },
    BUSINESS: {
        name: 'Business',
        price: '$349',
        priceId: process.env.STRIPE_BUSINESS_PRICE_ID,
        credits: 7500,
        resultsPerSearch: 60,
        maxHistoryDays: 365,
        features: {
            analytics: 'priority',
            export: ['csv', 'xlsx', 'json'],
            emailEnrichment: true,
            visualExport: { formats: ['png', 'pdf'], monthlyLimit: 10 },
            apiAccess: true,
            backgroundWorker: true,
            savedSearches: true,
        },
    },
};
