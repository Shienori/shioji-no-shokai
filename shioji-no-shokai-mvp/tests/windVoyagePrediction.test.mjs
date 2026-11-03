import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
let passed = 0, failed = 0;
const near = (a, b, tolerance = 1e-6) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const test = (name, run) => {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`, error); }
};
try {
  const { predictSavedWindVoyage: predict } = await server.ssrLoadModule('/src/domain/windVoyagePrediction.ts');
  const { routes } = await server.ssrLoadModule('/src/data/routes.ts');
  const { getRouteWindLegs } = await server.ssrLoadModule('/src/domain/routeWind.ts');
  const { getPortHexId, getHexById } = await server.ssrLoadModule('/src/data/hexMap.ts');
  const { createContractWindForecast, getSavedWindForecastAt } = await server.ssrLoadModule('/src/domain/contractWindForecast.ts');
  const { getWindForecastIssueTime } = await server.ssrLoadModule('/src/domain/windForecast.ts');
  const { calculateFuelRate } = await server.ssrLoadModule('/src/domain/shipPerformance.ts');
  const { advanceWindNavigation } = await server.ssrLoadModule('/src/domain/windNavigation.ts');
  const { GAME_TIME_MULTIPLIER: acceleration } = await server.ssrLoadModule('/src/data/gameConstants.ts');
  const HOUR = 3600000;
  const T = getWindForecastIssueTime(Date.UTC(2026, 10, 2));
  const route = routes[0];
  const legs = getRouteWindLegs(route);
  const distance = legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
  const calmSnapshot = (r = route) => {
    const snapshot = createContractWindForecast(r, T);
    for (const rows of Object.values(snapshot.forecastsByHex)) for (const slot of rows) slot.forecastWind = { speedMps: 0, fromDeg: null };
    return snapshot;
  };
  const options = (overrides = {}) => ({
    route, snapshot: calmSnapshot(), departureRealTime: T,
    state: { processedRealTime: T, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: 10000, totalFuelUsed: 0 },
    selectedSpeedKnots: 6, loadSpeedFactor: 1, referenceFuelPerVoyageHour: 0.2, referenceSpeedKnots: 6,
    ...overrides,
  });
  test('all actual routes share analytic calm ETA and destination position', () => {
    for (const r of routes) {
      const d = getRouteWindLegs(r).reduce((sum, leg) => sum + leg.distanceNm, 0);
      const eta = T + d / 6 / acceleration * HOUR;
      const result = predict(options({ route: r, snapshot: calmSnapshot(r) }), eta);
      assert.equal(result.forecastStatus, 'arrived');
      near(result.etaRealTime, eta, 0.01);
      assert.equal(result.positionStatus, 'arrived');
      assert.equal(result.position.hexId, getPortHexId(r.toPortId));
      assert.equal(result.position.routeProgress, 1);
      near(result.totalForecastFuelUsed, d / 6 * 0.2);
    }
  });
  test('specified time gives distance progress and interpolated axial position', () => {
    const result = predict(options(), T + HOUR / acceleration);
    near(result.position.distanceTravelledNm, 6);
    near(result.position.legProgress, 6 / legs[0].distanceNm);
    near(result.position.routeProgress, 6 / distance);
    const a = getHexById(legs[0].hexId), b = getHexById(legs[0].nextHexId);
    near(result.position.axial.q, a.q + (b.q - a.q) * result.position.legProgress);
    near(result.position.axial.r, a.r + (b.r - a.r) * result.position.legProgress);
  });
  test('before departure stays at origin without consuming loading-period fuel', () => {
    const result = predict(options(), T - 1000);
    assert.equal(result.positionStatus, 'notDeparted');
    assert.equal(result.position.hexId, getPortHexId(route.fromPortId));
    assert.equal(result.position.routeProgress, 0);
    assert.equal(result.checkpoint.fuelRemaining, 10000);
  });
  test('speed and load affect ETA and fuel through the same navigation model', () => {
    for (const speed of [6, 7]) for (const load of [1, 0.9]) {
      const result = predict(options({ selectedSpeedKnots: speed, loadSpeedFactor: load }), T);
      near(result.etaRealTime, T + distance / (speed * load) / acceleration * HOUR, 0.01);
      near(result.totalForecastFuelUsed, distance / (speed * load) * calculateFuelRate(speed, 0.2, 6));
    }
  });
  test('wind change inside a HEX matches independent saved-forecast integration', () => {
    const input = options();
    input.departureRealTime = T + 2 * HOUR - 300000;
    input.state.processedRealTime = input.departureRealTime;
    for (const leg of legs) for (const slot of input.snapshot.forecastsByHex[leg.hexId]) {
      if (slot.startsAt >= T + 2 * HOUR) slot.forecastWind = { speedMps: 10, fromDeg: leg.headingDeg };
    }
    const at = T + 2 * HOUR + 100000;
    const independent = advanceWindNavigation({
      legs, state: input.state, selectedSpeedKnots: 6, loadSpeedFactor: 1,
      referenceFuelPerVoyageHour: 0.2, referenceSpeedKnots: 6, untilRealTime: at,
      readWind: (id, t) => { const slot = getSavedWindForecastAt(input.snapshot, id, Math.floor(t)); return slot ? { wind: slot.forecastWind, startsAt: slot.startsAt, endsAt: slot.endsAt } : null; },
    });
    const result = predict(input, at);
    near(result.checkpoint.distanceIntoLegNm, independent.state.distanceIntoLegNm);
    near(result.checkpoint.totalFuelUsed, independent.state.totalFuelUsed);
    assert.equal(result.checkpoint.legIndex, independent.state.legIndex);
  });
  test('resumed checkpoint preserves ETA and cannot be rewound', () => {
    const input = options();
    const mid = predict(input, T + HOUR / acceleration);
    const resumed = { ...input, state: mid.checkpoint };
    near(predict(resumed, T + 2 * HOUR / acceleration).etaRealTime, predict(input, T).etaRealTime, 0.01);
    assert.throws(() => predict(resumed, T));
  });
  test('fuel shortage gives null ETA and holds the predicted stopping position', () => {
    const input = options({ state: { processedRealTime: T, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: 0.01, totalFuelUsed: 0 } });
    const a = predict(input, T + 60000), b = predict(input, T + HOUR);
    assert.equal(a.etaRealTime, null);
    assert.equal(a.forecastIssue, 'insufficientFuel');
    assert.equal(a.positionStatus, 'fuelDepleted');
    assert.equal(a.checkpoint.fuelRemaining, 0);
    near(a.position.distanceTravelledNm, 0.3);
    assert.deepEqual(a.checkpoint, b.checkpoint);
    assert.deepEqual(a.position, b.position);
  });
  test('simultaneous arrival and exhaustion is arrival, with no post-arrival debit', () => {
    const input = options({ referenceFuelPerVoyageHour: 6, state: { processedRealTime: T, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: distance, totalFuelUsed: 0 } });
    const eta = T + distance / 6 / acceleration * HOUR;
    const a = predict(input, eta), b = predict(input, eta + HOUR);
    assert.equal(a.positionStatus, 'arrived');
    near(a.checkpoint.fuelRemaining, 0);
    assert.deepEqual(a.checkpoint, b.checkpoint);
  });
  test('missing and invalid forecasts never invent ETA or a later position', () => {
    for (const snapshot of [null, { ...calmSnapshot(), schemaVersion: 99 }]) {
      const result = predict(options({ snapshot }), T + 1000);
      assert.equal(result.etaRealTime, null);
      assert.equal(result.positionStatus, 'forecastUnavailable');
      assert.equal(result.position, null);
      assert.equal(result.lastKnownPosition.hexId, getPortHexId(route.fromPortId));
      assert.equal(result.checkpoint.fuelRemaining, 10000);
    }
  });
  test('wrong route and out-of-coverage checkpoint do not use another forecast', () => {
    const wrong = predict(options({ snapshot: { ...calmSnapshot(), routeId: 'other_route' } }), T + 1);
    assert.equal(wrong.etaRealTime, null);
    const snapshot = calmSnapshot();
    const later = snapshot.validTo + 1;
    const result = predict(options({ snapshot, departureRealTime: later, state: { processedRealTime: later, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: 10000, totalFuelUsed: 0 } }), later + 1);
    assert.equal(result.forecastIssue, 'outsideForecast');
    assert.equal(result.position, null);
  });
  test('forecast horizon separates last known position from unknown requested time', () => {
    const input = options({ selectedSpeedKnots: 0.001 });
    const result = predict(input, input.snapshot.validTo + 1);
    assert.equal(result.etaRealTime, null);
    assert.equal(result.forecastIssue, 'forecastHorizon');
    assert.equal(result.position, null);
    assert.equal(result.positionStatus, 'forecastUnavailable');
    assert.ok(result.lastKnownPosition.routeProgress < 1);
    assert.equal(result.checkpoint.processedRealTime, input.snapshot.validTo);
  });
  test('fractional times, repeated calls and input/output independence', () => {
    const input = options({ departureRealTime: T + 0.5, state: { processedRealTime: T + 0.5, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: 10000, totalFuelUsed: 0 } });
    const before = JSON.stringify(input);
    const at = T + HOUR / acceleration + 0.75;
    const a = predict(input, at), b = predict(input, at);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(input), before);
    a.checkpoint.fuelRemaining = -99;
    a.position.axial.q = 999;
    assert.deepEqual(predict(input, at), b);
    assert.equal(JSON.stringify(input), before);
  });
  test('invalid time and checkpoint fail even when forecast is missing', () => {
    assert.throws(() => predict(options(), NaN));
    assert.throws(() => predict(options({ departureRealTime: Infinity }), T));
    assert.throws(() => predict(options({ state: { ...options().state, processedRealTime: T - 1 } }), T));
    assert.throws(() => predict(options({ snapshot: null, state: { ...options().state, fuelRemaining: -1 } }), T));
  });
  const source = await readFile(new URL('../src/domain/windVoyagePrediction.ts', import.meta.url), 'utf8');
  test('prediction module has no actual-wind, clock or forecast-generation calls', () => {
    assert.ok(!/\b(getWindAt|createContractWindForecast|Date\.now|Math\.random)\s*\(/.test(source));
  });
} finally { await server.close(); }
console.log(JSON.stringify({ passed, failed }));
if (failed) process.exitCode = 1;
