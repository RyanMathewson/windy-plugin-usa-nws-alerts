<div class="menu-top rounded-box rounded-box--with-border mm-section mb-10">
    <div class="mb-10 refresh-row">
        <div
            class="button button--variant-orange size-s"
            on:click={onRefresh}
        >
            Refresh
        </div>
        <div class="size-s">
            Last Refresh: {timeAgo}
        </div>
    </div>
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
</div>

<script lang="ts">
    import type { AlertFilterState } from '../scripts/alertTypes';

    type FilterKey = keyof AlertFilterState;

    export let filters: AlertFilterState;
    export let timeAgo: string;
    export let onRefresh: () => void;
    export let onFiltersChange: (filters: AlertFilterState) => void;

    /** Emits a new immutable filter state with the requested category toggled. */
    function toggleFilter(key: FilterKey): void {
        onFiltersChange({
            ...filters,
            [key]: !filters[key],
        });
    }
</script>
