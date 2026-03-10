# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Development build with watch + HTTPS dev server (port 9999)
npm run watch

# Production build (minified output in dist/)
npm run build
```

There are no automated tests. Linting is via ESLint:
```bash
npx eslint src/
```

## Architecture

This is a [Windy](https://www.windy.com) map plugin built with Svelte + TypeScript that displays active USA National Weather Service (NWS) alerts on a Leaflet map.

### Plugin System
Windy plugins follow a specific pattern:
- Entry point: `src/plugin.svelte` — a single Svelte component that is the entire plugin
- Config: `src/pluginConfig.ts` — declares plugin metadata, UI mode (`rhpane` for desktop, `small` for mobile), and routing
- Built via Rollup → outputs `dist/plugin.js` and `dist/plugin.min.js`
- The `@windycom/plugin-devtools` package provides Windy's type definitions (mapped in tsconfig as `@windy/*`)

Globals `W` (Windy API) and `L` (Leaflet) are provided by the host environment.

### Data Flow
1. `onopen()` → `loadAlerts()` fetches `https://api.weather.gov/alerts/active` (GeoJSON)
2. NWS `FeatureCollection` is parsed into `DisplayedAlert[]` objects, sorted by severity
3. Three-stage filtering pipeline: all alerts → category-filtered (`filteredAlerts`) → viewport-filtered (`displayedAlerts`)
4. `filtersChanged()` handles category toggles (Storms, Floods, Wind, Winter, Other)
5. `mapMoved()` filters by current map bounds for viewport-based display

### Map Layers
- Alert geometries are rendered as Leaflet `Polyline` layers directly on the Windy map
- Each `DisplayedAlert` holds references to its Leaflet layer objects
- `highlightAlert()` / `unHighlightAlert()` modify polyline weight for hover feedback
- All layers and event listeners are cleaned up in `onDestroy()`

### Severity Color Coding
`colorFromSeverity()` maps to HSL: Extreme=Purple, Severe=Red, Moderate=Yellow, Minor=Green, Unknown=Blue. `levelFromSeverity()` returns 1–5 for sort ordering.

### UI
- Desktop: right-hand pane (`rhpane`) — full alert list with filter checkboxes
- Mobile: `small` mode — horizontal scrolling compact cards
- Alert cards are color-coded on their left border by severity

### Key Files
- `src/plugin.svelte` — entire plugin logic and UI (~630 lines)
- `src/pluginConfig.ts` — plugin metadata/registration
- `src/nws.d.ts` — TypeScript types for NWS GeoJSON API response
- `declarations/` — Leaflet type patches and global type declarations
- `rollup.config.js` — build pipeline (TS → SWC → Svelte → minify)

### Publishing
CI publishes via `.github/workflows/publish-plugin.yml` (manual trigger). It builds, merges git metadata into `dist/plugin.json`, and POSTs a tar of `dist/` to `https://node.windy.com/plugins/v1.0/upload` using the `WINDY_API_KEY` secret.
