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
 * Builds Leaflet Polyline layers from an array of coordinate rings.
 * Each ring is an array of [lng, lat] pairs (GeoJSON order).
 * Used for pre-bundled zone data from zone-geometries.json.
 */
export function buildPolylineLayersFromRings(rings: number[][][]): L.Polyline[] {
    return rings.map(ring => new L.Polyline(ring.map(([lng, lat]) => [lat, lng] as L.LatLngTuple)));
}
