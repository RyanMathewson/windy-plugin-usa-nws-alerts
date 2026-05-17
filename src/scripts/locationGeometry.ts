import type { DisplayedAlert, GeoJsonPolygon, GeoJsonRing, SelectedLocation } from './alertTypes';

const POINT_ON_SEGMENT_TOLERANCE = 1e-9;

/** Returns true when the selected map position is covered by the alert geometry. */
export function alertContainsLocation(alert: DisplayedAlert, location: SelectedLocation): boolean {
    return alert.polygons.some(polygon => isPointInPolygon(location, polygon));
}

/** Returns true when a point is inside the polygon outer ring and outside holes. */
function isPointInPolygon(location: SelectedLocation, polygon: GeoJsonPolygon): boolean {
    if (polygon.length === 0 || !isPointInRing(location, polygon[0])) {
        return false;
    }
    return polygon.slice(1).every(ring => !isPointInRing(location, ring));
}

/** Returns true when a longitude/latitude point is inside a GeoJSON ring. */
function isPointInRing(location: SelectedLocation, ring: GeoJsonRing): boolean {
    let isInside = false;
    const x = location.lon;
    const y = location.lat;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (isPointOnSegment(location, ring[i], ring[j])) {
            return true;
        }
        if (yi > y === yj > y) {
            continue;
        }

        const intersectionLng = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (x < intersectionLng) {
            isInside = !isInside;
        }
    }

    return isInside;
}

/** Returns true when a point is close enough to a ring segment to count as covered. */
function isPointOnSegment(location: SelectedLocation, start: number[], end: number[]): boolean {
    const [startLng, startLat] = start;
    const [endLng, endLat] = end;
    const crossProduct =
        (location.lat - startLat) * (endLng - startLng) -
        (location.lon - startLng) * (endLat - startLat);

    if (Math.abs(crossProduct) > POINT_ON_SEGMENT_TOLERANCE) {
        return false;
    }

    return isPointWithinSegmentBounds(location, start, end);
}

/** Returns true when a point is within a segment's tolerance-expanded bounds. */
function isPointWithinSegmentBounds(location: SelectedLocation, start: number[], end: number[]): boolean {
    const minLng = Math.min(start[0], end[0]) - POINT_ON_SEGMENT_TOLERANCE;
    const maxLng = Math.max(start[0], end[0]) + POINT_ON_SEGMENT_TOLERANCE;
    const minLat = Math.min(start[1], end[1]) - POINT_ON_SEGMENT_TOLERANCE;
    const maxLat = Math.max(start[1], end[1]) + POINT_ON_SEGMENT_TOLERANCE;

    return location.lon >= minLng && location.lon <= maxLng && location.lat >= minLat && location.lat <= maxLat;
}
