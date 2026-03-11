#!/usr/bin/env node
// Generates data/zone-geometries.json from NWS zone data.
//
// Sources:
//   - Forecast zones: NWS shapefile ZIP (0 individual API calls)
//   - Fire zones:     NWS shapefile ZIP (0 individual API calls)
//   - County zones:   NWS /zones API, individual fetches (~3,269 calls)
//
// Usage: node scripts/generate-zone-data.mjs
//
// Dev dependencies: shapefile, adm-zip (not bundled into plugin)

import { writeFileSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import AdmZip from 'adm-zip';
import { open as openShapefile } from 'shapefile';

const HEADERS = { 'User-Agent': 'windy-plugin-usa-nws-alerts/generate-zone-data' };
const COORD_PRECISION = 3;        // decimal places (~111m accuracy, sufficient for zone outlines)
const SIMPLIFY_TOLERANCE = 0.01;  // degrees (~1km); eliminates redundant intermediate points
const COUNTY_CONCURRENCY = 10;
const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'zone-geometries.json');
const NULL_GEOMETRY_LOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'null-geometry-zones.txt');

const SHAPEFILE_PAGES = {
    forecast: 'https://www.weather.gov/gis/PublicZones',
    fire: 'https://www.weather.gov/gis/FireZones',
};

// --- Geometry helpers ---

function quantize(n) {
    const factor = 10 ** COORD_PRECISION;
    return Math.round(n * factor) / factor;
}

// Douglas-Peucker line simplification.
// Points are [lng, lat] pairs. Tolerance is in degrees.
function douglasPeucker(points, tolerance) {
    if (points.length <= 2) return points;

    const [x1, y1] = points[0];
    const [x2, y2] = points[points.length - 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    let maxDist = 0;
    let maxIdx = 0;

    for (let i = 1; i < points.length - 1; i++) {
        const [px, py] = points[i];
        let dist;
        if (lenSq === 0) {
            const ex = px - x1, ey = py - y1;
            dist = Math.sqrt(ex * ex + ey * ey);
        } else {
            const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
            const ex = px - (x1 + t * dx);
            const ey = py - (y1 + t * dy);
            dist = Math.sqrt(ex * ex + ey * ey);
        }
        if (dist > maxDist) {
            maxDist = dist;
            maxIdx = i;
        }
    }

    if (maxDist > tolerance) {
        const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
        const right = douglasPeucker(points.slice(maxIdx), tolerance);
        return [...left.slice(0, -1), ...right];
    }

    return [points[0], points[points.length - 1]];
}

function simplifyRing(ring) {
    const simplified = douglasPeucker(ring, SIMPLIFY_TOLERANCE);
    // Rings must have at least 4 points (3 + closing point) to form a polygon
    return simplified.length >= 4 ? simplified : null;
}

// Returns only the outer ring of each polygon as [lng, lat] pairs (holes dropped).
function extractRings(geometry) {
    if (!geometry) return null;

    const processRing = ring =>
        simplifyRing(ring.map(([lng, lat]) => [quantize(lng), quantize(lat)]));

    if (geometry.type === 'Polygon') {
        const outer = geometry.coordinates[0];
        if (!outer?.length) return null;
        const ring = processRing(outer);
        return ring ? [ring] : null;
    }
    if (geometry.type === 'MultiPolygon') {
        const rings = [];
        for (const polygon of geometry.coordinates) {
            const outer = polygon[0];
            if (outer?.length) {
                const ring = processRing(outer);
                if (ring) rings.push(ring);
            }
        }
        return rings.length ? rings : null;
    }
    if (geometry.type === 'GeometryCollection') {
        const rings = [];
        for (const member of geometry.geometries ?? []) {
            const memberRings = extractRings(member);
            if (memberRings) rings.push(...memberRings);
        }
        return rings.length ? rings : null;
    }
    return null;
}

// --- Network helpers ---

async function fetchBuffer(url) {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return Buffer.from(await response.arrayBuffer());
}

function zoneKeyFromUrl(url) {
    const match = url.match(/\/zones\/([^/]+\/[^/]+)$/);
    return match ? match[1] : null;
}

// Find the most recently uploaded ZIP on an NWS GIS page.
async function findCurrentZipUrl(pageUrl) {
    const response = await fetch(pageUrl, { headers: HEADERS });
    const html = await response.text();

    const zipUrls = [...html.matchAll(/href=['"]([^'"]*\.zip)['"]/gi)]
        .map(m => m[1])
        .filter(u => u.includes('/Shapefiles/'))
        .map(u => `https://www.weather.gov${u}`);

    if (zipUrls.length === 0) throw new Error(`No shapefile ZIP links found on ${pageUrl}`);

    const withDates = await Promise.all(
        zipUrls.map(async url => {
            const res = await fetch(url, { method: 'HEAD', headers: HEADERS });
            const lastMod = res.headers.get('last-modified');
            return { url, time: lastMod ? new Date(lastMod).getTime() : 0 };
        }),
    );

    withDates.sort((a, b) => b.time - a.time);
    return withDates[0].url;
}

// --- Shapefile processing ---

async function loadShapefileZip(type, zipUrl) {
    console.log(`  Downloading ${zipUrl}`);
    const buf = await fetchBuffer(zipUrl);
    const zip = new AdmZip(buf);

    const entries = zip.getEntries();
    const shpEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.shp'));
    const dbfEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.dbf'));

    if (!shpEntry) throw new Error(`No .shp file found in ZIP for ${type}`);
    if (!dbfEntry) throw new Error(`No .dbf file found in ZIP for ${type}`);

    const source = await openShapefile(shpEntry.getData(), dbfEntry.getData());

    const result = {};
    let count = 0;
    let firstProps = null;

    while (true) {
        const { done, value: feature } = await source.read();
        if (done) break;

        if (!firstProps) {
            firstProps = feature.properties;
            console.log(`  DBF fields: ${Object.keys(firstProps).join(', ')}`);
        }

        const props = feature.properties;
        const state = (props.STATE ?? props.STATE_ABBR ?? '').trim();
        const zone = String(props.ZONE ?? props.ZONE_NO ?? '').trim().padStart(3, '0');

        if (!state || !zone || zone === '000') continue;

        const key = `${type}/${state}Z${zone}`;
        const rings = extractRings(feature.geometry);
        if (rings) {
            result[key] = rings;
            count++;
        }
    }

    console.log(`  ${count} zones with geometry`);
    return result;
}

// --- County zones via NWS API ---

async function fetchCountyZone(url) {
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) return { key: zoneKeyFromUrl(url), rings: null, reason: `HTTP ${response.status}` };
        const data = await response.json();
        const rings = data.geometry ? extractRings(data.geometry) : null;
        return { key: zoneKeyFromUrl(url), rings, reason: rings ? null : 'null geometry' };
    } catch (e) {
        return { key: zoneKeyFromUrl(url), rings: null, reason: e.message };
    }
}

