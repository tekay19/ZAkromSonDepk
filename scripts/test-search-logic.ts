
const { PrismaClient } = require('@prisma/client');
const { searchPlaces } = require('./src/app/actions/search-places');

// Mock Redis and other deps if needed, but searchPlaces imports them.
// Since we run with ts-node, imports should work if tsconfig is setup.
// Wait, searchPlaces uses "use server" and imports "@/lib/..." aliases.
// Running this standalone might be tricky with aliases without path registration.

// Let's rely on a simpler approach: 
// Create a script that uses relative paths or setup tsconfig-paths.

import { searchPlaces } from "./src/app/actions/search-places";
import { prisma } from "./src/lib/prisma";

async function runTest() {
    try {
        console.log("Fetching admin user...");
        const user = await prisma.user.findFirst({ where: { email: 'admin@zakrom.com' } });

        if (!user) {
            console.error("Admin user not found!");
            return;
        }

        console.log(`User found: ${user.email}, Credits: ${user.credits}`);

        console.log("--- TEST 1: First Page Search ---");
        const result1 = await searchPlaces("Ankara", "Kafe", undefined, undefined, user.id, false);
        console.log(`Results: ${result1.places.length}`);
        console.log(`Next Page Token: ${result1.nextPageToken ? "PRESENT" : "NONE"}`);
        console.log(`Job ID: ${result1.jobId}`);

        const userAfter1 = await prisma.user.findUnique({ where: { id: user.id } });
        console.log(`Credits after Test 1: ${userAfter1?.credits} (Deducted: ${(user.credits || 0) - (userAfter1?.credits || 0)})`);

        if (result1.nextPageToken && result1.nextPageToken !== "plan_limit_reached") {
            console.log("\n--- TEST 2: Second Page Search ---");
            const result2 = await searchPlaces("Ankara", "Kafe", undefined, result1.nextPageToken, user.id, false);
            console.log(`Results: ${result2.places.length}`);

            const userAfter2 = await prisma.user.findUnique({ where: { id: user.id } });
            console.log(`Credits after Test 2: ${userAfter2?.credits} (Deducted: ${(userAfter1?.credits || 0) - (userAfter2?.credits || 0)})`);
        } else {
            console.log("Skipping Page 2 test (no token or limit reached)");
        }

    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

runTest();
