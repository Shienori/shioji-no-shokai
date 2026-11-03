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
  const { ports } = await server.ssrLoadModule('/src/data/ports.ts');
  const { getPortHexId } = await server.ssrLoadModule('/src/data/hexMap.ts');
  const seed = structuredClone(store.getState().gameState);
  const id = seed.ships[0].id;
  const checks = [];
  function reset() {
    failSave = false; writes = 0; storage.clear();
    const state = structuredClone(seed);
    state.ships[0].fuel.remainingTons = 0;
    store.setState({ gameState: state });
    return state;
  }
  for (const port of ports) {
    const before = reset();
    before.ships[0].currentPortId = port.id;
    before.ships[0].currentHexId = getPortHexId(port.id);
    assert.equal(checkPortRefuel(before, id).canRefuel, true);
    assert.equal(refuelShipAtPort(id).ok, true);
    const after = store.getState().gameState;
    assert.equal(after.ships[0].fuel.remainingTons, before.ships[0].fuel.capacityTons);
    assert.equal(before.ships[0].fuel.remainingTons, 0);
    assert.equal(after.money, before.money);
    assert.equal(after.operationTime, before.operationTime);
    assert.equal(after.lastRealTimeSyncedAt, before.lastRealTimeSyncedAt);
    assert.equal(after.reputations, before.reputations);
    assert.equal(after.voyageMemos, before.voyageMemos);
    assert.equal(after.acceptedContract, before.acceptedContract);
    assert.equal(after.activeVoyage, before.activeVoyage);
    assert.equal(writes, 1);
    assert.equal(loadGame().ships[0].fuel.remainingTons, after.ships[0].fuel.remainingTons);
    assert.equal(refuelShipAtPort(id).ok, false);
    assert.equal(writes, 1);
  }
  checks.push('all ports refill zero balance free and immediately; only balance changes; save/load retains it; duplicate click does not save');
  function reject(change, shipId = id) {
    const state = reset(); change(state);
    assert.equal(refuelShipAtPort(shipId).ok, false);
    assert.equal(store.getState().gameState, state);
    assert.equal(writes, 0);
  }
  for (const status of ['loading', 'sailing', 'unloading']) reject(state => { state.ships[0].status = status; });
  reject(state => { state.ships[0].activeContractId = 'busy'; });
  reject(state => { state.activeVoyage = { shipId: id }; });
  reject(state => { state.acceptedContract = { id: 'orphan' }; });
  reject(state => { state.ships[0].kind = 'sailing'; });
  reject(state => { state.ships[0].currentHexId = 'missing_hex'; });
  reject(state => { state.ships[0].currentPortId = ports.find(port => port.id !== state.ships[0].currentPortId).id; });
  reject(() => {}, 'missing_ship');
  reject(state => { delete state.ships[0].fuel; });
  for (const remaining of [-1, NaN, Infinity, 6]) reject(state => { state.ships[0].fuel.remainingTons = remaining; });
  checks.push('busy, untrusted location, missing ship, unsupported propulsion and invalid fuel rejected without state change or save');
  let before = reset();
  before.ships[0].fuel.remainingTons = 1.23456789;
  assert.equal(checkPortRefuel(before, id).amountTons, 5 - 1.23456789);
  assert.equal(refuelShipAtPort(id).ok, true);
  assert.equal(store.getState().gameState.ships[0].fuel.remainingTons, 5);
  checks.push('partial fuel uses exact stored quantities, not display rounding');
  before = reset();
  assert.equal(checkPortRefuel(before, id).canRefuel, true);
  before.ships[0].status = 'loading';
  assert.equal(refuelShipAtPort(id).ok, false);
  assert.equal(writes, 0);
  checks.push('click rechecks live state after eligibility was displayed');
  before = reset(); failSave = true;
  assert.equal(refuelShipAtPort(id).ok, false);
  assert.equal(store.getState().gameState, before);
  assert.equal(before.ships[0].fuel.remainingTons, 0);
  assert.equal(writes, 0);
  checks.push('failed persistence does not publish an unsaved refill');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (server) await server.close();
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
