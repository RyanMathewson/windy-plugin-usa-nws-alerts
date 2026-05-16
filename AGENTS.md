# Repository Guidelines

## Project Overview

This repository contains a Windy map plugin that surfaces active USA National Weather Service severe weather alerts. It is built with Svelte and TypeScript and renders NWS alert geometries as Leaflet layers on the Windy map. Windy plugin documentation is available at <https://docs.windy-plugins.com/getting-started/>.

## Commands

- `npm install`: install dependencies.
- `npm run start`: run Rollup in watch mode with Windy plugin dev server support.
- `npm run build`: build production artifacts into `dist/`.
- `npx eslint src/`: run linting. There are no automated tests currently documented.

## Architecture

- `src/plugin.svelte`: main plugin component, including alert fetching, filtering, rendering, and UI.
- `src/pluginConfig.ts`: Windy plugin metadata and desktop/mobile UI registration.
- `src/nws.d.ts`: NWS GeoJSON API response types.
- `src/zoneGeometry.ts`: alert geometry and zone polygon helpers.
- `data/zone-geometries.json`: generated zone geometry data.
- `scripts/generate-zone-data.mjs`: generates zone geometry data.
- `scripts/validate-zone-coverage.mjs`: validates zone coverage data.
- `declarations/`: Windy/Leaflet type declarations and patches.
- `rollup.config.js`: Rollup build pipeline for TypeScript, Svelte, SWC, minification, and optional dev serving.

Windy provides the global host APIs, including `W` and `L`. Windy imports use `@windy/*` path mappings from `@windycom/plugin-devtools`.

## Runtime Flow

1. The plugin opens and fetches active NWS alerts from `https://api.weather.gov/alerts/active`.
2. NWS GeoJSON features are parsed into displayed alert objects.
3. Alerts are sorted by severity.
4. Category filters narrow alerts into the filtered set.
5. Viewport filtering limits the visible list and map layers to the current map bounds.
6. Leaflet polylines are added, highlighted, focused, and removed as plugin state changes.

## Development Notes

- Keep changes small and aligned with the single-component plugin structure unless a refactor is directly needed.
- Preserve Svelte and TypeScript strictness from `tsconfig.json`.
- Use Windy UI classes and existing styling conventions before introducing new UI patterns.
- Clean up Leaflet layers, event listeners, timers, and subscriptions when changing lifecycle behavior.
- Avoid committing generated `dist/` output unless the task explicitly asks for release artifacts.

## Verification

For behavior changes, run `npm run build` at minimum. For source-only checks, run `npx eslint src/` when dependencies are installed.
