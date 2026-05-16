<div class="alert-header mb-10">
    <div class="alert-header-divider"></div>
    <div class="alert-header-location size-s">
        <span class="alert-header-icon" aria-hidden="true">{@html locationSvg}</span>
        <span class="alert-header-location-label">{locationLabel}</span>
    </div>
    <div class="alert-header-actions">
        <button
            class="alert-header-button size-s"
            class:alert-header-button--active={showFilters}
            type="button"
            on:click={toggleFiltersVisibility}
        >
            <span class="alert-header-icon" aria-hidden="true">{@html filterSvg}</span>
            <span>Filters</span>
        </button>
        <button
            class="alert-header-button size-s"
            type="button"
            on:click={onRefresh}
        >
            <span class="alert-header-icon" aria-hidden="true">{@html refreshSvg}</span>
            <span>{timeAgo}</span>
        </button>
    </div>

    {#if showFilters}
        <div class="filter-list">
            <div
                class="noWrap checkbox {filters.includeStormEvents ? '' : 'checkbox--off'}"
                on:click={() => toggleFilter('includeStormEvents')}
            >
                Storms & Tornados
            </div>
            <div
                class="noWrap checkbox {filters.includeWindEvents ? '' : 'checkbox--off'}"
                on:click={() => toggleFilter('includeWindEvents')}
            >
                Wind & Dust
            </div>
            <div
                class="noWrap checkbox {filters.includeFloodEvents ? '' : 'checkbox--off'}"
                on:click={() => toggleFilter('includeFloodEvents')}
            >
                Floods
            </div>
            <div
                class="noWrap checkbox {filters.includeWinterEvents ? '' : 'checkbox--off'}"
                on:click={() => toggleFilter('includeWinterEvents')}
            >
                Winter & Snow
            </div>
            <div
                class="noWrap checkbox {filters.includeOtherEvents ? '' : 'checkbox--off'}"
                on:click={() => toggleFilter('includeOtherEvents')}
            >
                Other
            </div>
        </div>
    {/if}
    <div class="alert-header-divider"></div>
</div>

<script lang="ts">
    import filterIcon from '../resources/filter.svg';
    import locationIcon from '../resources/location.svg';
    import refreshIcon from '../resources/refresh.svg';
    import type { AlertFilterState } from '../scripts/alertTypes';

    type FilterKey = keyof AlertFilterState;

    export let filters: AlertFilterState;
    export let timeAgo: string;
    export let locationLabel: string;
    export let onRefresh: () => void;
    export let onFiltersChange: (filters: AlertFilterState) => void;

    let showFilters = false;
    const filterSvg = normalizeSvg(filterIcon);
    const locationSvg = normalizeSvg(locationIcon);
    const refreshSvg = normalizeSvg(refreshIcon);

    /** Removes document-level SVG text so bundled local icons can render inline in HTML. */
    function normalizeSvg(svg: string): string {
        return svg
            .replace(/<\?xml[\s\S]*?\?>/u, '')
            .replace(/<!DOCTYPE[\s\S]*?>/iu, '')
            .replace(/<!--[\s\S]*?-->/gu, '')
            .replace(/(fill|stroke)="(?!none\b)[^"]*"/giu, '$1="currentColor"')
            .trim();
    }

    /** Toggles the collapsed filter panel below the alert header. */
    function toggleFiltersVisibility(): void {
        showFilters = !showFilters;
    }

    /** Emits a new immutable filter state with the requested category toggled. */
    function toggleFilter(key: FilterKey): void {
        onFiltersChange({
            ...filters,
            [key]: !filters[key],
        });
    }
</script>
