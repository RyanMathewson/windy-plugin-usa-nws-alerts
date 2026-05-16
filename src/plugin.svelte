<section class:mobile-alert-ui={isMobileOrTablet} class:plugin__content={!isMobileOrTablet}>
    {#if !isMobileOrTablet}
        <div
            class="plugin__title plugin__title--chevron-back"
            on:click={() => bcast.emit('rqstOpen', 'menu')}
        >
            {title}
        </div>
    {/if}

    <AlertControls
        {filters}
        {timeAgo}
        onRefresh={loadAlerts}
        onFiltersChange={handleFiltersChange}
    />

    {#if selectedAlert}
        <AlertDetail
            alert={selectedAlert}
            onBack={() => {
                selectedAlert = null;
            }}
        />
    {:else}
        <AlertList
            {displayedAlerts}
            {selectedLocation}
            {selectedLocationLabel}
            onSelectAlert={selectAlert}
            onHighlightAlert={highlightAlert}
            onUnhighlightAlert={unHighlightAlert}
        />
    {/if}
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { isMobileOrTablet } from '@windy/rootScope';
    import { onDestroy, onMount } from 'svelte';
    import { formatDistanceToNow } from 'date-fns';
    import { singleclick } from '@windy/singleclick';
    import { get as getReverseName } from '@windy/reverseName';
    import AlertControls from './components/AlertControls.svelte';
    import AlertDetail from './components/AlertDetail.svelte';
    import AlertList from './components/AlertList.svelte';
    import config from './pluginConfig';
    import { fetchActiveAlerts, getZoneData } from './scripts/alertData';
    import { createDefaultAlertFilters, filterAlerts } from './scripts/alertFilters';
    import { alertContainsLocation } from './scripts/locationGeometry';
    import {
        addAlertToMap,
        configureAlertLayers,
        highlightAlertLayers,
        locationFromClickEvent,
        removeAlertFromMap,
        removeAllAlertLayers,
        removeSelectedLocationMarker,
        unHighlightAlertLayers,
        updateSelectedLocationMarker,
    } from './scripts/mapLayers';
    import {
        displayedAlertFromNwsAlert,
        formatSelectedLocationCoords,
        sortAlertsBySeverity,
    } from './scripts/alertUtils';
    import type { NWSAlert } from './nws';
    import type { AlertFilterState, DisplayedAlert, SelectedLocation, ZoneGeometryData } from './scripts/alertTypes';

    const { name, title } = config;
    const REVERSE_NAME_ZOOMS = [13, 11, 9, 7];

    interface ReverseNameResult {
        name?: string;
        nameValid?: boolean;
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
    let timeAgo = 'Loading...';
    let filters: AlertFilterState = createDefaultAlertFilters();

    /** Loads NWS alerts, renders their map layers, and reapplies current filters. */
    async function loadAlerts(): Promise<void> {
        removeAllMapFeatures();
        allAlerts = [];
        displayedAlerts = [];
        selectedAlert = null;
        lastRefresh = null;

        try {
            const [alertsResult, zones] = await Promise.all([
                fetchActiveAlerts(),
                getZoneData().catch(() => ({} as ZoneGeometryData)),
            ]);
            allAlerts = buildDisplayedAlerts(alertsResult, zones);
            lastRefresh = new Date();
            filtersChanged();
        } catch (reason) {
            lastRefresh = null;
            timeAgo = 'Error fetching alerts. Try again later.';
            console.error(reason);
        }
    }

    /** Converts fetched NWS alerts into configured, map-visible display alerts. */
    function buildDisplayedAlerts(alertsResult: NWSAlert[], zones: ZoneGeometryData): DisplayedAlert[] {
        const alerts: DisplayedAlert[] = [];
        for (const nwsAlert of alertsResult) {
            const alert = displayedAlertFromNwsAlert(nwsAlert, zones);
            if (!alert) {
                continue;
            }

            configureAlertLayers(alert, {
                onMouseOver: highlightAlert,
                onMouseOut: unHighlightAlert,
                onClick: handleMapClick,
            });
            addAlertToMap(alert, map);
            alerts.push(alert);
        }
        return sortAlertsBySeverity(alerts);
    }

    /** Applies a user-selected alert category state and updates map/list visibility. */
    function handleFiltersChange(nextFilters: AlertFilterState): void {
        filters = nextFilters;
        filtersChanged();
    }

    /** Recomputes filtered alerts and synchronizes Leaflet layer visibility. */
    function filtersChanged(): void {
        filteredAlerts = filterAlerts(allAlerts, filters);
        const includedAlerts = new Set(filteredAlerts);

        for (const alert of allAlerts) {
            if (includedAlerts.has(alert)) {
                addAlertToMap(alert, map);
            } else {
                removeAlertFromMap(alert, map);
            }
        }

        updateDisplayedAlertsForLocation();
    }

    /** Recomputes the clicked-position list from current filters and selected location. */
    function updateDisplayedAlertsForLocation(): void {
        const nextDisplayedAlerts = selectedLocation
            ? filteredAlerts.filter(alert => alertContainsLocation(alert, selectedLocation!))
            : [];
        selectedAlert = selectedAlert && nextDisplayedAlerts.includes(selectedAlert) ? selectedAlert : null;
        displayedAlerts = nextDisplayedAlerts;
    }

    /** Handles Windy singleclick events while the plugin is open. */
    function handleMapClick(ev: unknown): void {
        console.log('NWS alerts map click event', ev);
        const location = locationFromClickEvent(ev);
        if (location) {
            selectLocation(location);
        }
    }

    /** Selects a clicked map position and updates the visible alert list. */
    function selectLocation(location: SelectedLocation): void {
        selectedLocation = { ...location };
        selectedLocationLabel = formatSelectedLocationCoords(location);
        selectedAlert = null;
        selectedLocationMarker = updateSelectedLocationMarker(map, selectedLocationMarker, location);
        updateDisplayedAlertsForLocation();
        loadSelectedLocationName(location);
    }

    /** Selects a visible alert row for detail rendering. */
    function selectAlert(alert: DisplayedAlert): void {
        selectedAlert = alert;
    }

    /** Highlights a visible alert on the map and in the list. */
    function highlightAlert(alert: DisplayedAlert): void {
        if (highlightAlertLayers(alert)) {
            displayedAlerts = displayedAlerts;
        }
    }

    /** Removes highlight styling from a visible alert. */
    function unHighlightAlert(alert: DisplayedAlert): void {
        if (unHighlightAlertLayers(alert)) {
            displayedAlerts = displayedAlerts;
        }
    }

    /** Removes every alert layer from the map and detaches layer handlers. */
    function removeAllMapFeatures(): void {
        removeAllAlertLayers(allAlerts, map);
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
            handleReverseNameError(reason, requestId, location);
        }
    }

    /** Tries Windy's reverse geocoder and returns a useful display label when available. */
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

    /** Restores the coordinate fallback if reverse geocoding fails for the active request. */
    function handleReverseNameError(reason: unknown, requestId: number, location: SelectedLocation): void {
        if (requestId === locationNameRequestId) {
            selectedLocationLabel = formatSelectedLocationCoords(location);
            console.error(reason);
        }
    }

    const lastUpdatedRefreshInterval = setInterval(() => {
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
        removeSelectedLocationMarker(map, selectedLocationMarker);
        selectedLocationMarker = null;
        clearInterval(lastUpdatedRefreshInterval);
    });
</script>

<style lang="less">
    @import './plugin.less';
</style>
