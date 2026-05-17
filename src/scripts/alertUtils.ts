import { buildPolylineLayers, buildPolylineLayersFromRings, mergeRings } from '../zoneGeometry';
import type { NWSAlert } from '../nws';
import type { AlertGeometry, DisplayedAlert, GeoJsonPolygon, ZoneGeometryData } from './alertTypes';

/** Returns the Windy pane accent color for an NWS severity label. */
export function colorFromSeverity(severity: string): string {
    const hues: Record<string, number> = {
        Extreme: 300,
        Severe: 0,
        Moderate: 59,
        Minor: 147,
    };
    return `hsl(${hues[severity] ?? 214}, 100%, 50%)`;
}

/** Returns a lower-is-more-important sort level for an NWS severity label. */
export function levelFromSeverity(severity: string): number {
    const levels: Record<string, number> = {
        Extreme: 1,
        Severe: 2,
        Moderate: 3,
        Minor: 4,
    };
    return levels[severity] ?? 5;
}

/** Formats alert timestamps in the user's locale with a short time zone. */
export function formatDate(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
    };
    return new Intl.DateTimeFormat(undefined, options).format(date).replace(',', '');
}

/** Formats map coordinates compactly enough for the alert pane. */
export function formatCoordinate(value: number): string {
    return value.toFixed(3);
}

/** Formats the clicked location as coordinates for immediate display and fallback. */
export function formatSelectedLocationCoords(location: { lat: number; lon: number }): string {
    return `${formatCoordinate(location.lat)}, ${formatCoordinate(location.lon)}`;
}

/** Extracts the NWS zone cache key from an affected-zone URL. */
export function zoneKeyFromUrl(url: string): string {
    const match = url.match(/\/zones\/([^/]+\/[^/]+)$/);
    return match ? match[1] : '';
}

/** Sorts alerts by NWS severity while preserving relative order for equal severities. */
export function sortAlertsBySeverity(alerts: DisplayedAlert[]): DisplayedAlert[] {
    return alerts.sort((a, b) => a.severityLevel - b.severityLevel);
}

/** Converts an actionable NWS feature into the displayed alert model. */
export function displayedAlertFromNwsAlert(
    nwsAlert: NWSAlert,
    zones: ZoneGeometryData,
): DisplayedAlert | null {
    if (nwsAlert.properties.status !== 'Actual') {
        return null;
    }

    const alert = createDisplayedAlert(nwsAlert);
    applyAlertGeometry(alert, nwsAlert, zones);
    alert.bounds = computeBoundsFromLayers(alert.layers);

    return alert.layers.length > 0 && alert.polygons.length > 0 ? alert : null;
}

/** Computes the union LatLngBounds of an alert's polyline layers for viewport intersection. */
function computeBoundsFromLayers(layers: L.Polyline[]): L.LatLngBounds | null {
    if (layers.length === 0) {
        return null;
    }
    const bounds = layers[0].getBounds();
    for (let i = 1; i < layers.length; i++) {
        bounds.extend(layers[i].getBounds());
    }
    return bounds;
}

/** Creates the display model fields that are independent from geometry source. */
function createDisplayedAlert(nwsAlert: NWSAlert): DisplayedAlert {
    return {
        id: nwsAlert.properties['@id'],
        severity: nwsAlert.properties.severity,
        severityLevel: levelFromSeverity(nwsAlert.properties.severity),
        event: nwsAlert.properties.event,
        description: nwsAlert.properties.description,
        areaDesc: nwsAlert.properties.areaDesc,
        headline: nwsAlert.properties.headline,
        effective: new Date(nwsAlert.properties.effective),
        expires: new Date(nwsAlert.properties.expires),
        sent: new Date(nwsAlert.properties.sent),
        ends: nwsAlert.properties.ends ? new Date(nwsAlert.properties.ends) : null,
        sender: nwsAlert.properties.sender,
        senderName: nwsAlert.properties.senderName,
        certainty: nwsAlert.properties.certainty,
        category: nwsAlert.properties.category,
        instruction: nwsAlert.properties.instruction,
        messageType: nwsAlert.properties.messageType,
        urgency: nwsAlert.properties.urgency,
        layers: [],
        polygons: [],
        bounds: null,
        isAddedToMap: false,
        isHighlighted: false,
    };
}

/** Applies direct alert geometry or generated zone geometry to a displayed alert. */
function applyAlertGeometry(alert: DisplayedAlert, nwsAlert: NWSAlert, zones: ZoneGeometryData): void {
    if (nwsAlert.geometry) {
        alert.layers = buildPolylineLayers(nwsAlert.geometry);
        alert.polygons = polygonsFromGeometry(nwsAlert.geometry);
        return;
    }

    const rings = ringsFromAffectedZones(nwsAlert.properties.affectedZones, zones);
    if (rings.length === 0) {
        return;
    }

    const mergedRings = mergeRings(rings);
    alert.layers = buildPolylineLayersFromRings(mergedRings);
    alert.polygons = polygonsFromRings(mergedRings);
}

/** Converts supported NWS GeoJSON geometry into polygon rings for hit testing. */
function polygonsFromGeometry(geometry: AlertGeometry): GeoJsonPolygon[] {
    if (geometry.type === 'Polygon') {
        return [geometry.coordinates];
    }
    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates;
    }
    return geometry.geometries.flatMap(polygonsFromGeometry);
}

/** Treats generated zone rings as independent outer-ring polygons. */
function polygonsFromRings(rings: number[][][]): GeoJsonPolygon[] {
    return rings.map(ring => [ring]);
}

/** Collects cached rings for the affected NWS zones on an alert. */
function ringsFromAffectedZones(zoneUrls: string[], zones: ZoneGeometryData): number[][][] {
    const rings: number[][][] = [];
    for (const zoneUrl of zoneUrls) {
        const zoneRings = zones[zoneKeyFromUrl(zoneUrl)];
        if (zoneRings) {
            rings.push(...zoneRings);
        }
    }
    return rings;
}
