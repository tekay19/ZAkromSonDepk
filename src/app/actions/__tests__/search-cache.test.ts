import { searchPlacesInternal } from '../search-places';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { googlePlacesGateway } from '@/lib/gateway/google-places';

// Mock auth module
jest.mock('@/auth', () => ({
    auth: jest.fn(),
    handlers: { GET: jest.fn(), POST: jest.fn() },
    signIn: jest.fn(),
    signOut: jest.fn(),
}));

jest.mock('@/lib/prisma', () => {
    const mockPrismaClient = {
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
        place: {
            findMany: jest.fn(),
            upsert: jest.fn(),
        },
        lead: {
            findMany: jest.fn(),
            upsert: jest.fn(),
            createMany: jest.fn(),
        },
        searchCache: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
        },
    };
    // Add transaction mock that passes the client back
    (mockPrismaClient as any).$transaction = jest.fn((callback) => callback(mockPrismaClient));

    return { prisma: mockPrismaClient };
});

jest.mock('@/lib/redis', () => ({
    redis: {
        get: jest.fn(),
        set: jest.fn(),
        publish: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
        decr: jest.fn(),
    }
}));

jest.mock('@/lib/traffic-control', () => ({
    acquireLock: jest.fn().mockResolvedValue('mock-token'),
    releaseLock: jest.fn(),
    waitForValue: jest.fn().mockResolvedValue(null),
    withCircuitBreaker: jest.fn((name, config, work) => work()),
    withInflightLimiter: jest.fn((name, max, ttl, work) => work()),
    sleep: jest.fn(),
}));

jest.mock('@/lib/gateway/google-places', () => {
    const mockGateway = {
        searchText: jest.fn(),
        scanCity: jest.fn(),
    };
    return {
        googlePlacesGateway: mockGateway,
        GooglePlacesGateway: {
            getInstance: () => mockGateway
        }
    };
});


describe('Shared Cache Verification', () => {
    const mockUserA = { id: 'user-a', credits: 1000, subscriptionTier: 'PRO' };
    const mockUserB = { id: 'user-b', credits: 1000, subscriptionTier: 'FREE' };
    const city = 'Istanbul';
    const keyword = 'Kebab';

    beforeEach(() => {
        jest.clearAllMocks();
        // Default mocks
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserA);
        (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        (prisma.lead.createMany as jest.Mock).mockResolvedValue({ count: 0 });
        // Mock findMany for hydration
        (prisma.place.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.lead.findMany as jest.Mock).mockResolvedValue([]);
        (googlePlacesGateway.searchText as jest.Mock).mockResolvedValue({
            places: [{ id: 'place-1', displayName: { text: 'Kebab 1' } }],
            nextPageToken: null
        });
        (prisma.place.upsert as jest.Mock).mockImplementation((args) => Promise.resolve({
            id: 'db-place-1',
            googleId: args.create.googleId,
            name: args.create.name
        }));
        (prisma.lead.upsert as jest.Mock).mockResolvedValue({ emailUnlocked: false });
    });

    it('should use the same cache key for different users', async () => {
        // First search by User A
        (redis.get as jest.Mock).mockResolvedValue(null); // Cache miss initially

        await searchPlacesInternal(city, keyword, undefined, undefined, mockUserA.id, false);

        // Verify Redis SET was called with a key that DOES NOT contain userId
        const setCalls = (redis.set as jest.Mock).mock.calls;
        const cacheKeyCall = setCalls.find(call => call[0].startsWith('search:global:'));

        expect(cacheKeyCall).toBeDefined();
        const globalKey = cacheKeyCall[0];
        console.log('Generated Cache Key:', globalKey);

        expect(globalKey).toContain('istanbul');
        expect(globalKey).toContain('kebab');
        expect(globalKey).not.toContain('user-a'); // Crucial check!

        // Second search by User B
        // Simulate cache HIT using the key we just verified
        (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
            places: [{ place_id: 'place-1', name: 'Kebab 1' }],
            nextPageToken: null
        }));

        await searchPlacesInternal(city, keyword, undefined, undefined, mockUserB.id, false);

        // Google API should NOT be called again for User B
        expect(googlePlacesGateway.searchText).toHaveBeenCalledTimes(1);
    });

    it('should hydrate user-specific data (merged with shared cache)', async () => {
        // Setup: Shared cache exists, but DB has user-specific "unlocked" status
        const cachedPlace = {
            place_id: 'place-1',
            name: 'Kebab 1',
            emails: ['secret@kebab.com']
        };

        (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
            places: [cachedPlace],
            nextPageToken: null
        }));

        // Mock DB: Place exists, but Lead (unlock status) exists ONLY for User A
        (prisma.place.findMany as jest.Mock).mockResolvedValue([
            { id: 'db-place-1', googleId: 'place-1', emails: ['secret@kebab.com'], phones: [], socials: {} }
        ]);

        // Scenario 1: User A has unlocked the email
        (prisma.lead.findMany as jest.Mock).mockImplementation((args) => {
            if (args.where.userId === mockUserA.id) {
                return [{ emailUnlocked: true, place: { googleId: 'place-1' } }];
            }
            return []; // User B has NOT unlocked it
        });

        // Act: User A searches
        const resultA = await searchPlacesInternal(city, keyword, undefined, undefined, mockUserA.id, false);
        expect(resultA.places[0].emailUnlocked).toBe(true);
        expect(resultA.places[0].emails).toContain('secret@kebab.com');

        // Act: User B searches (same cache hit)
        const resultB = await searchPlacesInternal(city, keyword, undefined, undefined, mockUserB.id, false);
        expect(resultB.places[0].emailUnlocked).toBe(false); // Should remain locked for B
        expect(resultB.places[0].emails).toHaveLength(0); // Should be hidden/masked
    });
});
