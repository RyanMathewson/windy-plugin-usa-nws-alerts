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
// Dev dependencies: shapefile, adm-zip, topojson-server, topojson-client, topojson-simplify

import { writeFileSync, appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync as writeFS } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { createRequire } from 'module';
import AdmZip from 'adm-zip';
import { open as openShapefile } from 'shapefile';

const require = createRequire(import.meta.url);
const { topology } = require('topojson-server');
const { feature } = require('topojson-client');
const { presimplify, simplify } = require('topojson-simplify');

const HEADERS = { 'User-Agent': 'windy-plugin-usa-nws-alerts/generate-zone-data' };
const COORD_PRECISION = 3;        // decimal places (~111m accuracy, sufficient for zone outlines)
const TOPO_MIN_WEIGHT = 5e-5;     // Visvalingam–Whyatt area threshold (sq degrees), ~equiv to D-P 0.01°
const COUNTY_CONCURRENCY = 10;
const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'zone-geometries.json');
const NULL_GEOMETRY_LOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'null-geometry-zones.txt');
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cache');

const SHAPEFILE_PAGES = {
    forecast: 'https://www.weather.gov/gis/PublicZones',
    fire: 'https://www.weather.gov/gis/FireZones',
};

// --- Caching helpers ---

function ensureCacheDir() {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

async function fetchBufferCached(url, cacheFile) {
    const cachePath = join(CACHE_DIR, cacheFile);
    if (existsSync(cachePath)) {
        console.log(`  Using cached ${cacheFile}`);
        return readFileSync(cachePath);
    }
    const buf = await fetchBuffer(url);
    writeFS(cachePath, buf);
    console.log(`  Cached to ${cacheFile}`);
    return buf;
}

// --- Geometry helpers ---

function quantize(n) {
    const factor = 10 ** COORD_PRECISION;
    return Math.round(n * factor) / factor;
}

// Converts any source geometry to Polygon or MultiPolygon, dropping holes.
function normalizeGeometry(geometry) {
    if (!geometry) return null;
    if (geometry.type === 'Polygon') {
        if (!geometry.coordinates[0]?.length) return null;
        return { type: 'Polygon', coordinates: [geometry.coordinates[0]] };
    }
    if (geometry.type === 'MultiPolygon') {
        const polys = geometry.coordinates.filter(p => p[0]?.length).map(p => [p[0]]);
        return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
    }
    if (geometry.type === 'GeometryCollection') {
        const polys = [];
        for (const member of geometry.geometries ?? []) {
            const norm = normalizeGeometry(member);
            if (!norm) continue;
            if (norm.type === 'Polygon') polys.push(norm.coordinates);
            else polys.push(...norm.coordinates);
        }
        return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
    }
    return null;
}

// Called after topology conversion — quantizes coordinates and validates ring length.
function extractRingsFromGeometry(geometry) {
    if (!geometry) return null;
    const processRing = ring => ring.map(([lng, lat]) => [quantize(lng), quantize(lat)]);
    if (geometry.type === 'Polygon') {
        const outer = geometry.coordinates[0];
        if (!outer?.length) return null;
        const ring = processRing(outer);
        return ring.length >= 4 ? [ring] : null;
    }
    if (geometry.type === 'MultiPolygon') {
        const rings = [];
        for (const polygon of geometry.coordinates) {
            const outer = polygon[0];
            if (outer?.length) {
                const ring = processRing(outer);
                if (ring.length >= 4) rings.push(ring);
            }
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

// Returns Array<{ key, geometry }> with raw (un-simplified) normalized geometries.
async function loadShapefileZip(type, zipUrl) {
    const cacheFile = `${type}.zip`;
    const buf = await fetchBufferCached(zipUrl, cacheFile);
    const zip = new AdmZip(buf);

    const entries = zip.getEntries();
    const shpEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.shp'));
    const dbfEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.dbf'));

    if (!shpEntry) throw new Error(`No .shp file found in ZIP for ${type}`);
    if (!dbfEntry) throw new Error(`No .dbf file found in ZIP for ${type}`);

    const source = await openShapefile(shpEntry.getData(), dbfEntry.getData());

    const features = [];
    let firstProps = null;

    while (true) {
        const { done, value: feat } = await source.read();
        if (done) break;

        if (!firstProps) {
            firstProps = feat.properties;
            console.log(`  DBF fields: ${Object.keys(firstProps).join(', ')}`);
        }

        const props = feat.properties;
        const state = (props.STATE ?? props.STATE_ABBR ?? '').trim();
        const zone = String(props.ZONE ?? props.ZONE_NO ?? '').trim().padStart(3, '0');

        if (!state || !zone || zone === '000') continue;

        const key = `${type}/${state}Z${zone}`;
        const geometry = normalizeGeometry(feat.geometry);
        if (geometry) {
            features.push({ key, geometry });
        } else {
            appendFileSync(NULL_GEOMETRY_LOG, `${key}\tnull geometry\n`);
        }
    }

    console.log(`  ${features.length} zones with geometry`);
    return features;
}

// --- County zones via NWS API ---

async function fetchCountyZone(url) {
    const key = zoneKeyFromUrl(url);
    const cacheFile = `county_${key.replace('/', '_')}.json`;
    const cachePath = join(CACHE_DIR, cacheFile);

    let data;
    if (existsSync(cachePath)) {
        data = JSON.parse(readFileSync(cachePath, 'utf8'));
    } else {
        try {
            const response = await fetch(url, { headers: HEADERS });
            if (!response.ok) return { key, geometry: null, reason: `HTTP ${response.status}` };
            data = await response.json();
            writeFS(cachePath, JSON.stringify(data));
        } catch (e) {
            return { key, geometry: null, reason: e.message };
        }
    }

    const geometry = data.geometry ? normalizeGeometry(data.geometry) : null;
    return { key, geometry, reason: geometry ? null : 'null geometry' };
}

async function loadCountyZones() {
    console.log('\nFetching county zone list...');
    const listCachePath = join(CACHE_DIR, 'county-zone-list.json');
    let data;
    if (existsSync(listCachePath)) {
        console.log('  Using cached county-zone-list.json');
        data = JSON.parse(readFileSync(listCachePath, 'utf8'));
    } else {
        const response = await fetch('https://api.weather.gov/zones?type=county', { headers: HEADERS });
        data = await response.json();
        writeFS(listCachePath, JSON.stringify(data));
        console.log('  Cached to county-zone-list.json');
    }
    const urls = (data.features ?? []).map(f => f.properties?.['@id']).filter(Boolean);
    console.log(`  ${urls.length} county zones found, fetching geometries...`);

    const features = [];
    let done = 0;

    for (let i = 0; i < urls.length; i += COUNTY_CONCURRENCY) {
        const batch = urls.slice(i, i + COUNTY_CONCURRENCY);
        const results = await Promise.all(batch.map(fetchCountyZone));
        for (const item of results) {
            if (item?.key && item.geometry) {
                features.push({ key: item.key, geometry: item.geometry });
            } else if (item?.key && item.reason) {
                appendFileSync(NULL_GEOMETRY_LOG, `${item.key}\t${item.reason}\n`);
            }
        }
        done += batch.length;
        process.stdout.write(`\r  county: ${done}/${urls.length} fetched, ${features.length} with geometry`);
    }

    process.stdout.write('\n');
    console.log(`  ${features.length}/${urls.length} county zones had geometry`);
    return features;
}

// --- Main ---

async function main() {
    ensureCacheDir();
    writeFileSync(NULL_GEOMETRY_LOG, 'zone_key\treason\n');

    // Phase 1: Collect raw features from all sources
    const allFeatures = [];
    for (const [type, pageUrl] of Object.entries(SHAPEFILE_PAGES)) {
        console.log(`\nProcessing ${type} zones (shapefile)...`);
        const zipUrl = await findCurrentZipUrl(pageUrl);
        allFeatures.push(...await loadShapefileZip(type, zipUrl));
    }
    allFeatures.push(...await loadCountyZones());
    console.log(`\nTotal zones with geometry: ${allFeatures.length}`);

    // Phase 2: Build GeoJSON FeatureCollection with zone key as feature id
    const featureCollection = {
        type: 'FeatureCollection',
        features: allFeatures.map(({ key, geometry }) => ({
            type: 'Feature', id: key, geometry, properties: {},
        })),
    };

    // Phase 3: Build topology (shared edges encoded once)
    console.log('\nBuilding topology...');
    const topo = topology({ zones: featureCollection });

    // Phase 4: Compute Visvalingam–Whyatt weights per arc point
    console.log('Simplifying topology...');
    presimplify(topo);

    // Phase 5: Apply threshold
    const simplified = simplify(topo, TOPO_MIN_WEIGHT);

    // Phase 6: Convert back to GeoJSON and extract rings
    console.log('Extracting rings...');
    const fc = feature(simplified, simplified.objects.zones);
    const result = {};
    let nullCount = 0;
    for (const feat of fc.features) {
        const key = feat.id;
        if (!key) continue;
        const rings = extractRingsFromGeometry(feat.geometry);
        if (rings) {
            result[key] = rings;
        } else {
            appendFileSync(NULL_GEOMETRY_LOG, `${key}\tcollapsed after simplification\n`);
            nullCount++;
        }
    }
    if (nullCount > 0) console.log(`  Warning: ${nullCount} zones collapsed after simplification`);

    const total = Object.keys(result).length;
    console.log(`\nTotal zones written: ${total}`);
    const json = JSON.stringify(result);
    writeFileSync(OUT_PATH, json);
    console.log(`Written to data/zone-geometries.json (${(json.length / 1024 / 1024).toFixed(1)} MB raw)`);
    console.log('Null geometry zones logged to data/null-geometry-zones.txt');
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
