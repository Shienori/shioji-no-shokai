import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();
let writes = 0;
let failSave = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => { if (failSave) throw new Error('quota'); writes++; storage.set(key, String(value)); },
  removeItem: key => storage.delete(key),
} });
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { useGameStore: store } = await server.ssrLoadModule('/src/state/gameStore.ts');
  const { refuelShipAtPort, checkPortRefuel } = await server.ssrLoadModule('/src/state/portRefuel.ts');
  const { loadGame } = await server.ssrLoadModule('/src/domain/save.ts');
  const seed = structuredClone(store.getState().gameState);
  const id = seed.ships[0].id;
  const checks = [];
  function reset(remaining = 0) {
    failSave = false; writes = 0; storage.clear();
    const state = structuredClone(seed);
    state.ships[0].fuel.remainingTons = remaining;
    store.setState({ gameState: state });
    return state;
  }
  let before = reset(1);
  let check = checkPortRefuel(before, id, 2.5);
  assert.equal(check.amountTons, 1.5);
  assert.equal(check.targetTons, 2.5);
  assert.equal(writes, 0);
  assert.equal(before.ships[0].fuel.remainingTons, 1);
  assert.equal(refuelShipAtPort(id, 2.5).ok, true);
  let after = store.getState().gameState;
  assert.equal(after.ships[0].fuel.remainingTons, 2.5);
  assert.equal(after.money, before.money);
  assert.equal(after.reputations, before.reputations);
  assert.equal(after.voyageMemos, before.voyageMemos);
  assert.equal(after.operationTime, before.operationTime);
  assert.equal(loadGame().ships[0].fuel.remainingTons, 2.5);
  assert.equal(refuelShipAtPort(id, 2.5).ok, false);
  assert.equal(writes, 1);
  checks.push('half load is total capacity/2, not an extra half; preview is pure; repeat click does not save; reload retains target');
  assert.equal(refuelShipAtPort(id, 5).ok, true);
  assert.equal(store.getState().gameState.ships[0].fuel.remainingTons, 5);
  assert.equal(writes, 2);
  checks.push('full preset fills from half to capacity');
  before = reset(1.23456789);
  const target = 5 * (63 / 100);
  assert.equal(checkPortRefuel(before, id, target).amountTons, target - 1.23456789);
  assert.equal(refuelShipAtPort(id, target).ok, true);
  assert.equal(store.getState().gameState.ships[0].fuel.remainingTons, target);
  checks.push('arbitrary slider percentage sets exact target without rounding stored balance');
  for (const target of [-1, 0, 1, 2.5, 3, 5.01, NaN, Infinity, null, '4']) {
    before = reset(3);
    assert.equal(refuelShipAtPort(id, target).ok, false);
    assert.equal(store.getState().gameState, before);
    assert.equal(before.ships[0].fuel.remainingTons, 3);
    assert.equal(writes, 0);
  }
  checks.push('below-current, equal-current, above-capacity and nonnumeric targets rejected without discarding coal');
  before = reset(0);
  assert.equal(refuelShipAtPort(id, 0).ok, false);
  assert.equal(refuelShipAtPort(id).ok, true);
  assert.equal(store.getState().gameState.ships[0].fuel.remainingTons, 5);
  checks.push('zero target adds nothing; omitted target preserves old full-refill API');
  before = reset(0);
  assert.equal(checkPortRefuel(before, id, 2.5).canRefuel, true);
  before.ships[0].fuel.remainingTons = 3;
  assert.equal(refuelShipAtPort(id, 2.5).ok, false);
  assert.equal(writes, 0);
  before = reset(0);
  before.ships[0].status = 'loading';
  assert.equal(refuelShipAtPort(id, 2.5).ok, false);
  assert.equal(writes, 0);
  checks.push('live residual balance and busy status rechecked on confirmation');
  before = reset(0); failSave = true;
  assert.equal(refuelShipAtPort(id, 2.5).ok, false);
  assert.equal(store.getState().gameState, before);
  assert.equal(before.ships[0].fuel.remainingTons, 0);
  checks.push('save failure does not publish selected target');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (server) await server.close();
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
