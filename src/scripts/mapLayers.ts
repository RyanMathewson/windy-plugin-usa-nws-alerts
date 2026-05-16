import alertIconSvg from '../resources/alertIcon.svg';
import { colorFromSeverity } from './alertUtils';
import type { DisplayedAlert, SelectedLocation } from './alertTypes';

/** Callback set used when Leaflet alert layers emit user interactions. */
export interface AlertLayerHandlers {
    onMouseOver: (alert: DisplayedAlert) => void;
    onMouseOut: (alert: DisplayedAlert) => void;
    onClick: (ev: unknown) => void;
}

/** Extracts latitude and longitude from Windy or Leaflet click event shapes. */
export function locationFromClickEvent(ev: unknown): SelectedLocation | null {
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

/** Styles and registers interaction handlers for a newly-created alert layer set. */
export function configureAlertLayers(alert: DisplayedAlert, handlers: AlertLayerHandlers): void {
    for (const layer of alert.layers) {
        layer.setStyle({
            className: 'nws-alert-layer',
            color: colorFromSeverity(alert.severity),
            weight: 2,
        });

        layer.on('mouseover', () => handlers.onMouseOver(alert));
        layer.on('mouseout', () => handlers.onMouseOut(alert));
        layer.on('click', handlers.onClick);
    }
}

/** Adds an alert's layers to the map when they are not already visible. */
export function addAlertToMap(alert: DisplayedAlert, mapInstance: L.Map): void {
    if (alert.isAddedToMap) {
        return;
    }

    for (const layer of alert.layers) {
        layer.addTo(mapInstance);
    }
    alert.isAddedToMap = true;
}

/** Removes an alert's layers from the map while preserving registered handlers. */
export function removeAlertFromMap(alert: DisplayedAlert, mapInstance: L.Map): void {
    if (!alert.isAddedToMap) {
        return;
    }

    for (const layer of alert.layers) {
        layer.removeFrom(mapInstance);
    }
    alert.isAddedToMap = false;
}

/** Removes all alert layers and their event handlers from the map. */
export function removeAllAlertLayers(alerts: DisplayedAlert[], mapInstance: L.Map): void {
    for (const alert of alerts) {
        removeAlertHandlers(alert);
        removeAlertFromMap(alert, mapInstance);
    }
}

/** Highlights an alert's map layers and returns true when visible state changed. */
export function highlightAlertLayers(alert: DisplayedAlert): boolean {
    return setAlertHighlight(alert, true, 4);
}

/** Removes highlight styling from an alert's map layers and returns true when changed. */
export function unHighlightAlertLayers(alert: DisplayedAlert): boolean {
    return setAlertHighlight(alert, false, 2);
}

/** Adds or moves the map marker that identifies the selected alert lookup point. */
export function updateSelectedLocationMarker(
    mapInstance: L.Map,
    marker: L.Marker | null,
    location: SelectedLocation,
): L.Marker {
    const latLng: L.LatLngExpression = [location.lat, location.lon];
    if (marker) {
        marker.setLatLng(latLng);
        return marker;
    }

    return L.marker(latLng, {
        icon: L.divIcon({
            className: 'selected-location-pin-icon',
            html: `<div class="selected-location-pin">${alertIconSvg}</div>`,
            iconAnchor: [12, 32],
            iconSize: [24, 32],
        }),
        interactive: false,
    }).addTo(mapInstance);
}

/** Removes the selected-location marker from the map. */
export function removeSelectedLocationMarker(mapInstance: L.Map, marker: L.Marker | null): void {
    if (marker) {
        marker.removeFrom(mapInstance);
    }
}

/** Removes all event handlers registered on an alert's Leaflet layers. */
function removeAlertHandlers(alert: DisplayedAlert): void {
    for (const layer of alert.layers) {
        layer.off();
    }
}

/** Applies the shared highlight style to visible alert layers. */
function setAlertHighlight(alert: DisplayedAlert, isHighlighted: boolean, weight: number): boolean {
    if (!alert.isAddedToMap) {
        return false;
    }

    for (const layer of alert.layers) {
        layer.setStyle({ weight });
    }
    alert.isHighlighted = isHighlighted;
    return true;
}
