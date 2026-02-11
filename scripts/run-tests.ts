
import { execSync } from 'child_process';

console.log('🚀 Running All Tests...\n');

try {
    console.log('👉 Running Unit Tests (Vitest)...');
    execSync('npx vitest run tests/unit/scraper.test.ts', { stdio: 'inherit' });
    console.log('✅ Unit Tests Passed\n');

    console.log('👉 Running Integration Tests (Flow)...');
    // Using tsx to run the typescript file directly
    execSync('npx tsx tests/integration/flow.test.ts', { stdio: 'inherit' });
    console.log('✅ Integration Tests Passed\n');

    console.log('🎉 All Systems Go!');
} catch (error) {
    console.error('❌ Tests Failed!');
    process.exit(1);
}
