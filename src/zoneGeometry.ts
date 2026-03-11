import polygonClipping from 'polygon-clipping';

type PolygonGeometry = { type: 'Polygon'; coordinates: number[][][] };
type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: number[][][][] };
type GeometryCollectionGeometry = {
    type: 'GeometryCollection';
    geometries: (PolygonGeometry | MultiPolygonGeometry)[];
};
type SupportedGeometry = PolygonGeometry | MultiPolygonGeometry | GeometryCollectionGeometry;

/** Builds Leaflet Polyline layers from a GeoJSON geometry (Polygon, MultiPolygon, or GeometryCollection). */
export function buildPolylineLayers(geometry: SupportedGeometry): L.Polyline[] {
    if (geometry.type === 'Polygon') {
        return buildPolylineLayersFromRings(geometry.coordinates);
    }
    if (geometry.type === 'MultiPolygon') {
        const rings: number[][][] = [];
        for (const polygon of geometry.coordinates) {
            rings.push(...polygon);
        }
        return buildPolylineLayersFromRings(rings);
    }
    // GeometryCollection: recurse into each member
    const layers: L.Polyline[] = [];
    for (const member of geometry.geometries) {
        layers.push(...buildPolylineLayers(member));
    }
    return layers;
}

// Snap factor applied before union so adjacent zone boundaries align to identical
// coordinates, allowing polygon-clipping to cleanly eliminate shared edges.
const SNAP = 25; // 0.04 degrees ≈ 4.4 km

function snap(v: number): number {
    return Math.round(v * SNAP) / SNAP;
}

// Minimum bounding span for a result ring — rings smaller than this are artifacts.
const MIN_SPAN = 2 / SNAP;

function ringSpan(ring: number[][]): number {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of ring) {
        if (lng < minLng) { minLng = lng; }
        if (lng > maxLng) { maxLng = lng; }
        if (lat < minLat) { minLat = lat; }
        if (lat > maxLat) { maxLat = lat; }
    }
    return Math.max(maxLng - minLng, maxLat - minLat);
}

// Douglas-Peucker simplification applied post-union to remove thin triangular spikes
// left by imperfectly aligned zone boundaries.
function douglasPeucker(points: number[][], tolerance: number): number[][] {
    if (points.length <= 2) { return points; }
    const [x1, y1] = points[0];
    const [x2, y2] = points[points.length - 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let maxDist = 0;
    let maxIdx = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const [px, py] = points[i];
        let dist: number;
        if (lenSq === 0) {
            const ex = px - x1;
            const ey = py - y1;
            dist = Math.sqrt(ex * ex + ey * ey);
        } else {
            const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
            const ex = px - (x1 + t * dx);
            const ey = py - (y1 + t * dy);
            dist = Math.sqrt(ex * ex + ey * ey);
        }
        if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }
    if (maxDist > tolerance) {
        const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
        const right = douglasPeucker(points.slice(maxIdx), tolerance);
        return [...left.slice(0, -1), ...right];
    }
    return [points[0], points[points.length - 1]];
}

/**
 * Merges multiple coordinate rings into a single unified boundary using polygon union.
 * Eliminates shared interior edges between adjacent zones so an alert renders as
 * one outline rather than many individual zone outlines.
 * Falls back to unmerged rings if the union fails.
 */
export function mergeRings(rings: number[][][]): number[][][] {
    if (rings.length <= 1) { return rings; }
    try {
        const snapped = rings.map(ring => ring.map(([lng, lat]) => [snap(lng), snap(lat)]));
        const [first, ...rest] = snapped.map(ring => [ring] as polygonClipping.Polygon);
        const result = polygonClipping.union([first], ...(rest.map(p => [p]) as polygonClipping.MultiPolygon[]));
        return result
            .map(polygon => polygon[0])             // outer ring only — discard holes
            .filter(ring => ring.length >= 4 && ringSpan(ring) >= MIN_SPAN)
            .map(ring => douglasPeucker(ring, 1 / SNAP))  // remove residual spikes
            .filter(ring => ring.length >= 4);
    } catch (_e) {
        return rings;
    }
}

/**
 * Builds Leaflet Polyline layers from an array of coordinate rings.
 * Each ring is an array of [lng, lat] pairs (GeoJSON order).
 * Used for pre-bundled zone data from zone-geometries.json.
 */
export function buildPolylineLayersFromRings(rings: number[][][]): L.Polyline[] {
    return rings.map(ring => new L.Polyline(ring.map(([lng, lat]) => [lat, lng] as L.LatLngTuple)));
}