async function loadCountyZones() {
    console.log('\nFetching county zone list from NWS API...');
    const response = await fetch('https://api.weather.gov/zones?type=county', { headers: HEADERS });
    const data = await response.json();
    const urls = (data.features ?? []).map(f => f.properties?.['@id']).filter(Boolean);
    console.log(`  ${urls.length} county zones found, fetching geometries...`);

    const result = {};
    let done = 0;

    for (let i = 0; i < urls.length; i += COUNTY_CONCURRENCY) {
        const batch = urls.slice(i, i + COUNTY_CONCURRENCY);
        const results = await Promise.all(batch.map(fetchCountyZone));
        for (const item of results) {
            if (item?.key && item.rings) {
                result[item.key] = item.rings;
            } else if (item?.key && item.reason) {
                appendFileSync(NULL_GEOMETRY_LOG, `${item.key}\t${item.reason}\n`);
            }
        }
        done += batch.length;
        process.stdout.write(`\r  county: ${done}/${urls.length} fetched, ${Object.keys(result).length} with geometry`);
    }

    process.stdout.write('\n');
    console.log(`  ${Object.keys(result).length}/${urls.length} county zones had geometry`);
    return result;
}

// --- Main ---

async function main() {
    const result = {};
    writeFileSync(NULL_GEOMETRY_LOG, 'zone_key\treason\n');

    for (const [type, pageUrl] of Object.entries(SHAPEFILE_PAGES)) {
        console.log(`\nProcessing ${type} zones (shapefile)...`);
        const zipUrl = await findCurrentZipUrl(pageUrl);
        const zones = await loadShapefileZip(type, zipUrl);
        Object.assign(result, zones);
    }

    const countyZones = await loadCountyZones();
    Object.assign(result, countyZones);

    const total = Object.keys(result).length;
    console.log(`\nTotal zones: ${total}`);

    const json = JSON.stringify(result);
    writeFileSync(OUT_PATH, json);

    const rawMB = (json.length / 1024 / 1024).toFixed(1);
    console.log(`Written to data/zone-geometries.json (${rawMB} MB raw)`);
    console.log('Null geometry zones logged to data/null-geometry-zones.txt');
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
