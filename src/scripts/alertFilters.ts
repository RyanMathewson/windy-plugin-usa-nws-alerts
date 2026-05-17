import type { AlertFilterState, DisplayedAlert } from './alertTypes';

const STORM_ALERT_EVENTS = [
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

const FLOOD_ALERT_EVENTS = [
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

const WIND_ALERT_EVENTS = [
    'Extreme Wind Warning',
    'High Wind Watch',
    'High Wind Warning',
    'Dust Storm Warning',
];

const WINTER_ALERT_EVENTS = [
    'Winter Storm Watch',
    'Winter Storm Warning',
    'Blizzard Warning',
    'Snow Squall Warning',
    'Avalanche Watch',
    'Avalanche Warning',
];

const OTHER_ALERT_EVENTS = [
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

/** Creates the default enabled filter state for all alert categories. */
export function createDefaultAlertFilters(): AlertFilterState {
    return {
        includeStormEvents: true,
        includeFloodEvents: true,
        includeWindEvents: true,
        includeWinterEvents: true,
        includeOtherEvents: true,
    };
}

/** Returns only alerts enabled by the current category filter state. */
export function filterAlerts(alerts: DisplayedAlert[], filters: AlertFilterState): DisplayedAlert[] {
    return alerts.filter(alert => isAlertIncluded(alert, filters));
}

/** Returns true when an alert event belongs to an enabled category. */
export function isAlertIncluded(alert: DisplayedAlert, filters: AlertFilterState): boolean {
    return (
        (filters.includeFloodEvents && FLOOD_ALERT_EVENTS.includes(alert.event)) ||
        (filters.includeStormEvents && STORM_ALERT_EVENTS.includes(alert.event)) ||
        (filters.includeWindEvents && WIND_ALERT_EVENTS.includes(alert.event)) ||
        (filters.includeWinterEvents && WINTER_ALERT_EVENTS.includes(alert.event)) ||
        (filters.includeOtherEvents && OTHER_ALERT_EVENTS.includes(alert.event))
    );
}
