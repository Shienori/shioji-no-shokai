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
  const { saveGame, loadGame } = await server.ssrLoadModule('/src/domain/save.ts');
  const { getMemoCargoPresentation } = await server.ssrLoadModule('/src/domain/memoCargoPresentation.ts');
  const { getCargoLotById } = await server.ssrLoadModule('/src/data/cargoLots.ts');
  const seed = structuredClone(store.getState().gameState);
  const id = seed.ships[0].id;
  const checks = [];
  function begin(remaining = 100, capacity = 100) {
    now = start; storage.clear();
    const state = structuredClone(seed);
    state.ships[0].fuel = { ...state.ships[0].fuel, capacityTons: capacity, remainingTons: remaining };
    store.setState({ gameState: state });
    store.getState().acceptContract(tutorialWheatContract.id, id, 6);
    const accepted = store.getState().gameState;
    assert.ok(accepted.acceptedContract);
    return accepted;
  }
  function tick(at) { now = at; store.getState().tick(); return store.getState().gameState; }
  let state = begin();
  const snapshot = structuredClone(state.acceptedContract.cargoLotSnapshot);
  assert.deepEqual(state.voyageMemos[0].cargoLotSnapshot, snapshot);
  assert.notEqual(state.voyageMemos[0].cargoLotSnapshot, state.acceptedContract.cargoLotSnapshot);
  assert.equal(state.voyageMemos[0].cargoLabel, `${snapshot.cargoName} ${snapshot.quantityLots}ロット`);
  state.acceptedContract.cargoLotSnapshot.cargoName = '変更後の契約名';
  assert.equal(state.voyageMemos[0].cargoLotSnapshot.cargoName, snapshot.cargoName);
  state.acceptedContract.cargoLotSnapshot.cargoName = snapshot.cargoName;
  assert.deepEqual(loadGame().voyageMemos[0].cargoLotSnapshot, snapshot);
  checks.push('acceptance copies snapshot independently and persists it immediately');
  state = tick(start + 2 * 86400000);
  assert.equal(state.activeVoyage.phase, 'completed');
  store.getState().settleContract();
  state = store.getState().gameState;
  assert.equal(state.acceptedContract, null);
  assert.equal(state.activeVoyage, null);
  assert.ok(state.voyageMemos[0].settlement);
  assert.deepEqual(state.voyageMemos[0].cargoLotSnapshot, snapshot);
  const completedMemo = structuredClone(state.voyageMemos[0]);
  const loadedCompleted = loadGame();
  assert.deepEqual(loadedCompleted.voyageMemos[0].cargoLotSnapshot, snapshot);
  assert.equal(getMemoCargoPresentation(loadedCompleted.voyageMemos[0], null, null).sourceLabel, '航海履歴に保存された値');
  const catalog = getCargoLotById('cargo_wheat');
  const originalCatalog = { name: catalog.name, weightTonsPerLot: catalog.weightTonsPerLot, volumeM3PerLot: catalog.volumeM3PerLot };
  try {
    catalog.name = '変更後マスタ'; catalog.weightTonsPerLot = 99; catalog.volumeM3PerLot = 99;
    const display = getMemoCargoPresentation(loadedCompleted.voyageMemos[0], null, null);
    assert.equal(display.label, `${snapshot.cargoName} ${snapshot.quantityLots}ロット`);
    assert.equal(display.weightLabel, `${snapshot.totalWeightTons.toFixed(2)}t`);
    assert.equal(display.volumeLabel, `${snapshot.totalVolumeM3.toFixed(2)}m³`);
  } finally { Object.assign(catalog, originalCatalog); }
  checks.push('settlement and reload retain history without contract or current cargo catalog');
  state = begin(0.001, 5);
  const depletedSnapshot = structuredClone(state.acceptedContract.cargoLotSnapshot);
  delete state.voyageMemos[0].cargoLotSnapshot;
  store.setState({ gameState: state });
  state = tick(state.activeVoyage.departedRealTime + 60000);
  assert.equal(state.acceptedContract, null);
  assert.equal(state.activeVoyage, null);
  assert.ok(state.voyageMemos[0].fuelDepletionReturn);
  assert.deepEqual(state.voyageMemos[0].cargoLotSnapshot, depletedSnapshot);
  assert.deepEqual(loadGame().voyageMemos[0].cargoLotSnapshot, depletedSnapshot);
  assert.equal(getMemoCargoPresentation(loadGame().voyageMemos[0], null, null).sourceLabel, '航海履歴に保存された値');
  checks.push('pre-update active memo is filled before depletion clears contract');
  state = begin();
  const pendingSnapshot = structuredClone(state.acceptedContract.cargoLotSnapshot);
  delete state.voyageMemos[0].cargoLotSnapshot;
  state.voyageMemos[0].cargoLabel = '以前の表記';
  const pendingContract = JSON.stringify(state.acceptedContract);
  const pendingMoney = state.money;
  const pendingFuel = state.ships[0].fuel.remainingTons;
  store.setState({ gameState: state });
  state = tick(now);
  assert.deepEqual(state.voyageMemos[0].cargoLotSnapshot, pendingSnapshot);
  assert.equal(JSON.stringify(state.acceptedContract), pendingContract);
  assert.equal(state.money, pendingMoney);
  assert.equal(state.ships[0].fuel.remainingTons, pendingFuel);
  const firstCopy = state.voyageMemos[0].cargoLotSnapshot;
  assert.equal(tick(now).voyageMemos[0].cargoLotSnapshot, firstCopy);
  state = tick(start + 2 * 86400000);
  delete state.voyageMemos[0].cargoLotSnapshot;
  store.setState({ gameState: state });
  store.getState().settleContract();
  assert.deepEqual(store.getState().gameState.voyageMemos[0].cargoLotSnapshot, pendingSnapshot);
  checks.push('active memo preservation is idempotent and also runs before direct settlement');
  const historical = structuredClone(seed);
  const oldMemo = structuredClone(completedMemo);
  delete oldMemo.cargoLotSnapshot;
  oldMemo.cargoLabel = '過去の保存表記';
  historical.voyageMemos = [oldMemo];
  saveGame(historical);
  const loadedHistorical = loadGame();
  assert.equal(Object.hasOwn(loadedHistorical.voyageMemos[0], 'cargoLotSnapshot'), false);
  assert.equal(getMemoCargoPresentation(loadedHistorical.voyageMemos[0], null, null).weightLabel, '未記録');
  assert.equal(loadedHistorical.voyageMemos[0].cargoLabel, oldMemo.cargoLabel);
  state = begin();
  delete state.acceptedContract.cargoLotSnapshot;
  delete state.activeVoyage.fuelNavigation;
  delete state.voyageMemos[0].cargoLotSnapshot;
  const oldContract = JSON.stringify(state.acceptedContract);
  store.setState({ gameState: state });
  state = tick(now);
  assert.equal(Object.hasOwn(state.voyageMemos[0], 'cargoLotSnapshot'), false);
  assert.equal(JSON.stringify(state.acceptedContract), oldContract);
  checks.push('closed history and active legacy contracts are never reconstructed from new catalog');
  state = begin();
  state.voyageMemos[0].cargoLotSnapshot = null;
  store.setState({ gameState: state });
  state = tick(now);
  assert.equal(state.voyageMemos[0].cargoLotSnapshot, null);
  assert.equal(getMemoCargoPresentation(state.voyageMemos[0], state.acceptedContract, state.activeVoyage).weightLabel, '確認不可');
  checks.push('existing malformed memo data is preserved and remains visibly invalid');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (server) await server.close();
  Date.now = originalNow;
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
