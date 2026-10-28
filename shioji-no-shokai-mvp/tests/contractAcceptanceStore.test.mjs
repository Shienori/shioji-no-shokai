import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
} });
const originalNow = Date.now;
const now = 1792599200000;
Date.now = () => now;
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { useGameStore: store } = await server.ssrLoadModule('/src/state/gameStore.ts');
  const { getContractPoolByPort, tutorialWheatContract } = await server.ssrLoadModule('/src/data/contracts.ts');
  const { getCargoById } = await server.ssrLoadModule('/src/data/cargos.ts');
  const { loadGame } = await server.ssrLoadModule('/src/domain/save.ts');
  const { evaluateContractAcceptance } = await server.ssrLoadModule('/src/domain/contractAcceptance.ts');
  const seed = structuredClone(store.getState().gameState);
  const ship = seed.ships[0];
  const portId = ship.currentPortId;
  const template = getContractPoolByPort(portId).find(item => {
    const cargo = getCargoById(item.cargoId);
    return item.id !== tutorialWheatContract.id && cargo.unitVolume * item.quantity <= ship.maxCargoVolume && cargo.weightPerUnit * item.quantity <= ship.maxCargoWeight;
  });
  assert.ok(template, 'fixture needs an initial-ship-compatible normal offer');
  const a = { id: 'offer_test_a', templateId: template.id, generatedAt: now, deadlineAt: now + 3600000, timeAllowanceRatio: 1 };
  const b = { ...a, id: 'offer_test_b', deadlineAt: now + 7200000 };
  const checks = [];
  function reset(offers = [a, b]) {
    storage.clear();
    const state = structuredClone(seed);
    state.selectedPortId = portId;
    state.acceptedContract = null; state.activeVoyage = null;
    state.tutorialCompleted = false; state.acceptedContractIds = []; state.voyageMemos = [];
    state.ships[0].status = 'docked'; state.ships[0].activeContractId = null;
    state.portOffers = { ...state.portOffers, [portId]: structuredClone(offers) };
    store.setState({ gameState: state, selectedContractId: null, selectedShipId: null });
    return state;
  }
  function reject(id, change = () => {}) {
    const state = reset(); change(state);
    const snapshot = JSON.stringify(state);
    store.getState().acceptContract(id, ship.id);
    assert.equal(JSON.stringify(store.getState().gameState), snapshot);
    assert.equal(storage.size, 0, 'rejection must not save');
  }
  reset();
  store.getState().acceptContract(b.id, ship.id);
  let state = store.getState().gameState;
  assert.equal(state.acceptedContract.templateId, template.id);
  assert.equal(state.acceptedContract.deadlineAt, b.deadlineAt);
  assert.ok(state.portOffers[portId].some(offer => offer.id === a.id));
  assert.ok(!state.portOffers[portId].some(offer => offer.id === b.id));
  assert.equal(state.portOffers[portId].length, 3);
  assert.equal(state.activeVoyage.contractId, state.acceptedContract.id);
  assert.equal(state.ships[0].activeContractId, state.acceptedContract.id);
  assert.equal(state.voyageMemos[0].contractId, state.acceptedContract.id);
  checks.push('second duplicate accepted with exact deadline; only selected offer consumed; references agree');
  const loaded = loadGame();
  assert.equal(loaded.acceptedContract.id, state.acceptedContract.id);
  assert.equal(loaded.activeVoyage.contractId, loaded.acceptedContract.id);
  assert.equal(loaded.acceptedContract.deadlineAt, b.deadlineAt);
  checks.push('save/load retains accepted identity, deadline and voyage reference');
  const acceptedSnapshot = JSON.stringify(state);
  store.getState().acceptContract(b.id, ship.id);
  assert.equal(JSON.stringify(store.getState().gameState), acceptedSnapshot);
  checks.push('double acceptance blocked');
  reject(template.id); checks.push('normal template ID rejected');
  reject('missing_offer'); checks.push('unknown offer rejected without throwing');
  reject(a.id, state => { state.portOffers[portId] = [b]; }); checks.push('stale offer not substituted');
  reject(a.id, state => { state.portOffers[portId][0].deadlineAt = now; }); checks.push('deadline equality rejected');
  reject(a.id, state => { state.portOffers[portId][0].deadlineAt = NaN; }); checks.push('nonfinite deadline rejected');
  reject(a.id, state => {
    const otherPort = Object.keys(state.portOffers).find(id => id !== portId);
    assert.ok(otherPort); state.selectedPortId = otherPort;
  }); checks.push('offer in another port rejected');
  reject(a.id, state => { state.ships[0].status = 'sailing'; }); checks.push('busy ship rejected');
  reject(a.id, state => { state.ships[0].maxCargoVolume = 0; }); checks.push('capacity restriction retained');
  reject(a.id, state => { state.portOffers[portId][0].templateId = 'missing_template'; }); checks.push('invalid template rejected');
  const fixture = reset([{ ...a, deadlineAt: now }, b]);
  assert.equal(evaluateContractAcceptance(template, fixture.ships[0], fixture, now, b.id).canAccept, true);
  store.getState().acceptContract(b.id, ship.id);
  assert.equal(store.getState().gameState.acceptedContract.deadlineAt, b.deadlineAt);
  checks.push('expired sibling does not block valid selected duplicate');
  reset([]);
  store.getState().acceptContract(tutorialWheatContract.id, ship.id);
  state = store.getState().gameState;
  assert.equal(state.acceptedContract.templateId, tutorialWheatContract.id);
  assert.equal(state.tutorialCompleted, true);
  assert.deepEqual(state.portOffers[portId], []);
  checks.push('fixed tutorial works without a normal offer');
  reject(tutorialWheatContract.id, state => { state.tutorialCompleted = true; });
  reject(tutorialWheatContract.id, state => { state.acceptedContractIds = [tutorialWheatContract.id]; });
  checks.push('completed tutorial and legacy history prevent reacceptance');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (server) await server.close();
  Date.now = originalNow;
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
