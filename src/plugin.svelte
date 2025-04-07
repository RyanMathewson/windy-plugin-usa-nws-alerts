{#if isMobileOrTablet}
    <section class="mobile-alert-ui horizontal-scroll">
        {#each listOfAlerts as alert}
            <div
                class="alert mr-20 size-xs clickable"
                style:border-left-color={colorFromSeverity(alert.severity)}
                on:click={() => console.log(alert.description)}
            >
                <div class="alert__name size-l mb-5">
                    {alert.event}
                </div>
                <div class="alert__heading nowrap">
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
        {#each listOfAlerts as alert}
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
    import { onDestroy } from 'svelte';

    // IMPORTANT: all types must be imported as `type` otherwise
    // Svelte TS compiler will fail
    import type { NWSAlert } from './nws';

    interface DisplayedAlert {
        severity: string;
        description: string;
        event: string;
        headline: string;
        areaDesc: string;
    };

    let lines: L.Polyline[] = [];
    let listOfAlerts: DisplayedAlert[] = [];
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
        if(severity === "Extreme"){
            hue = 300; // Purple
        }else if(severity === "Severe"){
            hue = 0; // Red
        }else if(severity === "Moderate"){
            hue = 59; // Yellow
        }else if(severity === "Minor"){
            hue = 147; // Green
        }else{
            hue = 214; // Blue
        }
        
        const color = `hsl(${hue}, 100%, 50%)`;
        return color;
    }

    const loadResults = () => {
        fetch('https://api.weather.gov/alerts/active')
            .then(response => response.json())
            .then(result => result.features)
            .then((alerts: NWSAlert[]) => {

                const temporaryListOfAlerts: DisplayedAlert[] = [];

                for(var i = 0; i < alerts.length; i++){

                    var alert = alerts[i];
                    if(alert.properties.event === "Severe Thunderstorm Watch" || 
                       alert.properties.event === "Severe Thunderstorm Warning" ||
                       alert.properties.event === "Severe Weather Statement" ||
                       alert.properties.event === "Tornado Watch" ||
                       alert.properties.event === "Tornado Warning"){
                        // Good
                    }else{
                        //continue;
                    }

                    if(alert.geometry && alert.geometry.type == "Polygon"){
                        const color = colorFromSeverity(alert.properties.severity);
                        for(var j = 0; j < alert.geometry.coordinates.length; j++){
                            const track: L.LatLngExpression[] = [];
                            for(var k = 0; k < alert.geometry.coordinates[j].length; k++){
                                const point = alert.geometry.coordinates[j][k];
                                track.push([point[1], point[0]]); // Swap coordinates to match what Windy expects
                            }
                            const layer = new L.Polyline(track, {
                                color,
                                weight: 2,                                
                            });

                            layer.on('mouseover', () => layer.setStyle({ weight: 4 }));
                            layer.on('mouseout', () => layer.setStyle({ weight: 2 }));

                            const description = alert.properties.description;

                            layer.on('click', () => displayPopup(description, layer.getCenter()));

                            lines.push(layer);

                            layer.addTo(map);

                            const displayedAlert: DisplayedAlert = {
                                severity: alert.properties.severity,
                                event: alert.properties.event,
                                description: alert.properties.description,
                                areaDesc: alert.properties.areaDesc,
                                headline: alert.properties.headline,
                            };

                            temporaryListOfAlerts.push(displayedAlert);
                        }
                    }
                }

                listOfAlerts = temporaryListOfAlerts;
            })
            .catch(console.error);
    };

    const removeAllMapFeatures = () => {
        openedPopup?.remove();
        lines.forEach(l => map.removeLayer(l));
        lines = [];
    };

    export const onopen = () => {
        loadResults();
    };

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
