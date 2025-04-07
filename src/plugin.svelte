{#if isMobileOrTablet}
    <section class="mobile-alert-ui horizontal-scroll">
        {#each filteredAlerts as alert}
            <div
                class="alert mr-20 size-xs clickable"
                style:border-left-color={colorFromSeverity(alert.severity)}
                on:click={() => console.log(alert.description)}
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
        <div class="mb-30 centered">
            <div
                class="button button--variant-orange size-s"
                on:click={() => bcast.emit('rqstOpen', 'menu')}
            >
                Back to menu
            </div>
        </div>
        {#each filteredAlerts as alert}
            <div
                class="alert mb-20 size-xs clickable"
                style:border-left-color={colorFromSeverity(alert.severity)}
                on:click={() => console.log(alert.description)}
            >
                <div class="size-l mb-5">
                    {alert.event}
                </div>
                <div>
                    Severity: {alert.severity}
                </div>
                <div>
                    Headline: {alert.headline}°
                </div>
                <div>
                    Area: {alert.areaDesc}
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

    // IMPORTANT: all types must be imported as `type` otherwise
    // Svelte TS compiler will fail
    import type { NWSAlert } from './nws';

    interface DisplayedAlert {
        severity: string;
        description: string;
        event: string;
        headline: string;
        areaDesc: string;
        layers: L.Polyline[];
        center?: L.LatLng;
        bounds?: L.LatLngBounds;
    }

    let lines: L.Polyline[] = [];
    let allAlerts: DisplayedAlert[] = [];
    let filteredAlerts: DisplayedAlert[] = [];
    let openedPopup: L.Popup | null = null;

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

    const loadResults = () => {
        fetch('https://api.weather.gov/alerts/active')
            .then(response => response.json())
            .then(result => result.features)
            .then((nwsAlerts: NWSAlert[]) => {
                // Clear the map
                removeAllMapFeatures();

                const temporaryListOfAlerts: DisplayedAlert[] = [];

                for (var nwsAlert of nwsAlerts) {
                    if (nwsAlert.geometry == null || nwsAlert.geometry.type !== 'Polygon') {
                        continue; // Unsupported alert
                    }

                    const alert: DisplayedAlert = {
                        severity: nwsAlert.properties.severity,
                        event: nwsAlert.properties.event,
                        description: nwsAlert.properties.description,
                        areaDesc: nwsAlert.properties.areaDesc,
                        headline: nwsAlert.properties.headline,
                        layers: [],
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

                        layer.on('click', () => displayPopup(description, layer.getCenter()));

                        lines.push(layer);

                        layer.addTo(map);

                        alert.layers.push(layer);

                        // TODO We are only saving these from the last layer
                        alert.center = layer.getCenter();
                        alert.bounds = layer.getBounds();
                    }
                }

                // Update our local list of alerts
                allAlerts = temporaryListOfAlerts;

                refreshAlertList();
            })
            .catch(console.error);
    };

    const removeAllMapFeatures = () => {
        openedPopup?.remove();
        lines.forEach(l => map.removeLayer(l));
        lines = [];
    };

    const refreshAlertList = () => {
        const mapBounds = map.getBounds();
        filteredAlerts = allAlerts.filter(alert => alert.bounds && mapBounds.contains(alert.bounds));
    }

    export const onopen = () => {
        loadResults();
    };

    onMount(() => {
        map.on('zoomend', refreshAlertList);
        map.on('moveend', refreshAlertList);
    });

    onDestroy(() => {
        removeAllMapFeatures();
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
