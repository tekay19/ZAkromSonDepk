
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mocks
jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
    prisma: {
        place: {
            findMany: jest.fn(),
            upsert: jest.fn(),
        },
        lead: {
            findMany: jest.fn(),
            upsert: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
        },
        creditTransaction: {
            create: jest.fn(),
        },
        searchHistory: {
            create: jest.fn(),
        },
        searchCache: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
        },
        $transaction: jest.fn((callback: any) => callback(prisma)),
    },
}));

jest.mock('@/lib/redis', () => {
    // Simple in-memory Redis mock so deep-search fill logic can persist list caches.
    const store = new Map<string, string>();
    return {
        redis: {
            __store: store,
            get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
            set: jest.fn((key: string, value: string) => {
                store.set(key, value);
                return Promise.resolve('OK');
            }),
            publish: jest.fn(),
        },
    };
});

jest.mock('@/lib/traffic-control', () => ({
    acquireLock: jest.fn(() => Promise.resolve('mock-token')),
    releaseLock: jest.fn(),
    waitForValue: jest.fn(),
}));

jest.mock('@/lib/gateway/google-places', () => ({
    googlePlacesGateway: {
        searchText: jest.fn(),
    },
}));

jest.mock('@/lib/gateway/scraper-gateway', () => ({
    scraperGateway: {
        scanRegion: jest.fn(),
    },
}));

// Imports after mocks
import { searchPlaces } from '../search-places';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { googlePlacesGateway } from '@/lib/gateway/google-places';
import { scraperGateway } from '@/lib/gateway/scraper-gateway';

describe('Hybrid Search Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (auth as any).mockResolvedValue({ user: { id: 'test-user-id' } } as any);
        (prisma.user.findUnique as any).mockResolvedValue({
            id: 'test-user-id',
            credits: 100,
            subscriptionTier: 'PRO',
        });
        (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
        (prisma.place.upsert as any).mockImplementation((args: any) => Promise.resolve({
            id: 'db-place-id',
            googleId: args.create.googleId,
            name: args.create.name,
            emails: [],
            phones: [],
        }));
        (prisma.lead.upsert as any).mockResolvedValue({ emailUnlocked: false });
    });

    it('should trigger scraperGateway when keyword starts with "scrape:"', async () => {
        // Mock City Viewport response
        (googlePlacesGateway.searchText as any).mockResolvedValue({
            places: [{
                name: 'Istanbul',
                types: ['locality'],
                viewport: {
                    northeast: { latitude: 41.1, longitude: 29.1 },
                    southwest: { latitude: 40.9, longitude: 28.9 },
                }
            }]
        });

        // Mock Scraper response
        (scraperGateway.scanRegion as any).mockResolvedValue([
            {
                googleId: 'scrape:123',
                name: 'Scraped Kebab',
                latitude: 41.0,
                longitude: 29.0,
                address: 'Test Address',
                rating: 4.5,
                userRatingsTotal: 100,
                types: ['restaurant'],
                imgUrl: 'http://example.com/img.jpg',
            }
        ]);

        const result = await searchPlaces('Istanbul', 'scrape:Kebab', undefined, true);

        // Verify Scraper was called
        expect(scraperGateway.scanRegion).toHaveBeenCalledWith('Kebab in Istanbul', expect.objectContaining({
            northeast: expect.anything(),
            southwest: expect.anything(),
        }));

        // Verify result structure
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('Scraped Kebab');
        expect(result.data[0].place_id).toBe('scrape:123'); // Or whatever the logic maps it to
    });

    it('should fall back to API if scraper returns nothing', async () => {
        // Mock City Viewport response + one API result (incremental deep fill uses searchText).
        (googlePlacesGateway.searchText as any)
            .mockResolvedValueOnce({
                places: [{
                    name: 'Istanbul',
                    types: ['locality'],
                    viewport: {
                        northeast: { latitude: 41.1, longitude: 29.1 },
                        southwest: { latitude: 40.9, longitude: 28.9 },
                    }
                }]
            })
            .mockResolvedValueOnce({
                places: [
                    {
                        place_id: 'api:123',
                        name: 'API Kebab',
                        formatted_address: 'Some Address',
                        location: { latitude: 41.0, longitude: 29.0 },
                        rating: 4.6,
                        user_ratings_total: 120,
                        types: ['restaurant'],
                    }
                ],
                nextPageToken: null,
            });

        // Mock Scraper empty response
        (scraperGateway.scanRegion as any).mockResolvedValue([]);

        const result = await searchPlaces('Istanbul', 'scrape:Empty', undefined, true);

        expect(scraperGateway.scanRegion).toHaveBeenCalled();
        // Should have used API searchText (incremental deep fill), not scanCity.
        expect(googlePlacesGateway.searchText).toHaveBeenCalled();
        expect(result.data[0].name).toBe('API Kebab');
    });
});
