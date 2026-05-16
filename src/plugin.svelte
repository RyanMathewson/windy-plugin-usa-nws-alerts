<section class:mobile-alert-ui={isMobileOrTablet} class:plugin__content={!isMobileOrTablet}>
    {#if !isMobileOrTablet}
        <div
            class="plugin__title plugin__title--chevron-back"
            on:click={() => bcast.emit('rqstOpen', 'menu')}
        >
            {title}
        </div>
    {/if}

    <div class="menu-top rounded-box rounded-box--with-border mm-section mb-10">
        <div class="mb-10 refresh-row">
            <div
                class="button button--variant-orange size-s"
                on:click={() => loadAlerts()}
            >
                Refresh
            </div>
            <div class="size-s">
                Last Refresh: {timeAgo}
            </div>
        </div>
        <div class="filter-list">
            <div
                class="noWrap checkbox {includeStormEvents ? '' : 'checkbox--off'}"
                on:click={() => {
                    includeStormEvents = !includeStormEvents;
                    filtersChanged();
                }}
            >
                Storms & Tornados
            </div>
            <div
                class="noWrap checkbox {includeWindEvents ? '' : 'checkbox--off'}"
                on:click={() => {
                    includeWindEvents = !includeWindEvents;
                    filtersChanged();
                }}
            >
                Wind & Dust
            </div>
            <div
                class="noWrap checkbox {includeFloodEvents ? '' : 'checkbox--off'}"
                on:click={() => {
                    includeFloodEvents = !includeFloodEvents;
                    filtersChanged();
                }}
            >
                Floods
            </div>
            <div
                class="noWrap checkbox {includeWinterEvents ? '' : 'checkbox--off'}"
                on:click={() => {
                    includeWinterEvents = !includeWinterEvents;
                    filtersChanged();
                }}
            >
                Winter & Snow
            </div>
            <div
                class="noWrap checkbox {includeOtherEvents ? '' : 'checkbox--off'}"
                on:click={() => {
                    includeOtherEvents = !includeOtherEvents;
                    filtersChanged();
                }}
            >
                Other
            </div>
        </div>
    </div>

    {#if selectedAlert}
        <div class="detail-view size-s">
            <div
                class="all-alerts-back plugin__title--chevron-back clickable"
                on:click={() => {
                    selectedAlert = null;
                }}
            >
                All Alerts
            </div>
            <div
                class="alert detail-alert"
                style:border-left-color={colorFromSeverity(selectedAlert.severity)}
            >
                <div class="size-l mb-5">
                    {selectedAlert.event}
                </div>
                <div class="mb-10">
                    {selectedAlert.headline}
                </div>
                <div class="metadata-grid mb-10">
                    <div>Severity: {selectedAlert.severity}</div>
                    <div>Certainty: {selectedAlert.certainty}</div>
                    <div>Urgency: {selectedAlert.urgency}</div>
                    <div>Sent: {formatDate(selectedAlert.sent)}</div>
                </div>
                <div class="mb-5">
                    Area: {selectedAlert.areaDesc}
                </div>
                <div class="mb-10">
                    Time: {formatDate(selectedAlert.effective)} - {formatDate(selectedAlert.expires)}
                </div>
                <div class="mb-10">
                    Sender: {selectedAlert.senderName} ({selectedAlert.sender})
                </div>
                <div class="message-block mb-10">
                    <div class="message-label">Description</div>
                    <div>{selectedAlert.description}</div>
                </div>
                <div class="message-block">
                    <div class="message-label">Instruction</div>
                    <div>{selectedAlert.instruction ?? 'None'}</div>
                </div>
            </div>
        </div>
    {:else}
        <div class="location-status size-s mb-10">
            {#if selectedLocation}
                Alerts for {selectedLocationLabel}
            {:else}
                Click a position on the map to show active alerts for that location.
            {/if}
        </div>

        {#if selectedLocation && displayedAlerts.length === 0}
            <div class="empty-state size-s">
                No active alerts for this location.
            </div>
        {/if}

        {#each displayedAlerts as alert (alert.id)}
            <div
                class="alert alert-row mb-10 size-xs clickable"
                class:highlightedAlert={alert.isHighlighted}
                style:border-left-color={colorFromSeverity(alert.severity)}
                on:click={() => {
                    selectedAlert = alert;
                }}
                on:mouseenter={() => highlightAlert(alert)}
                on:mouseleave={() => unHighlightAlert(alert)}
            >
                <div class="size-l">
                    {alert.event}
                </div>
                <div class="size-s">
                    Expires: {formatDate(alert.expires)}
                </div>
            </div>
        {/each}
    {/if}
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { isMobileOrTablet } from '@windy/rootScope';
    import { onMount, onDestroy } from 'svelte';
    import { formatDistanceToNow } from 'date-fns';
    import { singleclick } from '@windy/singleclick';
    import { get as getReverseName } from '@windy/reverseName';
    import config from './pluginConfig';

    import { buildPolylineLayers, buildPolylineLayersFromRings, mergeRings } from './zoneGeometry';
    // IMPORTANT: all types must be imported as `type` otherwise
    // Svelte TS compiler will fail
    import type { NWSAlert } from './nws';

    const { name, title } = config;

    const POINT_ON_SEGMENT_TOLERANCE = 1e-9;
    const REVERSE_NAME_ZOOMS = [13, 11, 9, 7];

    type AlertGeometry = NonNullable<NWSAlert['geometry']>;
    type GeoJsonRing = number[][];
    type GeoJsonPolygon = GeoJsonRing[];

    interface ReverseNameResult {
        name?: string;
        nameValid?: boolean;
    }

    interface SelectedLocation {
        lat: number;
        lon: number;
    }

    interface DisplayedAlert {
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
        isAddedToMap: boolean;
        isHighlighted: boolean;
        severityLevel: number;
    }

    let allAlerts: DisplayedAlert[] = [];
    let filteredAlerts: DisplayedAlert[] = [];
    let displayedAlerts: DisplayedAlert[] = [];
    let selectedAlert: DisplayedAlert | null = null;
    let selectedLocation: SelectedLocation | null = null;
    let selectedLocationLabel = 'selected location';
    let selectedLocationMarker: L.Marker | null = null;
    let locationNameRequestId = 0;
    let lastRefresh: Date | null = null;
    let timeAgo: string = 'Loading...'; // Placeholder text

    // Alert filters (https://www.weather.gov/nwr/eventcodes)
    let includeStormEvents = true;
    const stormAlertEvents = [
        'Severe Thunderstorm Watch',
        'Severe Thunderstorm Warning',
        'Severe Weather Statement',
        'Special Weather Statement',
        'Tornado Watch',
        'Tornado Warning',
        'Tropical Storm Watch',
        'Tropical Storm Warning',
        'Hurricane Watch',
        'Hurricane Warning',
        'Hurricane Statement',
    ];

    let includeFloodEvents = true;
    const floodAlertEvents = [
        'Coastal Flood Watch',
        'Coastal Flood Warning',
        'Flash Flood Watch',
        'Flash Flood Warning',
        'Flash Flood Statement',
        'Flood Watch',
        'Flood Warning',
        'Flood Statement',
        'Storm Surge Watch',
        'Storm Surge Warning',
        'Tsunami Watch',
        'Tsunami Warning',
    ];

    let includeWindEvents = true;
    const windAlertEvents = [
        'Extreme Wind Warning',
        'High Wind Watch',
        'High Wind Warning',
        'Dust Storm Warning',
    ];

    let includeWinterEvents = true;
    const winterAlertEvents = [
        'Winter Storm Watch',
        'Winter Storm Warning',
        'Blizzard Warning',
        'Snow Squall Warning',
        'Avalanche Watch',
        'Avalanche Warning',
    ];

    let includeOtherEvents = true;
    const otherAlertEvents = [
        'Special Marine Warning',
        'Blue Alert',
        'Child Abduction Emergency',
        'Civil Danger Warning',
        'Civil Emergency Message',
        'Earthquake Warning',
        'Evacuation Immediate',
        'Fire Warning',
        'Hazardous Materials Warning',
        'Law Enforcement Warning',
        'Local Area Emergency',
        '911 Telephone Outage Emergency',
        'Nuclear Power Plant Warning',
        'Radiological Hazard Warning',
        'Shelter in Place Warning',
        'Volcano Warning',
    ];

    /** Returns the Windy pane accent color for an NWS severity label. */
    function colorFromSeverity(severity: string): string {
        let hue = 0;
        if (severity === 'Extreme') {
            hue = 300; // Purple
        } else if (severity === 'Severe') {
            hue = 0; // Red
        } else if (severity === 'Moderate') {
            hue = 59; // Yellow
        } else if (severity === 'Minor') {
            hue = 147; // Green
        } else {
            hue = 214; // Blue
        }

        const color = `hsl(${hue}, 100%, 50%)`;
        return color;
    }

    /** Returns a lower-is-more-important sort level for an NWS severity label. */
    function levelFromSeverity(severity: string): number {
        if (severity === 'Extreme') {
            return 1;
        } else if (severity === 'Severe') {
            return 2;
        } else if (severity === 'Moderate') {
            return 3;
        } else if (severity === 'Minor') {
            return 4;
        } else {
            return 5;
        }
    }

    /** Formats alert timestamps in the user's locale with a short time zone. */
    function formatDate(date: Date): string {
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
    function formatCoordinate(value: number): string {
        return value.toFixed(3);
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

    /** Returns true when a point is close enough to a ring segment to count as covered. */
    function isPointOnSegment(
        location: SelectedLocation,
        start: number[],
        end: number[],
    ): boolean {
        const [startLng, startLat] = start;
        const [endLng, endLat] = end;
        const crossProduct =
            (location.lat - startLat) * (endLng - startLng) -
            (location.lon - startLng) * (endLat - startLat);

        if (Math.abs(crossProduct) > POINT_ON_SEGMENT_TOLERANCE) {
            return false;
        }

        const minLng = Math.min(startLng, endLng) - POINT_ON_SEGMENT_TOLERANCE;
        const maxLng = Math.max(startLng, endLng) + POINT_ON_SEGMENT_TOLERANCE;
        const minLat = Math.min(startLat, endLat) - POINT_ON_SEGMENT_TOLERANCE;
        const maxLat = Math.max(startLat, endLat) + POINT_ON_SEGMENT_TOLERANCE;

        return (
            location.lon >= minLng &&
            location.lon <= maxLng &&
            location.lat >= minLat &&
            location.lat <= maxLat
        );
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

    /** Returns true when a point is inside the polygon outer ring and outside holes. */
    function isPointInPolygon(location: SelectedLocation, polygon: GeoJsonPolygon): boolean {
        if (polygon.length === 0 || !isPointInRing(location, polygon[0])) {
            return false;
        }
        return polygon.slice(1).every(ring => !isPointInRing(location, ring));
    }

    /** Returns true when the selected map position is covered by the alert geometry. */
    function alertContainsLocation(alert: DisplayedAlert, location: SelectedLocation): boolean {
        return alert.polygons.some(polygon => isPointInPolygon(location, polygon));
    }

    /** Recomputes the clicked-position list from current filters and selected location. */
    function updateDisplayedAlertsForLocation(): void {
        const nextDisplayedAlerts = selectedLocation
            ? filteredAlerts.filter(alert => alertContainsLocation(alert, selectedLocation!))
            : [];
        selectedAlert = selectedAlert && nextDisplayedAlerts.includes(selectedAlert) ? selectedAlert : null;
        displayedAlerts = nextDisplayedAlerts;
    }

    /** Extracts latitude and longitude from Windy or Leaflet click event shapes. */
    function locationFromClickEvent(ev: unknown): SelectedLocation | null {
        const candidate = ev as {
            lat?: unknown;
            lon?: unknown;
            lng?: unknown;
            latlng?: { lat?: unknown; lng?: unknown; lon?: unknown };
        };
        const lat = candidate.lat ?? candidate.latlng?.lat;
        const lon = candidate.lon ?? candidate.lng ?? candidate.latlng?.lon ?? candidate.latlng?.lng;

        if (typeof lat !== 'number' || typeof lon !== 'number') {
            return null;
        }
        return { lat, lon };
    }

    /** Adds or moves the map marker that identifies the selected alert lookup point. */
    function updateSelectedLocationMarker(location: SelectedLocation): void {
        const latLng: L.LatLngExpression = [location.lat, location.lon];

        if (selectedLocationMarker) {
            selectedLocationMarker.setLatLng(latLng);
            return;
        }

        selectedLocationMarker = L.marker(latLng, {
            icon: L.divIcon({
                className: 'selected-location-pin-icon',
                html: '<div class="selected-location-pin"></div>',
                iconAnchor: [10, 28],
                iconSize: [20, 28],
            }),
            interactive: false,
        }).addTo(map);
    }

    /** Removes the selected-location marker from the map. */
    function removeSelectedLocationMarker(): void {
        if (!selectedLocationMarker) {
            return;
        }

        selectedLocationMarker.removeFrom(map);
        selectedLocationMarker = null;
    }

    /** Resolves a human-readable Windy place name for the selected map point. */
    async function loadSelectedLocationName(location: SelectedLocation): Promise<void> {
        const requestId = locationNameRequestId + 1;
        locationNameRequestId = requestId;
        selectedLocationLabel = formatSelectedLocationCoords(location);

        try {
            const reverseName = await getBestReverseName(location);
            if (requestId !== locationNameRequestId) {
                return;
            }
            console.log('Reverse geocoder result:', reverseName);

            selectedLocationLabel = reverseName ?? formatSelectedLocationCoords(location);
        } catch (reason) {
            if (requestId === locationNameRequestId) {
                selectedLocationLabel = formatSelectedLocationCoords(location);
                console.error(reason);
            }
        }
    }

    /** Tries Windy's reverse geocoder at several zooms and returns the first useful label. */
    async function getBestReverseName(location: SelectedLocation): Promise<string | null> {
        const reverseName = await getReverseName(location, REVERSE_NAME_ZOOMS[0]) as ReverseNameResult;
        return formatReverseName(reverseName);
    }

    /** Builds a concise place label from Windy's reverse geocoder response. */
    function formatReverseName(reverseName: ReverseNameResult): string | null {
        if (reverseName.nameValid === false || !reverseName.name) {
            return null;
        }

        return reverseName.name;
    }

    /** Formats the clicked location as coordinates for immediate display and fallback. */
    function formatSelectedLocationCoords(location: SelectedLocation): string {
        return `${formatCoordinate(location.lat)}, ${formatCoordinate(location.lon)}`;
    }

    /** Selects a clicked map position and updates the visible alert list. */
    function selectLocation(location: SelectedLocation): void {
        selectedLocation = { ...location };
        selectedLocationLabel = formatSelectedLocationCoords(location);
        selectedAlert = null;
        updateSelectedLocationMarker(location);
        updateDisplayedAlertsForLocation();
        loadSelectedLocationName(location);
    }

    /** Handles Windy singleclick events while the plugin is open. */
    function handleMapClick(ev: unknown): void {
        console.log('NWS alerts map click event', ev);
        const location = locationFromClickEvent(ev);
        if (location) {
            selectLocation(location);
        }
    }

    const highlightAlert = (alert: DisplayedAlert) => {
        if (alert.isAddedToMap) {
            for (const layer of alert.layers) {
                layer.setStyle({ weight: 4 });
            }
            alert.isHighlighted = true;
            displayedAlerts = displayedAlerts;
        }
    };

    const unHighlightAlert = (alert: DisplayedAlert) => {
        if (alert.isAddedToMap) {
            for (const layer of alert.layers) {
                layer.setStyle({ weight: 2 });
            }

            alert.isHighlighted = false;
            displayedAlerts = displayedAlerts;
        }
    };

    const ZONE_DATA_URL =
        'https://cdn.jsdelivr.net/gh/RyanMathewson/windy-plugin-usa-nws-alerts@main/data/zone-geometries.json';

    // Zone data is fetched once per session and reused across refreshes.
    let zoneData: Record<string, number[][][]> | null = null;

    async function getZoneData(): Promise<Record<string, number[][][]>> {
        if (!zoneData) {
            const response = await fetch(ZONE_DATA_URL);
            zoneData = await response.json();
        }
        return zoneData!;
    }

    function zoneKeyFromUrl(url: string): string {
        const match = url.match(/\/zones\/([^/]+\/[^/]+)$/);
        return match ? match[1] : '';
    }

    const loadAlerts = async () => {
        // Clear the map
        removeAllMapFeatures();
        allAlerts = [];
        displayedAlerts = [];
        selectedAlert = null;
        lastRefresh = null;

        try {
            const [alertsResult, zones] = await Promise.all([
                fetch('https://api.weather.gov/alerts/active')
                    .then(r => r.json())
                    .then(data => data.features as NWSAlert[]),
                getZoneData().catch(() => ({} as Record<string, number[][][]>)),
            ]);

            lastRefresh = new Date();
            const temporaryListOfAlerts: DisplayedAlert[] = [];

            for (const nwsAlert of alertsResult) {
                // status can be: Actual, Exercise, System, Test, or Draft.
                // Only "Actual" alerts are actionable; the rest are for testing/internal use.
                if (nwsAlert.properties.status !== 'Actual') {
                    continue;
                }

                const color = colorFromSeverity(nwsAlert.properties.severity);

                const alert: DisplayedAlert = {
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
                    isAddedToMap: false,
                    isHighlighted: false,
                };

                if (nwsAlert.geometry) {
                    alert.layers = buildPolylineLayers(nwsAlert.geometry);
                    alert.polygons = polygonsFromGeometry(nwsAlert.geometry);
                } else if (nwsAlert.properties.affectedZones?.length) {
                    const allRings: number[][][] = [];
                    for (const zoneUrl of nwsAlert.properties.affectedZones) {
                        const rings = zones[zoneKeyFromUrl(zoneUrl)];
                        if (rings) {
                            allRings.push(...rings);
                        }
                    }
                    if (allRings.length > 0) {
                        const mergedRings = mergeRings(allRings);
                        alert.layers = buildPolylineLayersFromRings(mergedRings);
                        alert.polygons = polygonsFromRings(mergedRings);
                    }
                }

                if (alert.layers.length === 0 || alert.polygons.length === 0) {
                    continue;
                }

                temporaryListOfAlerts.push(alert);

                for (const layer of alert.layers) {
                    layer.setStyle({
                        className: 'nws-alert-layer',
                        color,
                        weight: 2,
                    });

                    layer.on('mouseover', () => highlightAlert(alert));
                    layer.on('mouseout', () => unHighlightAlert(alert));

                    layer.on('click', handleMapClick);

                    map.addLayer(layer);
                }
                alert.isAddedToMap = true;
            }

            // Update our local list of alerts
            allAlerts = temporaryListOfAlerts.sort((a, b) => a.severityLevel - b.severityLevel);

            filtersChanged();
        } catch (reason) {
            lastRefresh = null;
            timeAgo = 'Error fetching alerts. Try again later.';
            console.error(reason);
        }
    };

    const removeAllMapFeatures = () => {
        // Remove all of our alert layers
        for (const alert of allAlerts) {
            if (!alert.isAddedToMap) {
                continue;
            }
            for (const layer of alert.layers) {
                layer.off();
                layer.removeFrom(map);
            }
            alert.isAddedToMap = false;
        }
    };

    const filtersChanged = () => {
        const includedAlerts: DisplayedAlert[] = [];
        for (const alert of allAlerts) {
            if (
                (includeFloodEvents && floodAlertEvents.includes(alert.event)) ||
                (includeStormEvents && stormAlertEvents.includes(alert.event)) ||
                (includeWindEvents && windAlertEvents.includes(alert.event)) ||
                (includeWinterEvents && winterAlertEvents.includes(alert.event)) ||
                (includeOtherEvents && otherAlertEvents.includes(alert.event))
            ) {
                includedAlerts.push(alert);

                // Add this alerts layers to the map if they don't already exist
                if (!alert.isAddedToMap) {
                    for (const layer of alert.layers) {
                        layer.addTo(map);
                    }
                    alert.isAddedToMap = true;
                }
            } else {
                // This alert has been filtered out so remove it

                // Remove this alerts layers from the map if they exist
                if (alert.isAddedToMap) {
                    for (const layer of alert.layers) {
                        layer.removeFrom(map);
                    }
                    alert.isAddedToMap = false;
                }
            }
        }

        filteredAlerts = includedAlerts;
        updateDisplayedAlertsForLocation();
    };

    const lastUpdatedRefreshInterval = setInterval(() => {
        // Update our last refresh message
        if (lastRefresh) {
            timeAgo = formatDistanceToNow(lastRefresh, { addSuffix: true });
        }
    }, 1000);

    export const onopen = () => {
        loadAlerts();
    };

    onMount(() => {
        singleclick.on(name, handleMapClick);
    });

    onDestroy(() => {
        singleclick.off(name, handleMapClick);

        removeAllMapFeatures();
        removeSelectedLocationMarker();
        clearInterval(lastUpdatedRefreshInterval);
    });
</script>

<style lang="less">
    .plugin__content {
        padding-top: 5px;
    }
    .refresh-row {
        align-items: center;
        display: flex;
        gap: 8px;
    }
    .filter-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 10px;
    }
    .all-alerts-back {
        cursor: pointer;
        display: inline-block;
        font-size: 14px;
        margin-bottom: 10px;
    }
    .alert {
        border-left: 5px solid;
        padding-left: 10px;
    }
    .alert-row {
        padding-bottom: 8px;
        padding-top: 8px;
    }
    .detail-alert {
        padding-bottom: 10px;
    }
    .highlightedAlert {
        border-left: 10px solid;
        padding-left: 5px;
    }
    .mobile-alert-ui {
        box-sizing: border-box;
        max-height: 45vh;
        overflow: auto;
        padding: 8px;
        width: 100%;
    }
    .metadata-grid {
        display: grid;
        gap: 4px 8px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .message-block {
        white-space: pre-wrap;
    }
    .message-label {
        font-weight: bold;
        margin-bottom: 2px;
    }
    .location-status,
    .empty-state {
        line-height: 1.4;
    }
    :global(.nws-alert-layer) {
        cursor: pointer;
    }
    :global(.selected-location-pin-icon) {
        background: transparent;
        border: 0;
    }
    :global(.selected-location-pin) {
        background: #f45d22;
        border: 2px solid #ffffff;
        border-radius: 50% 50% 50% 0;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
        height: 16px;
        transform: rotate(-45deg);
        transform-origin: 50% 50%;
        width: 16px;
    }
    :global(.selected-location-pin::after) {
        background: #ffffff;
        border-radius: 50%;
        content: '';
        height: 6px;
        left: 5px;
        position: absolute;
        top: 5px;
        width: 6px;
    }
    .noWrap {
        white-space: nowrap;
    }
    .hasTitle {
        text-decoration: underline dotted;
    }
</style>
