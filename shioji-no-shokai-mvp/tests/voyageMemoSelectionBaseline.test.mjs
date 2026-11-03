import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalNow = Date.now;
const storage = new Map();
let writes = 0;
let now = 1792599200000;
let server;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => { writes++; storage.set(key, String(value)); },
  removeItem: key => storage.delete(key),
} });
Date.now = () => now;

try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { useGameStore: store } = await server.ssrLoadModule('/src/state/gameStore.ts');
  const { tutorialWheatContract } = await server.ssrLoadModule('/src/data/contracts.ts');
  const seed = structuredClone(store.getState().gameState);

  function begin() {
    now = 1792599200000;
    storage.clear();
    const state = structuredClone(seed);
    state.ships[0].fuel.capacityTons = 100;
    state.ships[0].fuel.remainingTons = 100;
    store.setState({ gameState: state });
    store.getState().acceptContract(tutorialWheatContract.id, state.ships[0].id, 6);
    const accepted = store.getState().gameState;
    assert.ok(accepted.activeVoyage);
    assert.ok(accepted.acceptedContract);
    return accepted;
  }

  function copyMemo(base, number, overrides = {}) {
    const memo = { ...structuredClone(base), voyageNumber: number, label: `V.${number}`, ...overrides };
    delete memo.cargoLotSnapshot;
    delete memo.fuelConsumedTons;
    return memo;
  }

  let state = begin();
  let base = state.voyageMemos[0];
  const cargo = structuredClone(state.acceptedContract.cargoLotSnapshot);
  state.voyageMemos = [
    copyMemo(base, 1),
    copyMemo(base, 2),
    copyMemo(base, 3, { acceptedAt: base.acceptedAt - 1 }),
    copyMemo(base, 4, { shipId: 'other_ship' }),
  ];
  store.setState({ gameState: state });
  store.getState().tick();
  state = store.getState().gameState;
  assert.deepEqual(state.voyageMemos[1].cargoLotSnapshot, cargo);
  for (const index of [0, 2, 3]) assert.equal(Object.hasOwn(state.voyageMemos[index], 'cargoLotSnapshot'), false);
  assert.equal(state.voyageMemos[2].fuelConsumedTons, 0);
  for (const index of [0, 1, 3]) assert.equal(Object.hasOwn(state.voyageMemos[index], 'fuelConsumedTons'), false);
  console.log('PASS latest cargo match requires accepted time; fuel match deliberately retains its different predicate');

  state = begin();
  now += 2 * 86400000;
  store.getState().tick();
  state = store.getState().gameState;
  assert.equal(state.activeVoyage.phase, 'completed');
  base = state.voyageMemos[0];
  state.voyageMemos = [
    copyMemo(base, 1),
    copyMemo(base, 2, { shipId: 'other_ship', acceptedAt: base.acceptedAt - 1 }),
    copyMemo(base, 3, { contractId: 'other_contract' }),
    copyMemo(base, 4, { settlement: { offeredReward: 1, latePenalty: 0, receivedReward: 1, expense: 0, guaranteeAmount: 0, finalPayout: 1 } }),
  ];
  const untouched = structuredClone(state.voyageMemos[3]);
  store.setState({ gameState: state });
  store.getState().settleContract();
  state = store.getState().gameState;
  assert.equal(state.voyageMemos[0].settlement, null);
  assert.ok(state.voyageMemos[1].settlement);
  assert.equal(state.voyageMemos[2].settlement, null);
  assert.deepEqual(state.voyageMemos[3], untouched);
  assert.equal(state.activeVoyage, null);
  assert.equal(state.acceptedContract, null);
  console.log('PASS settlement selects latest unsettled contract match without adding ship or accepted-time filters');

  state = begin();
  base = state.voyageMemos[0];
  state.voyageMemos = [copyMemo(base, 1, { shipId: 'other_ship' })];
  store.setState({ gameState: state });
  const before = structuredClone(state);
  const savedBefore = new Map(storage);
  writes = 0;
  assert.throws(() => store.getState().tick(), /Missing active coal voyage memo/);
  assert.equal(store.getState().gameState, state);
  assert.deepEqual(store.getState().gameState, before);
  assert.deepEqual(storage, savedBefore);
  assert.equal(writes, 0);
  console.log('PASS absent active fuel memo aborts without publishing or saving partial state');
} finally {
  try { if (server) await server.close(); }
  finally {
    Date.now = originalNow;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}
