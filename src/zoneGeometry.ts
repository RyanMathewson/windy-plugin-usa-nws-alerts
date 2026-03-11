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

/**
 * Merges multiple coordinate rings into a single unified boundary using polygon union.
 * Eliminates shared interior edges between adjacent zones so an alert renders as
 * one outline rather than many individual zone outlines.
 * Falls back to unmerged rings if the union fails.
 */
export function mergeRings(rings: number[][][]): number[][][] {
    if (rings.length <= 1) { return rings; }
    try {
        const [first, ...rest] = rings.map(ring => [ring] as polygonClipping.Polygon);
        const result = polygonClipping.union([first], ...(rest.map(p => [p]) as polygonClipping.MultiPolygon[]));
        return result.flatMap(polygon => polygon);
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
