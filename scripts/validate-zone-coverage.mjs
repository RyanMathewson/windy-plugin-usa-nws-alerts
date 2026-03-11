#!/usr/bin/env node
// Validates which NWS zone types appear in live alert data and whether the
// zone API returns usable geometry for each type.
//
// Usage: node scripts/validate-zone-coverage.mjs

const ALERTS_URL = 'https://api.weather.gov/alerts/active';
const HEADERS = { 'User-Agent': 'windy-plugin-usa-nws-alerts/validate-zone-coverage' };
const SAMPLES_PER_TYPE = 5;

async function fetchJSON(url) {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
}

async function sampleZone(url) {
    try {
        const data = await fetchJSON(url);
        if (!data.geometry) return 'null-geometry';
        return `${data.geometry.type}`;
    } catch (e) {
        return `error:${e.message}`;
    }
}

function extractZoneType(url) {
    // e.g. https://api.weather.gov/zones/forecast/OHZ055 → "forecast"
    const match = url.match(/\/zones\/([^/]+)\//);
    return match ? match[1] : 'unknown';
}

async function main() {
    console.log('Fetching active alerts...');
    const data = await fetchJSON(ALERTS_URL);
    const alerts = data.features ?? [];

    console.log(`\nTotal alerts: ${alerts.length}`);

    let directGeometryCount = 0;
    let zoneOnlyCount = 0;
    let noGeometryNoZones = 0;

    // Collect zone URLs grouped by type
    const zonesByType = new Map(); // type → Set of URLs

    for (const alert of alerts) {
        if (alert.geometry) {
            directGeometryCount++;
        } else if (alert.properties?.affectedZones?.length) {
            zoneOnlyCount++;
            for (const url of alert.properties.affectedZones) {
                const type = extractZoneType(url);
                if (!zonesByType.has(type)) zonesByType.set(type, new Set());
                zonesByType.get(type).add(url);
            }
        } else {
            noGeometryNoZones++;
        }
    }

    console.log(`  Direct geometry: ${directGeometryCount}`);
    console.log(`  Zone-only (no direct geometry): ${zoneOnlyCount}`);
    console.log(`  No geometry, no zones: ${noGeometryNoZones}`);
    console.log(`\nZone types found: ${[...zonesByType.keys()].join(', ') || 'none'}`);

    if (zonesByType.size === 0) {
        console.log('\nNo zone URLs to sample.');
        return;
    }

    console.log('\nSampling zone API responses...\n');

    for (const [type, urls] of zonesByType) {
        const sample = [...urls].slice(0, SAMPLES_PER_TYPE);
        console.log(`Zone type "${type}" (${urls.size} unique URLs, sampling ${sample.length}):`);

        const results = await Promise.all(sample.map(url => sampleZone(url)));
        const tally = {};
        for (const r of results) {
            tally[r] = (tally[r] ?? 0) + 1;
        }

        for (const [result, count] of Object.entries(tally)) {
            console.log(`  ${result}: ${count}`);
        }

        // Print sample URLs for reference
        for (let i = 0; i < sample.length; i++) {
            console.log(`  [${i + 1}] ${sample[i]} → ${results[i]}`);
        }
        console.log();
    }
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
