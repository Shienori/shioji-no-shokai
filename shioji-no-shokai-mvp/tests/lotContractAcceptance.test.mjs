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
const now = 1792599200000;
Date.now = () => now;
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { useGameStore: store } = await server.ssrLoadModule('/src/state/gameStore.ts');
  const { tutorialWheatContract } = await server.ssrLoadModule('/src/data/contracts.ts');
  const { getCargoById } = await server.ssrLoadModule('/src/data/cargos.ts');
  const { getCargoLotById } = await server.ssrLoadModule('/src/data/cargoLots.ts');
  const { createCargoLotSnapshot } = await server.ssrLoadModule('/src/domain/cargoLotUnits.ts');
  const { getCargoForContract, readCargoLotSnapshot, isLegacyCargoContract, getLotShipCapacity, cargoFitsLotShip } = await server.ssrLoadModule('/src/domain/lotContract.ts');
  const { evaluateContractAcceptance } = await server.ssrLoadModule('/src/domain/contractAcceptance.ts');
  const { createVoyage, getHeavyLoadSpeedFactor, progressVoyage } = await server.ssrLoadModule('/src/domain/voyage.ts');
  const { loadGame } = await server.ssrLoadModule('/src/domain/save.ts');
  const seed = structuredClone(store.getState().gameState);
  const ship = seed.ships[0];
  assert.deepEqual(getLotShipCapacity(ship), { maxCargoWeightTons: 10, maxCargoVolumeM3: 12 });
  for (const [cargoId, quantity, expected] of [
    ['cargo_steel', 5, true], ['cargo_steel', 6, false],
    ['cargo_silk', 6, true], ['cargo_silk', 7, false],
    ['cargo_iron_ore', 9, true], ['cargo_iron_ore', 10, true], ['cargo_iron_ore', 11, false],
  ]) {
    const template = { ...tutorialWheatContract, cargoId, quantity };
    assert.equal(evaluateContractAcceptance(template, ship, seed, now).canAccept, expected);
    assert.equal(cargoFitsLotShip(createCargoLotSnapshot(getCargoLotById(cargoId), quantity), ship), expected);
  }
  assert.equal(getHeavyLoadSpeedFactor({ cargoId: 'cargo_iron_ore', quantity: 8 }, ship), 1);
  assert.equal(getHeavyLoadSpeedFactor({ cargoId: 'cargo_iron_ore', quantity: 9 }, ship), 0.9);
  assert.equal(getHeavyLoadSpeedFactor({ cargoId: 'cargo_silk', quantity: 6 }, ship), 1);
  store.setState({ gameState: structuredClone(seed) });
  store.getState().acceptContract(tutorialWheatContract.id, ship.id, 7);
  let state = store.getState().gameState;
  assert.ok(state.acceptedContract);
  const contract = state.acceptedContract;
  const snapshot = readCargoLotSnapshot(contract);
  assert.equal(snapshot.dataVersion, 'cargo-lot-v1');
  assert.equal(snapshot.quantityLots, tutorialWheatContract.quantity);
  assert.equal(snapshot.totalWeightTons, tutorialWheatContract.quantity * 0.5);
  assert.equal(state.activeVoyage.fuelNavigation.selectedSpeedKnots, 7);
  assert.equal(state.activeVoyage.fuelNavigation.loadSpeedFactor, getHeavyLoadSpeedFactor(contract, ship));
  assert.deepEqual(readCargoLotSnapshot(loadGame().acceptedContract), snapshot);
  const held = structuredClone(contract);
  held.cargoLotSnapshot.weightTonsPerLot = 0.75;
  held.cargoLotSnapshot.totalWeightTons = 0.75 * held.quantity;
  held.cargoLotSnapshot.loadingTimeMsPerLot = 123000;
  held.cargoLotSnapshot.loadingDurationMs = 123000 * held.quantity;
  held.cargoLotSnapshot.unloadingTimeMsPerLot = 234000;
  held.cargoLotSnapshot.unloadingDurationMs = 234000 * held.quantity;
  assert.equal(getCargoForContract(held).weightPerUnit, 0.75);
  const heldVoyage = createVoyage(held, ship, 0, now);
  assert.equal(heldVoyage.loadingCompletedAt, 123000 * held.quantity);
  const unloaded = progressVoyage({ ...heldVoyage, phase: 'unloading', unloadingStartedAt: 1000, arrivedAt: 1000 }, held, 1000 + 234000 * held.quantity, now);
  assert.equal(unloaded.phase, 'completed');
  assert.equal(unloaded.unloadingCompletedAt, 1000 + 234000 * held.quantity);
  const legacy = structuredClone(contract);
  delete legacy.cargoLotSnapshot;
  assert.equal(isLegacyCargoContract(legacy), true);
  assert.equal(getCargoForContract(legacy).weightPerUnit, getCargoById(legacy.cargoId).weightPerUnit);
  assert.equal(createVoyage(legacy, ship, 0, now).loadingCompletedAt, getCargoById(legacy.cargoId).loadingTimeMsPerUnit * legacy.quantity);
  const legacyBefore = JSON.stringify(legacy);
  store.setState({ gameState: { ...structuredClone(seed), acceptedContract: legacy, activeVoyage: { ...state.activeVoyage, phase: 'loading' } } });
  store.getState().tick();
  state = store.getState().gameState;
  assert.equal(JSON.stringify(state.acceptedContract), legacyBefore);
  for (const value of [null, {}, { ...snapshot, dataVersion: 'future' }, { ...snapshot, totalWeightTons: 999 }]) {
    assert.throws(() => readCargoLotSnapshot({ ...contract, cargoLotSnapshot: value }));
  }
  assert.equal(readCargoLotSnapshot(legacy), null);
  assert.equal(evaluateContractAcceptance({ ...tutorialWheatContract, quantity: 0 }, ship, seed, now).canAccept, false);
  assert.equal(evaluateContractAcceptance(tutorialWheatContract, { ...ship, id: 'unconfigured_ship' }, seed, now).canAccept, false);
  console.log(JSON.stringify({ result: 'passed', checks: ['10t and 12m3 acceptance boundaries', '9t heavy-load threshold independent of volume', 'store acceptance snapshots and speed navigation', 'save/load retains snapshot', 'frozen unit weight and handling times used', 'legacy contracts remain unconverted', 'invalid saved snapshots fail closed'] }, null, 2));
} finally {
  if (server) await server.close();
  Date.now = originalNow;
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
