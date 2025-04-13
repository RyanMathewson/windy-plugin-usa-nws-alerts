{#if isMobileOrTablet}
    <section class="mobile-alert-ui horizontal-scroll">
        {#each displayedAlerts as alert}
            <div
                class="alert mr-20 size-xs clickable"
                style:border-left-color={colorFromSeverity(alert.severity)}
                on:click={() => focusOnAlert(alert)}
            >
                <div class="size-l mb-5">
                    {alert.event}
                </div>
                <div class="nowrap">
                    Severity: {alert.severity}<br />
                    Headline:&nbsp;{alert.headline}°
                </div>
            </div>
        {/each}
    </section>
{:else}
    <section class="plugin__content">
        <div
            class="plugin__title plugin__title--chevron-back"
            on:click={() => bcast.emit('rqstOpen', 'menu')}
        >
            USA NWS Alerts
        </div>
        <div class="menu-top rounded-box rounded-box--with-border mm-section mb-10">
            <div class="button button--variant-orange size-s" on:click={() => loadAlerts()}>
                Refresh
            </div>
            <div class="size-s">
                Last Refresh: {timeAgo}
            </div>
            <ul style="list-style-type: none">
                <li>
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={includeStormEvents}
                            on:change={filtersChanged}
                        />
                        Storms & Tornados
                    </label>
                </li>
                <li>
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={includeWindEvents}
                            on:change={filtersChanged}
                        />
                        Wind & Dust
                    </label>
                </li>
                <li>
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={includeFloodEvents}
                            on:change={filtersChanged}
                        />
                        Floods
                    </label>
                </li>
                <li>
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={includeWinterEvents}
                            on:change={filtersChanged}
                        />
                        Winter & Snow
                    </label>
                </li>
                <li>
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={includeOtherEvents}
                            on:change={filtersChanged}
                        />
                        Other
                    </label>
                </li>
            </ul>
        </div>
        {#each displayedAlerts as alert}
            <div
                class="alert mb-20 size-xs clickable"
                style:border-left-color={colorFromSeverity(alert.severity)}
                on:click={() => focusOnAlert(alert)}
                on:mouseenter={() => highlightAlert(alert)}
                on:mouseleave={() => unHighlightAlert(alert)}
            >
                <div class="size-l mb-5">
                    {alert.event}
                </div>
                <div>
                    Area: {alert.areaDesc}
                </div>
                <div>
                    Time: {formatDate(alert.effective)} - {formatDate(alert.expires)}
                </div>
                <div>
                    Headline: {alert.headline}°
                </div>
            </div>
        {/each}
    </section>
{/if}

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { isMobileOrTablet } from '@windy/rootScope';
    import { onMount, onDestroy } from 'svelte';
    import { formatDistanceToNow } from 'date-fns';
    import store from '@windy/store';

    // IMPORTANT: all types must be imported as `type` otherwise
    // Svelte TS compiler will fail
    import type { NWSAlert } from './nws';

    interface DisplayedAlert {
        severity: string;
        description: string;
        event: string;
        headline: string;
        areaDesc: string;
        effective: Date;
        expires: Date;
        layers: L.Polyline[];
        isAddedToMap: boolean;
        severityLevel: number;
        center?: L.LatLng;
        bounds?: L.LatLngBounds;
    }

    let allAlerts: DisplayedAlert[] = [];
    let filteredAlerts: DisplayedAlert[] = [];
    let displayedAlerts: DisplayedAlert[] = [];
    let openedPopup: L.Popup | null = null;
    let lastRefresh: Date | null = null;
    let timeAgo: string = 'Loading...'; // Placeholder text
    let radarTimestamp: Date = new Date();

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

    const displayPopup = (message: string, location: L.LatLngExpression) => {
        openedPopup?.remove();

        openedPopup = new L.Popup({ autoClose: false, closeOnClick: false })
            .setLatLng(location)
            .setContent(message)
            .openOn(map);
    };

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

    function levelFromSeverity(severity: string): number {
        if (severity === 'Extreme') {
            return 5;
        } else if (severity === 'Severe') {
            return 4;
        } else if (severity === 'Moderate') {
            return 3;
        } else if (severity === 'Minor') {
            return 2;
        } else {
            return 1;
        }
    }

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

    const focusOnAlert = (alert: DisplayedAlert) => {
        // Clear any existing popups
        openedPopup?.remove();

        // Fly to the alert
        if (alert.bounds) {
            map.flyToBounds(alert.bounds, {
                duration: 1,
            });
        }
    };

    const highlightAlert = (alert: DisplayedAlert) => {
        if (alert.isAddedToMap) {
            for (let layer of alert.layers) {
                layer.setStyle({ weight: 4 });
            }
        }
    };

    const unHighlightAlert = (alert: DisplayedAlert) => {
        if (alert.isAddedToMap) {
            for (let layer of alert.layers) {
                layer.setStyle({ weight: 2 });
            }
        }
    };

    const loadAlerts = () => {
        // Clear the map
        removeAllMapFeatures();
        allAlerts = [];
        displayedAlerts = [];
        lastRefresh = null;

        fetch('https://api.weather.gov/alerts/active')
            .then(response => response.json())
            .then(result => result.features)
            .then((nwsAlerts: NWSAlert[]) => {
                lastRefresh = new Date();
                const temporaryListOfAlerts: DisplayedAlert[] = [];

                for (var nwsAlert of nwsAlerts) {
                    if (nwsAlert.geometry == null || nwsAlert.geometry.type !== 'Polygon') {
                        continue; // Unsupported alert
                    }

                    const alert: DisplayedAlert = {
                        severity: nwsAlert.properties.severity,
                        severityLevel: levelFromSeverity(nwsAlert.properties.severity),
                        event: nwsAlert.properties.event,
                        description: nwsAlert.properties.description,
                        areaDesc: nwsAlert.properties.areaDesc,
                        headline: nwsAlert.properties.headline,
                        effective: new Date(nwsAlert.properties.effective),
                        expires: new Date(nwsAlert.properties.expires),
                        layers: [],
                        isAddedToMap: true,
                    };

                    temporaryListOfAlerts.push(alert);

                    const color = colorFromSeverity(nwsAlert.properties.severity);
                    for (var geometry of nwsAlert.geometry.coordinates) {
                        const track: L.LatLngExpression[] = [];
                        for (var point of geometry) {
                            track.push([point[1], point[0]]); // Swap coordinates to match what Windy expects
                        }
                        const layer = new L.Polyline(track, {
                            color,
                            weight: 2,
                        });

                        layer.on('mouseover', () => layer.setStyle({ weight: 4 }));
                        layer.on('mouseout', () => layer.setStyle({ weight: 2 }));

                        const description = nwsAlert.properties.description;

                        layer.on('click', () =>
                            displayPopup(description, layer.getBounds().getCenter()),
                        );

                        map.addLayer(layer);
                        alert.layers.push(layer);

                        // TODO We are only saving these from the last layer
                        alert.center = layer.getCenter();
                        alert.bounds = layer.getBounds();
                    }
                }

                // Update our local list of alerts
                allAlerts = temporaryListOfAlerts.sort((a, b) => a.severityLevel - b.severityLevel);

                filtersChanged();
            })
            .catch(console.error);
    };

    const removeAllMapFeatures = () => {
        openedPopup?.remove();

        // Remove all of our alert layers
        for (var alert of allAlerts) {
            for (var layer of alert.layers) {
                if (map.hasLayer(layer)) {
                    layer.removeFrom(map);
                }
            }
            alert.isAddedToMap = false;
        }
    };

    const filtersChanged = () => {
        let anyChanges = false;
        let includedAlerts = [];
        for (let alert of allAlerts) {
            if (
                alert.effective <= radarTimestamp &&
                alert.expires >= radarTimestamp &&
                ((includeFloodEvents && floodAlertEvents.includes(alert.event)) ||
                    (includeStormEvents && stormAlertEvents.includes(alert.event)) ||
                    (includeWindEvents && windAlertEvents.includes(alert.event)) ||
                    (includeWinterEvents && winterAlertEvents.includes(alert.event)) ||
                    (includeOtherEvents && otherAlertEvents.includes(alert.event)))
            ) {
                includedAlerts.push(alert);

                // Add this alerts layers to the map if they don't already exist
                if (!alert.isAddedToMap) {
                    anyChanges = true;
                    for (let layer of alert.layers) {
                        layer.addTo(map);
                    }
                    alert.isAddedToMap = true;
                }
            } else {
                // This alert has been filtered out so remove it

                // Remove this alerts layers from the map if they exist
                if (alert.isAddedToMap) {
                    anyChanges = true;
                    for (let layer of alert.layers) {
                        layer.removeFrom(map);
                    }
                    alert.isAddedToMap = false;
                }
            }
        }

        if (anyChanges) {
            filteredAlerts = includedAlerts;
            // Apply the map bounds filtering to the updated list of filtered alerts
            mapMoved();
        }
    };

    const mapMoved = () => {
        // Filter what alerts we are displaying based on the current view of the map
        const mapBounds = map.getBounds();
        displayedAlerts = filteredAlerts.filter(
            alert => alert.bounds && mapBounds.intersects(alert.bounds),
        );
    };

    const lastUpdatedRefreshInterval = setInterval(() => {
        // Update our last refresh message
        if (lastRefresh) {
            timeAgo = formatDistanceToNow(lastRefresh, { addSuffix: true });
        }
    }, 1000);

    const radarTimestampChanged = (time: number) => {
        // Filter the alerts based on the current radar timestamp
        radarTimestamp = new Date(time);
        filtersChanged();
    };

    export const onopen = () => {
        loadAlerts();
    };

    onMount(() => {
        map.on('zoomend', mapMoved);
        map.on('moveend', mapMoved);
        store.on('radarTimestamp', time => radarTimestampChanged(time));
    });

    onDestroy(() => {
        removeAllMapFeatures();
        clearInterval(lastUpdatedRefreshInterval);
    });
</script>

<style lang="less">
    .plugin__content {
        padding-top: 5px;
    }
    .alert {
        padding-left: 7px;
        border-left: 5px solid;
        &__speed {
            white-space: nowrap;
        }
    }
    .mobile-alert-ui {
        display: flex;
        flex-direction: row;
        align-items: center;
        overflow: auto;
    }
</style>
