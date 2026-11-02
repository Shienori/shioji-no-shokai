import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();
let writes = 0;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => { writes++; storage.set(key, String(value)); },
  removeItem: key => storage.delete(key),
} });
const originalNow = Date.now;
const start = 1792599200000;
let now = start;
Date.now = () => now;
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { useGameStore: store } = await server.ssrLoadModule('/src/state/gameStore.ts');
  const { tutorialWheatContract } = await server.ssrLoadModule('/src/data/contracts.ts');
  const { calculateFuelRate } = await server.ssrLoadModule('/src/domain/shipPerformance.ts');
  const { GAME_TIME_MULTIPLIER } = await server.ssrLoadModule('/src/data/gameConstants.ts');
  const { loadGame } = await server.ssrLoadModule('/src/domain/save.ts');
  const seed = structuredClone(store.getState().gameState);
  const id = seed.ships[0].id;
  const checks = [];
  function reset() {
    now = start; storage.clear(); writes = 0;
    const state = structuredClone(seed);
    store.setState({ gameState: state });
    return state;
  }
  const usedBySpeed = [];
  for (const speed of [6, 7]) {
    reset();
    store.getState().acceptContract(tutorialWheatContract.id, id, speed);
    let state = store.getState().gameState;
    assert.ok(state.activeVoyage);
    assert.equal(state.activeVoyage.fuelNavigation.selectedSpeedKnots, speed);
    assert.equal(state.activeVoyage.shipSpeedKnots, speed * state.activeVoyage.fuelNavigation.loadSpeedFactor);
    assert.equal(state.ships[0].cruisingSpeedKnots, 6);
    assert.equal(state.ships[0].maxSpeedKnots, 7);
    assert.equal(state.ships[0].fuel.referenceSpeedKnots, 6);
    const balance = state.ships[0].fuel.remainingTons;
    const fuel = state.ships[0].fuel;
    now = state.activeVoyage.departedRealTime + 1000;
    store.getState().tick();
    state = store.getState().gameState;
    const expected = calculateFuelRate(speed, fuel.referenceConsumptionTonsPerVoyageHour, fuel.referenceSpeedKnots) * GAME_TIME_MULTIPLIER / 3600;
    const used = balance - state.ships[0].fuel.remainingTons;
    assert.ok(Math.abs(used - expected) < 1e-10);
    usedBySpeed.push(used);
    assert.equal(loadGame().activeVoyage.fuelNavigation.selectedSpeedKnots, speed);
    const before = state.ships[0].fuel.remainingTons;
    store.setState({ gameState: loadGame() });
    store.getState().tick();
    assert.equal(store.getState().gameState.ships[0].fuel.remainingTons, before);
  }
  assert.ok(usedBySpeed[1] > usedBySpeed[0]);
  checks.push('6 and 7 knots reach actual voyage and fuel rate; original ship specification retained; settings survive reload without double debit');
  for (const speed of [0, -1, 1, 5, 6.5, 8, NaN, Infinity, null, '7']) {
    const before = reset();
    store.getState().acceptContract(tutorialWheatContract.id, id, speed);
    assert.equal(store.getState().gameState, before);
    assert.equal(writes, 0);
  }
  checks.push('noninteger, nonnumeric and out-of-range engine settings rejected before saving');
  reset();
  store.getState().acceptContract(tutorialWheatContract.id, id);
  assert.equal(store.getState().gameState.activeVoyage.fuelNavigation.selectedSpeedKnots, 6);
  checks.push('old two-argument acceptance defaults to cruising speed');
  reset();
  store.getState().acceptContract(tutorialWheatContract.id, id, 7);
  const accepted = store.getState().gameState;
  store.getState().acceptContract(tutorialWheatContract.id, id, 6);
  assert.equal(store.getState().gameState, accepted);
  assert.equal(accepted.activeVoyage.fuelNavigation.selectedSpeedKnots, 7);
  checks.push('second acceptance cannot alter committed voyage setting');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (server) await server.close();
  Date.now = originalNow;
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
