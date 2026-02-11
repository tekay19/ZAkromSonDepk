import { redis } from './src/lib/redis';

async function verifySystem() {
    console.log('🔍 System Verification Starting...');

    try {
        // 1. Check Redis Connection
        const pong = await redis.ping();
        console.log('✅ Redis Connection:', pong === 'PONG' ? 'Active' : 'Failed');

        // 2. Scan for Search Caches
        const cacheKeys = await redis.keys('search:*');
        console.log(`📊 Total Search Cache Keys: ${cacheKeys.length}`);
        if (cacheKeys.length > 0) {
            console.log('   Example Key:', cacheKeys[0]);
        }

        // 3. Scan for Job Statuses
        const jobStatusKeys = await redis.keys('job:*:status');
        console.log(`🤖 Total Background Jobs Tracked: ${jobStatusKeys.length}`);

        const statuses: Record<string, number> = {};
        for (const key of jobStatusKeys) {
            const status = await redis.get(key);
            if (status) {
                statuses[status] = (statuses[status] || 0) + 1;
            }
        }
        console.log('   Job Status Breakdown:', statuses);

        // 4. Scan for Rate Limits
        const rlKeys = await redis.keys('rl:*');
        console.log(`🛡️  Active Rate Limit Windows: ${rlKeys.length}`);

    } catch (error) {
        console.error('❌ Verification Error:', error);
    } finally {
        process.exit(0);
    }
}

verifySystem();
