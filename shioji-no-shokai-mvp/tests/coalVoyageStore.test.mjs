import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
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
  const { loadGame } = await server.ssrLoadModule('/src/domain/save.ts');
  const { getRouteById } = await server.ssrLoadModule('/src/data/routes.ts');
  const { getPortHexId } = await server.ssrLoadModule('/src/data/hexMap.ts');
  const { advanceWindNavigation } = await server.ssrLoadModule('/src/domain/windNavigation.ts');
  const { GAME_TIME_MULTIPLIER } = await server.ssrLoadModule('/src/data/gameConstants.ts');
  const seed = structuredClone(store.getState().gameState);
  const checks = [];
  function begin(remaining = 5, capacity = 5) {
    now = start; storage.clear();
    const state = structuredClone(seed);
    state.ships[0].fuel.remainingTons = remaining;
    state.ships[0].fuel.capacityTons = capacity;
    store.setState({ gameState: state });
    store.getState().acceptContract(tutorialWheatContract.id, state.ships[0].id);
    return store.getState().gameState;
  }
  function tick(at) { now = at; store.getState().tick(); return store.getState().gameState; }
  let state = begin();
  assert.ok(state.activeVoyage.fuelNavigation);
  const departure = state.activeVoyage.departedRealTime;
  state = tick(departure - 1);
  assert.equal(state.activeVoyage.phase, 'loading');
  assert.equal(state.ships[0].fuel.remainingTons, 5);
  state = tick(departure + 1000);
  assert.equal(state.activeVoyage.phase, 'sailing');
  const expectedUsed = 0.2 * GAME_TIME_MULTIPLIER / 3600;
  assert.ok(Math.abs(state.ships[0].fuel.remainingTons - (5 - expectedUsed)) < 1e-10);
  assert.ok(Math.abs(state.voyageMemos[0].fuelConsumedTons - expectedUsed) < 1e-10);
  const balance = state.ships[0].fuel.remainingTons;
  assert.equal(tick(now).ships[0].fuel.remainingTons, balance);
  store.setState({ gameState: loadGame() });
  assert.equal(tick(now).ships[0].fuel.remainingTons, balance);
  checks.push('new voyage enabled; loading free; sailing consumes; repeated tick and reload do not double debit');

  state = begin(0.001);
  const accepted = structuredClone(state);
  const route = getRouteById(state.acceptedContract.routeId);
  state = tick(state.activeVoyage.departedRealTime + 60000);
  assert.equal(state.activeVoyage, null);
  assert.equal(state.acceptedContract, null);
  assert.equal(state.ships[0].status, 'docked');
  assert.equal(state.ships[0].activeContractId, null);
  assert.equal(state.ships[0].currentPortId, route.fromPortId);
  assert.equal(state.ships[0].currentHexId, getPortHexId(route.fromPortId));
  assert.equal(state.ships[0].fuel.remainingTons, 5);
  assert.equal(state.money, accepted.money);
  assert.deepEqual(state.reputations, accepted.reputations);
  const memo = state.voyageMemos[0];
  assert.equal(memo.settlement, null);
  assert.equal(memo.actualArrivalRealTime, null);
  assert.equal(memo.fuelDepletionReturn.reason, 'fuel_depleted');
  assert.equal(memo.fuelDepletionReturn.fuelRefilledTons, 5);
  assert.ok(Math.abs(memo.fuelConsumedTons - 0.001) < 1e-12);
  assert.ok(Math.abs(memo.fuelDepletionReturn.occurredAtRealTime - (accepted.activeVoyage.departedRealTime + 3000)) < 1);
  const savedMemo = structuredClone(memo);
  store.getState().settleContract();
  assert.equal(store.getState().gameState.money, accepted.money);
  state = tick(now + 1000);
  assert.deepEqual(state.voyageMemos[0], savedMemo);
  assert.deepEqual(loadGame().voyageMemos[0], savedMemo);
  checks.push('depletion cancels once, records exact event, returns and refills free without payout or reputation change');

  state = begin();
  delete state.activeVoyage.fuelNavigation;
  store.setState({ gameState: state });
  state = tick(state.activeVoyage.departedRealTime + 1000);
  assert.equal(state.ships[0].fuel.remainingTons, 5);
  checks.push('legacy active voyage does not gain fuel consumption');

  for (const remaining of [0, -1, NaN]) {
    state = begin(remaining);
    assert.equal(state.activeVoyage, null);
    assert.equal(state.acceptedContract, null);
    assert.equal(storage.size, 0);
  }
  checks.push('zero and invalid balances rejected without save or automatic refill');

  state = begin(100, 100);
  state = tick(start + 2 * 86400000);
  assert.equal(state.activeVoyage.phase, 'completed');
  assert.ok(state.ships[0].fuel.remainingTons < 100);
  const arrivedBalance = state.ships[0].fuel.remainingTons;
  assert.equal(tick(now + 1000).ships[0].fuel.remainingTons, arrivedBalance);
  store.getState().settleContract();
  assert.equal(store.getState().gameState.activeVoyage, null);
  assert.equal(store.getState().gameState.ships[0].fuel.remainingTons, arrivedBalance);
  assert.ok(store.getState().gameState.voyageMemos[0].settlement);
  checks.push('offline jump processes arrival and unloading; no post-arrival consumption; ordinary settlement remains available');

  const leg = accepted.activeVoyage.fuelNavigation.routeLegs[0];
  const tie = advanceWindNavigation({
    legs: [{ ...leg, distanceNm: 6 }],
    state: { processedRealTime: start, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: 0.2, totalFuelUsed: 0 },
    selectedSpeedKnots: 6, loadSpeedFactor: 1, referenceFuelPerVoyageHour: 0.2, referenceSpeedKnots: 6,
    untilRealTime: start + 3600000 / GAME_TIME_MULTIPLIER,
    readWind: () => ({ wind: { speedMps: 0, fromDeg: null }, startsAt: start, endsAt: start + 86400000 }),
  });
  assert.equal(tie.status, 'arrived');
  assert.ok(tie.state.fuelRemaining < 1e-10);
  checks.push('simultaneous final arrival and empty fuel is arrival, not cancellation');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (server) await server.close();
  Date.now = originalNow;
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
