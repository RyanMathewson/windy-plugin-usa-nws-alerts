<section
    bind:this={pluginElement}
    class:mobile-alert-ui={isMobileOrTablet}
    class:plugin__content={!isMobileOrTablet}
    style:--alert-scroll-max-height={scrollBodyMaxHeight}
>
    {#if !isMobileOrTablet}
        <div
            class="plugin__title plugin__title--chevron-back"
            on:click={() => bcast.emit('rqstOpen', 'menu')}
        >
            {title}
        </div>
    {/if}

    {#if selectedAlert}
        <div
            class="all-alerts-back clickable"
            on:click={showAlertList}
        >
            <span class="all-alerts-chevron" aria-hidden="true"></span>
            All Alerts
        </div>
        <div class="alert-scroll-body">
            <AlertDetail alert={selectedAlert} />
        </div>
    {:else}
        <AlertControls
            {timeAgo}
            locationLabel={selectedLocation ? selectedLocationLabel : 'Showing alerts in view'}
            filtersVisible={showFilters}
            onRefresh={loadAlerts}
            onToggleFilters={toggleFiltersVisibility}
            onClearLocation={selectedLocation ? clearSelectedLocation : undefined}
        />
        <div class="alert-scroll-body">
            {#if showFilters}
                <AlertFilters
                    {filters}
                    onFiltersChange={handleFiltersChange}
                />
            {:else}
                <AlertList
                    {displayedAlerts}
                    {selectedLocation}
                    onSelectAlert={selectAlert}
                    onHighlightAlert={highlightAlert}
                    onUnhighlightAlert={unHighlightAlert}
                />
            {/if}
        </div>
    {/if}
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { isMobileOrTablet } from '@windy/rootScope';
    import { onDestroy, onMount } from 'svelte';
    import { singleclick } from '@windy/singleclick';
    import { get as getReverseName } from '@windy/reverseName';
    import AlertControls from './components/AlertControls.svelte';
    import AlertDetail from './components/AlertDetail.svelte';
    import AlertFilters from './components/AlertFilters.svelte';
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
    const SECOND_MS = 1000;
    const MINUTE_MS = 60 * SECOND_MS;
    const HOUR_MS = 60 * MINUTE_MS;
    const DAY_MS = 24 * HOUR_MS;

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
    let timeAgo = '...';
    let filters: AlertFilterState = createDefaultAlertFilters();
    let pluginElement: HTMLElement | null = null;
    let scrollBodyMaxHeight = 'none';
    let showFilters = false;

    /** Loads NWS alerts, renders their map layers, and reapplies current filters. */
    async function loadAlerts(): Promise<void> {
        removeAllMapFeatures();
        allAlerts = [];
        displayedAlerts = [];
        selectedAlert = null;
        lastRefresh = null;
        timeAgo = '...';

        try {
            const [alertsResult, zones] = await Promise.all([
                fetchActiveAlerts(),
                getZoneData().catch(() => ({} as ZoneGeometryData)),
            ]);
            allAlerts = buildDisplayedAlerts(alertsResult, zones);
            lastRefresh = new Date();
            timeAgo = formatCompactElapsedTime(lastRefresh);
            filtersChanged();
        } catch (reason) {
            lastRefresh = null;
            timeAgo = 'error';
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

    /** Toggles the scrollable filter panel from the fixed alert header button. */
    function toggleFiltersVisibility(): void {
        showFilters = !showFilters;
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

        updateDisplayedAlerts();
    }

    /** Recomputes the alert list from current filters and the active selection mode. */
    function updateDisplayedAlerts(): void {
        const nextDisplayedAlerts = selectedLocation
            ? filteredAlerts.filter(alert => alertContainsLocation(alert, selectedLocation!))
            : filteredAlertsInViewport();
        selectedAlert = selectedAlert && nextDisplayedAlerts.includes(selectedAlert) ? selectedAlert : null;
        displayedAlerts = nextDisplayedAlerts;
    }

    /** Returns category-filtered alerts whose geometry intersects the current map viewport. */
    function filteredAlertsInViewport(): DisplayedAlert[] {
        const mapBounds = map.getBounds();
        return filteredAlerts.filter(alert => alert.bounds !== null && mapBounds.intersects(alert.bounds));
    }

    /** Refreshes the viewport-filtered list whenever the user pans or zooms. */
    function mapMoved(): void {
        if (!selectedLocation) {
            updateDisplayedAlerts();
        }
    }

    /** Handles Windy singleclick events while the plugin is open. */
    function handleMapClick(ev: unknown): void {
        const location = locationFromClickEvent(ev);
        if (location) {
            selectLocation(location);
        }
    }

    /** Selects a clicked map position and updates the visible alert list. */
    function selectLocation(location: SelectedLocation): void {
        clearHighlightedAlerts();
        selectedLocation = { ...location };
        selectedLocationLabel = formatSelectedLocationCoords(location);
        selectedAlert = null;
        selectedLocationMarker = updateSelectedLocationMarker(map, selectedLocationMarker, location);
        updateDisplayedAlerts();
        loadSelectedLocationName(location);
    }

    /** Returns to viewport mode, dropping the selected point and its pin. */
    function clearSelectedLocation(): void {
        clearHighlightedAlerts();
        selectedLocation = null;
        selectedAlert = null;
        locationNameRequestId += 1;
        removeSelectedLocationMarker(map, selectedLocationMarker);
        selectedLocationMarker = null;
        updateDisplayedAlerts();
    }

    /** Selects a visible alert row for detail rendering. */
    function selectAlert(alert: DisplayedAlert): void {
        selectedAlert = alert;
    }

    /** Returns to the alert list and clears the selected alert's temporary highlight. */
    function showAlertList(): void {
        if (selectedAlert) {
            unHighlightAlert(selectedAlert);
        }
        selectedAlert = null;
    }

    /** Clears any temporary list or map highlight before changing view context. */
    function clearHighlightedAlerts(): void {
        for (const alert of allAlerts) {
            if (alert.isHighlighted) {
                unHighlightAlert(alert);
            }
        }
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
            selectedLocationLabel = reverseName ?? formatSelectedLocationCoords(location);
        } catch (reason) {
            handleReverseNameError(reason, requestId, location);
        }
    }

    /** Tries Windy's reverse geocoder at progressively broader zoom levels and returns the first valid label. */
    async function getBestReverseName(location: SelectedLocation): Promise<string | null> {
        for (const zoom of REVERSE_NAME_ZOOMS) {
            const reverseName = await getReverseName(location, zoom) as ReverseNameResult;
            const formatted = formatReverseName(reverseName);
            if (formatted) {
                return formatted;
            }
        }
        return null;
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

    /** Formats an elapsed time as a compact refresh label. */
    function formatCompactElapsedTime(fromDate: Date): string {
        const elapsedMs = Math.max(0, Date.now() - fromDate.getTime());
        if (elapsedMs < MINUTE_MS) {
            return `${Math.floor(elapsedMs / SECOND_MS)}s`;
        }
        if (elapsedMs < HOUR_MS) {
            return `${Math.floor(elapsedMs / MINUTE_MS)}m`;
        }
        if (elapsedMs < DAY_MS) {
            return `${Math.floor(elapsedMs / HOUR_MS)}h`;
        }
        return `${Math.floor(elapsedMs / DAY_MS)}d`;
    }

    /** Measures the visible mobile plugin space so the nested alert body can own scrolling. */
    function updateScrollBodyMaxHeight(): void {
        if (!isMobileOrTablet || !pluginElement) {
            scrollBodyMaxHeight = 'none';
            return;
        }

        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const pluginTop = pluginElement.getBoundingClientRect().top;
        const availableHeight = Math.max(160, viewportHeight - pluginTop - 12);
        scrollBodyMaxHeight = `${Math.floor(availableHeight)}px`;
    }

    const lastUpdatedRefreshInterval = setInterval(() => {
        if (lastRefresh) {
            timeAgo = formatCompactElapsedTime(lastRefresh);
        }
    }, 1000);

    export const onopen = () => {
        loadAlerts();
    };

    onMount(() => {
        singleclick.on(name, handleMapClick);
        map.on('moveend', mapMoved);
        map.on('zoomend', mapMoved);
        updateScrollBodyMaxHeight();
        window.addEventListener('resize', updateScrollBodyMaxHeight);
        window.visualViewport?.addEventListener('resize', updateScrollBodyMaxHeight);
    });

    onDestroy(() => {
        singleclick.off(name, handleMapClick);
        map.off('moveend', mapMoved);
        map.off('zoomend', mapMoved);
        window.removeEventListener('resize', updateScrollBodyMaxHeight);
        window.visualViewport?.removeEventListener('resize', updateScrollBodyMaxHeight);
        removeAllMapFeatures();
        removeSelectedLocationMarker(map, selectedLocationMarker);
        selectedLocationMarker = null;
        clearInterval(lastUpdatedRefreshInterval);
    });
</script>

<style lang="less">
    @import './plugin.less';
</style>
