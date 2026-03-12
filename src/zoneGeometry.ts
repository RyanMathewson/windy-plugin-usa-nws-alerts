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

// Fine snap matching zone-geometries.json 3dp quantize precision.
const SNAP = 1000; // 0.001° ≈ 111m

function snap(v: number): number { return Math.round(v * SNAP) / SNAP; }

// Removes spike artifacts: sequences A→B→C where the path nearly completely
// reverses at B (the spike tip). Uses the cosine of the angle at B — if the
// two segments are nearly antiparallel (cos < threshold) the tip is removed.
// This catches spikes regardless of how far apart A and C are, which is the
// case when spike arms diverge at an angle (not straight in/out).
const SPIKE_COS_THRESHOLD = -0.9; // angle > ~154° at tip

function removeSpikes(ring: number[][]): number[][] {
    let pts = ring.map(([lng, lat]) => [snap(lng), snap(lat)]);
    let prevLen = -1;
    while (pts.length !== prevLen && pts.length >= 4) {
        prevLen = pts.length;
        const n = pts.length;
        const remove = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            const b = (i + 1) % n;
            const c = (i + 2) % n;
            if (remove[i] || remove[b] || remove[c]) { continue; }
            const [ax, ay] = pts[i];
            const [bx, by] = pts[b];
            const [cx, cy] = pts[c];
            const abx = bx - ax;
            const aby = by - ay;
            const bcx = cx - bx;
            const bcy = cy - by;
            const lenAB = Math.sqrt(abx * abx + aby * aby);
            const lenBC = Math.sqrt(bcx * bcx + bcy * bcy);
            if (lenAB === 0 || lenBC === 0) { continue; }
            const cosAngle = (abx * bcx + aby * bcy) / (lenAB * lenBC);
            if (cosAngle < SPIKE_COS_THRESHOLD) {
                remove[b] = 1;
                // Exact backtrack (A == C): remove the duplicate C too.
                if (pts[i][0] === pts[c][0] && pts[i][1] === pts[c][1]) {
                    remove[c] = 1;
                }
            }
        }
        pts = pts.filter((_, i) => !remove[i]);
    }
    return pts;
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
            .map(polygon => polygon[0])  // outer ring only
            .filter(ring => ring.length >= 4);
    } catch (_e) {
        return rings;
    }
}

/**
 * Builds Leaflet Polyline layers from an array of coordinate rings.
 * Each ring is an array of [lng, lat] pairs (GeoJSON order).
 * Used for pre-bundled zone data from zone-geometries.json and NWS alert geometry.
 */
export function buildPolylineLayersFromRings(rings: number[][][]): L.Polyline[] {
    return rings
        .map(ring => removeSpikes(ring))
        .filter(ring => ring.length >= 4)
        .map(ring => new L.Polyline(ring.map(([lng, lat]) => [lat, lng] as L.LatLngTuple)));
}
