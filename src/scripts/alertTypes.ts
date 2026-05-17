import type { NWSAlert } from '../nws';

/** Supported non-null NWS alert geometry used for rendering and hit testing. */
export type AlertGeometry = NonNullable<NWSAlert['geometry']>;

/** A GeoJSON linear ring in [longitude, latitude] coordinate order. */
export type GeoJsonRing = number[][];

/** A GeoJSON polygon with one outer ring and zero or more hole rings. */
export type GeoJsonPolygon = GeoJsonRing[];

/** Cached zone geometry rings keyed by the NWS zone path segment. */
export type ZoneGeometryData = Record<string, number[][][]>;

/** A map location selected by the user in latitude/longitude order. */
export interface SelectedLocation {
    lat: number;
    lon: number;
}

/** Category filter state for the alert list and map layers. */
export interface AlertFilterState {
    includeStormEvents: boolean;
    includeFloodEvents: boolean;
    includeWindEvents: boolean;
    includeWinterEvents: boolean;
    includeOtherEvents: boolean;
}

/** Alert model prepared for Svelte rendering, Leaflet display, and location hit testing. */
export interface DisplayedAlert {
    id: string;
    severity: string;
    description: string;
    event: string;
    headline: string;
    areaDesc: string;
    effective: Date;
    expires: Date;
    sent: Date;
    ends: Date | null;
    sender: string;
    senderName: string;
    certainty: string;
    urgency: string;
    messageType: string;
    category: string;
    instruction: string | null;
    layers: L.Polyline[];
    polygons: GeoJsonPolygon[];
    bounds: L.LatLngBounds | null;
    isAddedToMap: boolean;
    isHighlighted: boolean;
    severityLevel: number;
}
