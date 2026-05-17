<div class="alert-header mb-10">
    <div class="alert-header-divider"></div>
    <div class="alert-header-location size-s">
        <span class="alert-header-icon" aria-hidden="true">{@html locationSvg}</span>
        <span class="alert-header-location-label">{locationLabel}</span>
    </div>
    <div class="alert-header-actions">
        <button
            class="alert-header-button size-s"
            class:alert-header-button--active={filtersVisible}
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
    <div class="alert-header-divider"></div>
</div>

<script lang="ts">
    import filterIcon from '../resources/filter.svg';
    import locationIcon from '../resources/location.svg';
    import refreshIcon from '../resources/refresh.svg';

    export let timeAgo: string;
    export let locationLabel: string;
    export let filtersVisible: boolean;
    export let onRefresh: () => void;
    export let onToggleFilters: () => void;

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
        onToggleFilters();
    }
</script>
