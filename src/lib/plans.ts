export type SubscriptionTier = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';

export interface PlanConfig {
    name: string;
    credits: number;
    resultsPerSearch: number;
    maxHistoryDays: number;
    features: {
        analytics: 'basic' | 'full' | 'priority';
        export: ('csv' | 'xlsx')[];
        backgroundWorker: boolean;
        savedSearches: boolean;
    };
}

export const PLANS: Record<SubscriptionTier, PlanConfig> = {
    FREE: {
        name: 'Ücretsiz',
        credits: 5,
        resultsPerSearch: 10,
        maxHistoryDays: 1, // 24 hours
        features: {
            analytics: 'basic',
            export: [],
            backgroundWorker: false,
            savedSearches: false,
        },
    },
    STARTER: {
        name: 'Başlangıç',
        credits: 500,
        resultsPerSearch: 50,
        maxHistoryDays: 30,
        features: {
            analytics: 'full',
            export: ['csv'],
            backgroundWorker: true,
            savedSearches: true,
        },
    },
    PRO: {
        name: 'Profesyonel',
        credits: 5000,
        resultsPerSearch: 200,
        maxHistoryDays: 90,
        features: {
            analytics: 'full',
            export: ['csv', 'xlsx'],
            backgroundWorker: true,
            savedSearches: true,
        },
    },
    BUSINESS: {
        name: 'İşletme',
        credits: 20000,
        resultsPerSearch: 1000, // Effectively unlimited
        maxHistoryDays: -1, // Unlimited
        features: {
            analytics: 'priority',
            export: ['csv', 'xlsx'],
            backgroundWorker: true,
            savedSearches: true,
        },
    },
};
