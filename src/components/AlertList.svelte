{#if !selectedLocation}
    <div class="empty-state size-s">
        Click a position on the map to show active alerts for that location.
    </div>
{:else if displayedAlerts.length === 0}
    <div class="empty-state size-s">
        No active alerts for this location.
    </div>
{/if}

{#each displayedAlerts as alert (alert.id)}
    <div
        class="alert alert-row mb-10 size-xs clickable"
        class:highlightedAlert={alert.isHighlighted}
        style:border-left-color={colorFromSeverity(alert.severity)}
        on:click={() => onSelectAlert(alert)}
        on:mouseenter={() => onHighlightAlert(alert)}
        on:mouseleave={() => onUnhighlightAlert(alert)}
    >
        <div class="alert-row-content">
            <div class="size-l">
                {alert.event}
            </div>
            <div class="size-s">
                Expires: {formatDate(alert.expires)}
            </div>
        </div>
        <div class="alert-row-chevron" aria-hidden="true">
            ›
        </div>
    </div>
{/each}

<script lang="ts">
    import { colorFromSeverity, formatDate } from '../scripts/alertUtils';
    import type { DisplayedAlert, SelectedLocation } from '../scripts/alertTypes';

    export let displayedAlerts: DisplayedAlert[];
    export let selectedLocation: SelectedLocation | null;
    export let onSelectAlert: (alert: DisplayedAlert) => void;
    export let onHighlightAlert: (alert: DisplayedAlert) => void;
    export let onUnhighlightAlert: (alert: DisplayedAlert) => void;
</script>
