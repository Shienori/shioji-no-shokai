# Coastal wind timeline: additive integration

Base: 503cfd05a5bbda8124e6a832f973d0895a1a9682. Branch: feature/coastal-wind-timeline.

## Scope
- New getWindAt/getWindTimeline APIs in src/domain/windTimeline.ts share seaCondition.ts's epoch-aligned 2-real-hour slots and 7-day horizon.
- Existing seaCondition APIs, voyage progress, forecast storage, UI, fuel, contracts, saves and their version are NOT changed. This commit does not activate new wind physics in sailing. No forecast is silently treated as actual weather.
- Background generation: speed 0/2/5/7/10 m/s at 10/20/35/25/10 percent thresholds, eight equiprobable wind-from bearings; deterministic independent component seeds, model wind-v2-coastal-1.
- Diurnal component: sinusoid, zero at 08/20, sea-breeze peak 3 m/s at 14, land-breeze peak 1.5 m/s at 02. Fixed world UTC+8, independent of device timezone and voyage 6x acceleration. Values are sampled at slot midpoints, not continuously updated.
- Land cells within 3 axial steps are averaged with inverse-square distance weights. Nearest-land attenuation 1/.6/.3/0. This is a game approximation, not resolved coastal meteorology. Corner vectors are averaged without renormalizing.
- Strong background wind suppresses the coastal component; final wind is vector-added and NOT snapped to eight directions or clamped at 10 m/s. Wind-from bearing is clockwise from north.
- IMPORTANT: HexMap.tsx screen y=-1.5*size*r; with screen-up=north, world north=+1.5*r. Earlier standalone draft used the opposite north sign. This commit follows the actual renderer, without rotating the map. Historical descriptive north/south labels must not override the rendered geometry.
- Non-aligned 7-day requests return 85 complete intersecting slots; aligned requests return 84. Returned values are fresh objects. Ports are rejected as weather cells.

## Run tests (from shioji-no-shokai-mvp)
    node tests/coastalWindTimeline.test.mjs
    npm run build

Tests load the actual TypeScript and current map through existing Vite SSR test style. No package changes or CI/workflow changes.

## Verification status before commit
Source prepared; local core-runtime check is reported separately from repository Vite integration tests. Full TypeScript/build, Vite integration tests, production deployment and screen checks are pending until run in the project environment.

## Next steps
Define numeric-wind forecast error semantics, migrate forecast/save formats explicitly, then connect heading-aware wind resistance, fuel accounting and UI together with their own tests. Do not stack old seaConditionSpeedMultiplier on the new wind model.
