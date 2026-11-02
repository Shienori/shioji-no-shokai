# Numeric wind forecast, implementation stages 1-3

Base: e462ae526b1860c2e97a3c678a756da76288e345. Branch: feature/wind-forecast-accuracy.

- Joint hit probability 0.8 per issue/HEX/2-hour slot. Direction error <=45 degrees and speed error <=2m/s; comparisons allow 1e-9 numeric tolerance. Direction ignored only when both speeds are strictly below 2m/s. Calm is exactly speed 0 with null bearing.
- Actual final wind (background plus coastal) is the reference. Hit/miss branches are checked by one shared evaluator. Weak/calm edge cases have bounded fallback; no unbounded rejection sampling. The miss fallback may use 180-degree error when ordinary candidates cannot satisfy the category.
- Stable forecast seeds include forecast and actual model versions, issue time, HEX and slot; no ship, contract, call-order or Math.random dependency. PRNG mixing is separate from the existing weather PRNG.
- Issue at world UTC+8 06:00 daily. Caller explicitly supplies issuedAt for future queries. Horizon is [issuedAt, issuedAt+8 days), enabling a rolling seven-day display. Aligned full editions contain 96 slots; partial requests include intersecting complete slots.
- No actual-wind values or hit/miss flags are returned by forecast slot APIs. Prediction creation internally reads deterministic actual wind for the game's error model; future voyage/ETA consumers must use forecastWind, never future actual data.
- Existing tests are unchanged. Contract snapshots, save migration, ETA/fuel physics, UI, and old forecast APIs are not switched by this change.

## Verification
Run from shioji-no-shokai-mvp:

    node tests/windForecastAccuracy.test.mjs
    node tests/windForecastGeneration.test.mjs
    node tests/windForecastTimeline.test.mjs
    node tests/windForecastIntegration.test.mjs
    node tests/coastalWindTimeline.test.mjs
    npm run build

New CI runs only on feature/wind-forecast-accuracy pushes with contents:read and 15-minute timeout, records tested SHA and uploads logs. No auto-commit, merge, production settings, or deployment changes.

Local pre-commit runtime probes use type-erased sources and a synthetic wind reader, not Vite or the real map. Full project tests/build and deployment checks remain pending until CI runs.
