import type { NWSAlert } from '../nws';
import type { ZoneGeometryData } from './alertTypes';

const ACTIVE_ALERTS_URL = 'https://api.weather.gov/alerts/active';
const ZONE_DATA_URL =
    'https://cdn.jsdelivr.net/gh/RyanMathewson/windy-plugin-usa-nws-alerts@main/data/zone-geometries.json';

let zoneData: ZoneGeometryData | null = null;

/** Fetches active NWS alert features from the public weather.gov API. */
export async function fetchActiveAlerts(): Promise<NWSAlert[]> {
    const response = await fetch(ACTIVE_ALERTS_URL);
    const data = await response.json() as { features: NWSAlert[] };
    return data.features;
}

/** Fetches generated zone geometry data once per plugin session. */
export async function getZoneData(): Promise<ZoneGeometryData> {
    if (!zoneData) {
        const response = await fetch(ZONE_DATA_URL);
        zoneData = await response.json() as ZoneGeometryData;
    }
    return zoneData;
}
