const fs = require('fs');
const path = require('path');

// 1. Read API Key from .env.local
const envPath = path.join(__dirname, '.env.local');
let apiKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/GOOGLE_MAPS_API_KEY=(.*)/);
    if (match && match[1]) {
        apiKey = match[1].trim();
    }
} catch (err) {
    console.error("Error reading .env.local:", err.message);
    process.exit(1);
}

if (!apiKey) {
    console.error("GOOGLE_MAPS_API_KEY not found in .env.local");
    process.exit(1);
}

// 2. Define Search Parameters
const CITY = "Torino, Italy";
const KEYWORD = "Pizza";
const QUERY = `${KEYWORD} in ${CITY}`;

console.log(`\n🔍 Searching for: "${QUERY}"...`);

// 3. Call Google Places API (v1)
async function searchPlaces() {
    const url = "https://places.googleapis.com/v1/places:searchText";
    const fieldMask = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.businessStatus";

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": fieldMask,
            },
            body: JSON.stringify({
                textQuery: QUERY,
                languageCode: "en",
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const places = data.places || [];

        console.log(`✅ Found ${places.length} results.\n`);

        // 4. Print Results to Screen
        places.forEach((place, index) => {
            console.log(`${index + 1}. ${place.displayName?.text}`);
            console.log(`   📍 ${place.formattedAddress}`);
            console.log(`   ⭐ ${place.rating} (${place.userRatingCount} reviews)`);
            console.log(`   📞 ${place.nationalPhoneNumber || "No phone"}`);
            console.log(`   🔗 ${place.websiteUri || "No website"}`);
            console.log(`   🕒 ${place.regularOpeningHours?.openNow ? "Open Now" : "Closed/Unknown"}`);
            console.log("-".repeat(40));
        });

        // 5. Save to CSV
        if (places.length > 0) {
            const headers = ["Name", "Address", "Rating", "Reviews", "Phone", "Website", "Status"];
            const csvRows = places.map(place => {
                return [
                    `"${(place.displayName?.text || "").replace(/"/g, '""')}"`,
                    `"${(place.formattedAddress || "").replace(/"/g, '""')}"`,
                    place.rating || "",
                    place.userRatingCount || "",
                    `"${(place.nationalPhoneNumber || "").replace(/"/g, '""')}"`,
                    place.websiteUri || "",
                    place.businessStatus || ""
                ].join(",");
            });

            const csvContent = [headers.join(","), ...csvRows].join("\n");
            const outputPath = path.join(__dirname, 'torino_pizza_results.csv');

            fs.writeFileSync(outputPath, csvContent);
            console.log(`\n📁 Results saved to: ${outputPath}`);
        }

    } catch (error) {
        console.error("❌ Search failed:", error.message);
    }
}

searchPlaces();
