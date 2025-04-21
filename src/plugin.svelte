{#if isMobileOrTablet}
    <section class="mobile-alert-ui horizontal-scroll">
        <div class="mb-10">
            <div class="button button--variant-orange size-s" on:click={() => loadAlerts()}>
                Refresh
            </div>
            <div class="size-s">
                Last Refresh: {timeAgo}
            </div>
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
                    {alert.headline}
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
            {title}
        </div>
        <div class="menu-top rounded-box rounded-box--with-border mm-section mb-10">
            <div class="mb-10">
                <div
                    class="button button--variant-orange size-s"
                    style="display:inline;"
                    on:click={() => loadAlerts()}
                >
                    Refresh
                </div>
                <div class="size-s" style="display:inline;">
                    Last Refresh: {timeAgo}
                </div>
            </div>
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
        {#each displayedAlerts as alert (alert.id)}
            <div
                class="alert mb-20 size-xs clickable"
                class:highlightedAlert={alert.isHighlighted}
                style:border-left-color={colorFromSeverity(alert.severity)}
                use:setDivElement={alert}
                on:click={() => focusOnAlert(alert)}
                on:mouseenter={() => highlightAlert(alert)}
                on:mouseleave={() => unHighlightAlert(alert)}
            >
                <div class="size-l mb-5">
                    {alert.event}
                </div>
                <div
                    style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-flow: column;"
                >
                    <div>Certainty: {alert.certainty}</div>
                    <div>Urgency: {alert.urgency}</div>
                    <div>Status: {alert.status}</div>
                </div>
                <div class="noWrap">
                    Area: {alert.areaDesc}
                </div>
                <div class="noWrap">
                    Time: {formatDate(alert.effective)} - {formatDate(alert.expires)}
                </div>
                <div class="noWrap" title={'Sent: ' + formatDate(alert.sent)}>
                    Sender: {alert.senderName} ({alert.sender})
                </div>
                <div class="noWrap" title={alert.description}>
                    Description: <span class="hasTitle">{alert.description}</span>
                </div>
                <div class="noWrap" title={alert.instruction}>
                    Instruction: <span class="hasTitle">{alert.instruction ?? 'None'}</span>
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
    import * as pako from 'pako';
    import store from '@windy/store';
    import { singleclick } from '@windy/singleclick';
    import config from './pluginConfig';

    // IMPORTANT: all types must be imported as `type` otherwise
    // Svelte TS compiler will fail
    import type { NWSAlert } from './nws';
    // import { Layer } from '@windy/client/Layer';

    // Used for fetching/caching UGC zones
    type Geometry = GeoJSON.Geometry;
    type Feature = GeoJSON.Feature;
    const CDN_BASE =
        'https://cdn.jsdelivr.net/gh/RyanMathewson/public-forecast-zones@8306709/z_18mr25';
    const stateCache: Record<string, Feature[]> = {};
    const ugcCache: Record<string, Geometry> = {};

    const { name, title } = config;

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
        ends: Date;
        sender: string;
        senderName: string;
        certainty: string;
        urgency: string;
        status: string;
        messageType: string;
        category: string;
        instruction: string;
        layers: L.Polyline[];
        isAddedToMap: boolean;
        isHighlighted: boolean;
        severityLevel: number;
        center?: L.LatLng;
        bounds?: L.LatLngBounds;
        divElement?: HTMLDivElement | null;
    }

    let allAlerts: DisplayedAlert[] = [];
    let filteredAlerts: DisplayedAlert[] = [];
    let displayedAlerts: DisplayedAlert[] = [];
    let openedPopup: L.Popup | null = null;
    let lastRefresh: Date | null = null;
    let timeAgo: string = 'Loading...'; // Placeholder text
    let radarTimestamp: Date = new Date();
    let radarCalendarStart: Date = new Date();
    let radarCalendarEnd: Date = new Date();

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

    // TODO auto scroll to highlighted alerts. Doesn't behave well.
    /*
    $: {
        for (const alert of displayedAlerts) {
            if (alert.isHighlighted && alert.divElement) {
                alert.divElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
    */

    export async function getGeometryForUGC(ugcCode: string): Promise<Geometry | null> {
        if (ugcCache[ugcCode]) {
            return ugcCache[ugcCode];
        }

        // Extract state prefix from UGC code (e.g. "KSZ072" -> "KS")
        const state = ugcCode.slice(0, 2).toUpperCase();

        // Load and cache the state data if needed
        if (!stateCache[state]) {
            const url = `${CDN_BASE}/${state}.geojson.gz`;

            try {
                const response = await fetch(url);
                const compressed = await response.arrayBuffer();
                const jsonString = pako.ungzip(new Uint8Array(compressed), { to: 'string' });
                const geojson = JSON.parse(jsonString);

                if (geojson?.features) {
                    stateCache[state] = geojson.features;
                } else {
                    console.warn(`No features found in ${state}.geojson.gz`);
                    return null;
                }
            } catch (err) {
                console.error(`Failed to load or parse ${state}.geojson.gz`, err);
                return null;
            }
        }

        // Search for the specific UGC feature in cached data
        const feature = stateCache[state].find(f => f.properties?.UGC === ugcCode);

        if (feature) {
            ugcCache[ugcCode] = feature.geometry;
            return feature.geometry;
        } else {
            console.warn(`UGC ${ugcCode} not found in ${state}.geojson.gz`);
            return null;
        }
    }

    const displayPopup = (message: string, location: L.LatLngExpression) => {
        openedPopup?.remove();

        openedPopup = new L.Popup({ autoClose: false, closeOnClick: false })
            .setLatLng(location)
            .setContent(message)
            .openOn(map);
    };

    function setDivElement(node: HTMLDivElement, alert: DisplayedAlert) {
        alert.divElement = node;
        return {
            destroy() {
                alert.divElement = null;
            },
        };
    }

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
            alert.isHighlighted = true;
            displayedAlerts = [...displayedAlerts];
        }
    };

    const unHighlightAlert = (alert: DisplayedAlert) => {
        if (alert.isAddedToMap) {
            for (let layer of alert.layers) {
                layer.setStyle({ weight: 2 });
            }

            alert.isHighlighted = false;
            displayedAlerts = [...displayedAlerts];
        }
    };

    async function loadAlerts() {
        // Clear the map
        removeAllMapFeatures();
        allAlerts = [];
        displayedAlerts = [];
        lastRefresh = null;

        // TODO Revisit pulling older alerts
        //const fetchURL = 'https://api.weather.gov/alerts?start=' + radarCalendarStart.toISOString() + "&end=" + radarCalendarEnd.toISOString();
        //console.log("Fetching from: ", fetchURL);
        const fetchURL = 'https://api.weather.gov/alerts/active';

        try {
            const response = await fetch(fetchURL);
            const data = await response.json();
            const nwsAlerts: NWSAlert[] = data.features;

            lastRefresh = new Date();
            const temporaryListOfAlerts: DisplayedAlert[] = [];

            for (const nwsAlert of nwsAlerts) {
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
                    ends: new Date(nwsAlert.properties.ends),
                    sender: nwsAlert.properties.sender,
                    senderName: nwsAlert.properties.senderName,
                    certainty: nwsAlert.properties.certainty,
                    category: nwsAlert.properties.category,
                    instruction: nwsAlert.properties.instruction,
                    messageType: nwsAlert.properties.messageType,
                    urgency: nwsAlert.properties.urgency,
                    status: nwsAlert.properties.status,
                    layers: [],
                    isAddedToMap: true,
                    isHighlighted: false,
                };

                const color = colorFromSeverity(nwsAlert.properties.severity);

                if (nwsAlert.geometry?.type === 'Polygon') {
                    for (const coordinate of nwsAlert.geometry.coordinates) {
                        const track: L.LatLngExpression[] = coordinate.map(
                            (point: number[]) => [point[1], point[0]], // swap lat/lon
                        );
                        const layer = new L.Polyline(track);
                        alert.layers.push(layer);
                    }
                } else if (nwsAlert.properties.geocode.UGC) {
                    for (const ugcCode of nwsAlert.properties.geocode.UGC) {
                        const geometry = await getGeometryForUGC(ugcCode);
                        if (geometry?.type === 'Polygon') {
                            const coordinates = (geometry as GeoJSON.Polygon).coordinates;
                            for (const coordinate of coordinates) {
                                const track: L.LatLngExpression[] = coordinate.map(
                                    (point: number[]) => [point[1], point[0]],
                                );
                                const layer = new L.Polyline(track);
                                alert.layers.push(layer);
                            }
                        } else {
                            console.warn(
                                `Unsupported geometry type or missing geometry for ${ugcCode}`,
                            );
                        }
                    }
                } else {
                    console.log('Unsupported alert: ', nwsAlert);
                    continue;
                }

                temporaryListOfAlerts.push(alert);

                for (const layer of alert.layers) {
                    layer.setStyle({ color, weight: 2 });

                    layer.on('mouseover', () => highlightAlert(alert));
                    layer.on('mouseout', () => unHighlightAlert(alert));

                    layer.on('click', () => {
                        displayPopup(alert.description, layer.getBounds().getCenter());
                        alert.divElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });

                    map.addLayer(layer);

                    alert.center = layer.getCenter();
                    alert.bounds = layer.getBounds();
                }
            }

            allAlerts = temporaryListOfAlerts.sort((a, b) => a.severityLevel - b.severityLevel);
            filtersChanged();
        } catch (reason) {
            lastRefresh = null;
            timeAgo = 'Error fetching alerts. Try again later.';
            console.error(reason);
        }
    }

    const removeAllMapFeatures = () => {
        openedPopup?.remove();

        // Remove all of our alert layers
        for (var alert of allAlerts) {
            if (!alert.isAddedToMap) {
                continue;
            }
            for (var layer of alert.layers) {
                layer.removeFrom(map);
            }
            alert.isAddedToMap = false;
        }
    };

    const filtersChanged = () => {
        let anyChanges = false;
        let includedAlerts = [];
        const targetTimestamp = new Date();
        // const targetTimestamp = radarTimestamp; TODO Disabled radar timestamp based filtering
        for (let alert of allAlerts) {
            if (
                alert.effective <= targetTimestamp &&
                alert.expires >= targetTimestamp &&
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
        // filtersChanged(); // TODO Disabled radar timestamp based filtering
    };

    const radarCalendarChanged = (info: any) => {
        console.log(info);
        let calendarChanged = false;
        let calendarStart = new Date(info.start);
        if (radarCalendarStart.getTime() !== calendarStart.getTime()) {
            radarCalendarStart = calendarStart;
            calendarChanged = true;
            console.log('Calendar Start: ', calendarStart);
        }

        let calendarEnd = new Date(info.end);
        if (radarCalendarEnd.getTime() !== calendarEnd.getTime()) {
            radarCalendarEnd = calendarEnd;
            calendarChanged = true;
            console.log('Calendar End: ', calendarEnd);
        }
    };

    export const onopen = () => {
        loadAlerts();
    };

    onMount(() => {
        map.on('zoomend', mapMoved);
        map.on('moveend', mapMoved);
        store.on('radarTimestamp', time => radarTimestampChanged(time));
        store.on('radarCalendar', info => radarCalendarChanged(info));
        radarCalendarChanged(store.get('radarCalendar'));

        // Intercept single clicks and do nothing so the Windy picker doesn't come up
        singleclick.on(name, ev => {});
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
        padding-left: 10px;
    }
    .highlightedAlert {
        border-left: 10px solid;
        padding-left: 5px;
    }
    .mobile-alert-ui {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        overflow: auto;
    }
    .noWrap {
        text-wrap: nowrap;
    }
    .hasTitle {
        text-decoration: underline dotted;
    }
</style>
