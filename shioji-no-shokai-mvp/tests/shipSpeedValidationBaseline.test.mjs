import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalNow = Date.now;
const storage = new Map();
let writes = 0;
let server;
const now = 1792599200000;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => { writes++; storage.set(key, String(value)); },
  removeItem: key => storage.delete(key),
} });
Date.now = () => now;

try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { useGameStore: store } = await server.ssrLoadModule('/src/state/gameStore.ts');
  const { tutorialWheatContract: contract } = await server.ssrLoadModule('/src/data/contracts.ts');
  const { prepareContractWindPreview: prepare } = await server.ssrLoadModule('/src/domain/contractWindPreview.ts');
  const { createContractWindForecast } = await server.ssrLoadModule('/src/domain/contractWindForecast.ts');
  const { getRouteById } = await server.ssrLoadModule('/src/data/routes.ts');
  const seed = structuredClone(store.getState().gameState);
  assert.equal(seed.ships[0].cruisingSpeedKnots, 6);
  assert.equal(seed.ships[0].maxSpeedKnots, 7);

  function reset(change = () => {}) {
    const state = structuredClone(seed);
    change(state.ships[0]);
    store.setState({ gameState: state });
    storage.clear();
    writes = 0;
    return state;
  }

  function rejected(speed, change = () => {}) {
    const state = reset(change);
    const before = structuredClone(state);
    store.getState().acceptContract(contract.id, state.ships[0].id, speed);
    assert.equal(store.getState().gameState, state);
    assert.deepEqual(store.getState().gameState, before);
    assert.equal(writes, 0);
    assert.equal(storage.size, 0);
  }

  for (const speed of [0, -1, 5, 6.5, 8, NaN, Infinity, -Infinity, null, '7', Number.MAX_SAFE_INTEGER + 1]) rejected(speed);
  for (const cruisingSpeedKnots of [0, -1, 6.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    rejected(7, ship => { ship.cruisingSpeedKnots = cruisingSpeedKnots; });
  }
  for (const maxSpeedKnots of [0, -1, 5, 7.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    rejected(6, ship => { ship.maxSpeedKnots = maxSpeedKnots; });
  }
  rejected(7, ship => { ship.kind = 'sailing'; });
  console.log('PASS invalid settings and specifications preserve state and never save');

  for (const [kind, speed, expected] of [
    ['powered', 6, 6], ['powered', 7, 7], ['powered', undefined, 6],
    ['sailing', 6, 6], ['sailing', undefined, 6],
  ]) {
    const state = reset(ship => { ship.kind = kind; });
    const fuelBefore = structuredClone(state.ships[0].fuel);
    store.getState().acceptContract(contract.id, state.ships[0].id, speed);
    const accepted = store.getState().gameState;
    assert.ok(accepted.activeVoyage);
    assert.ok(accepted.acceptedContract);
    assert.ok(writes > 0);
    assert.equal(accepted.ships[0].cruisingSpeedKnots, 6);
    assert.deepEqual(accepted.ships[0].fuel, fuelBefore);
    if (kind === 'powered') assert.equal(accepted.activeVoyage.fuelNavigation.selectedSpeedKnots, expected);
    else assert.equal(accepted.activeVoyage.fuelNavigation, undefined);
  }
  console.log('PASS valid bounds, omitted speed and sailing default retain existing acceptance');

  const ship = structuredClone(seed.ships[0]);
  const snapshot = createContractWindForecast(getRouteById(contract.routeId), now);
  const previewBefore = structuredClone({ ship, snapshot, contract });
  const writesBefore = writes;
  for (const speed of [6, 7]) assert.equal(prepare(contract, ship, speed, now, snapshot).kind, 'ready');
  for (const speed of [0, 5, 6.5, 8, NaN, Infinity, -Infinity, null, '7', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(prepare(contract, ship, speed, now, snapshot).kind, 'unavailable');
  }
  assert.equal(prepare(contract, { ...ship, kind: 'sailing' }, 6, now, snapshot).kind, 'unavailable');
  assert.equal(prepare(contract, { ...ship, maxSpeedKnots: 7.5 }, 7, now, snapshot).kind, 'ready');
  assert.equal(prepare(contract, { ...ship, cruisingSpeedKnots: 0 }, 6, now, snapshot).kind, 'ready');
  assert.equal(prepare(contract, { ...ship, cruisingSpeedKnots: NaN }, 6, now, snapshot).kind, 'ready');
  assert.deepEqual({ ship, snapshot, contract }, previewBefore);
  assert.equal(writes, writesBefore);
  console.log('PASS preview validation differences are characterized without state writes');
} finally {
  try { if (server) await server.close(); }
  finally {
    Date.now = originalNow;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}
