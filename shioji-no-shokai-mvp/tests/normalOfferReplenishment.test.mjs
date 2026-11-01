import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Run from the project directory: node tests/normalOfferReplenishment.test.mjs
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
} });
const originalNow = Date.now;
const originalRandom = Math.random;
const now = 1792599200000;
Date.now = () => now;
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { useGameStore: store } = await server.ssrLoadModule('/src/state/gameStore.ts');
  const { contractTemplates, getContractTemplateById, getContractDifficulty, tutorialWheatContract } = await server.ssrLoadModule('/src/data/contracts.ts');
  const seed = structuredClone(store.getState().gameState);
  const portId = 'port_aldera';
  const ids = ['contract_aldera_001', 'contract_aldera_002', 'contract_aldera_003', 'contract_aldera_004', 'contract_aldera_005'];
  const [n1, n2, easy, n3, hard] = ids;
  let passed = 0;
  const normalCount = offers => offers.filter(offer => getContractDifficulty(getContractTemplateById(offer.templateId)) === 'normal').length;
  const offer = (templateId, index) => ({ id: `fixture_${index}_${templateId}`, templateId, generatedAt: now - 1000, deadlineAt: now + (index + 1) * 3600000, timeAllowanceRatio: 2 });
  function reset(templateIds) {
    storage.clear();
    const state = structuredClone(seed);
    state.selectedPortId = portId;
    state.acceptedContract = null;
    state.activeVoyage = null;
    state.ships[0] = { ...state.ships[0], currentPortId: portId, status: 'docked', activeContractId: null, maxCargoVolume: 1000, maxCargoWeight: 1000 };
    state.portOffers[portId] = templateIds.map(offer);
    store.setState({ gameState: state, selectedContractId: null, selectedShipId: null });
    return state;
  }
  function acceptAndCheck(templateIds, acceptedId, expectedNormal) {
    const before = reset(templateIds);
    const acceptedOffer = before.portOffers[portId].find(item => item.templateId === acceptedId);
    const remaining = before.portOffers[portId].filter(item => item.id !== acceptedOffer.id);
    const remainingSnapshot = structuredClone(remaining);
    const otherPorts = Object.fromEntries(Object.entries(before.portOffers).filter(([id]) => id !== portId));
    store.getState().acceptContract(acceptedId, before.ships[0].id);
    const after = store.getState().gameState;
    assert.ok(after.acceptedContract, 'fixture must be accepted');
    assert.equal(after.acceptedContract.deadlineAt, acceptedOffer.deadlineAt);
    const result = after.portOffers[portId];
    assert.equal(result.length, 3);
    assert.deepEqual(result.slice(0, remaining.length), remainingSnapshot);
    remaining.forEach((item, index) => assert.strictEqual(result[index], item));
    assert.ok(result.slice(remaining.length).every(item => !remaining.some(old => old.templateId === item.templateId)));
    assert.deepEqual(Object.fromEntries(Object.entries(after.portOffers).filter(([id]) => id !== portId)), otherPorts);
    assert.equal(normalCount(result), expectedNormal);
    passed += 1;
    return result;
  }

  for (const random of [() => 0, () => 0.999999]) {
    Math.random = random;
    acceptAndCheck([n1, n2, easy], n1, 2);
    acceptAndCheck([n1, n2, hard], n2, 2);
    const flexible = acceptAndCheck([n1, n2, easy], easy, random() === 0 ? 2 : 3);
    if (random() === 0) assert.equal(getContractDifficulty(getContractTemplateById(flexible[2].templateId)), 'hard');
    acceptAndCheck([n1, easy, hard], n1, 1);
    acceptAndCheck([n1, n2, n1], n1, 3);
  }

  const difficulties = contractTemplates.map(template => template.difficulty);
  try {
    // Force a normal shortage while retaining actual routes and templates.
    contractTemplates.forEach(template => { template.difficulty = template.id === n2 ? 'normal' : 'easy'; });
    Math.random = () => 0;
    acceptAndCheck([n1, n2, easy], n1, 1);
    const originals = contractTemplates.slice();
    try {
      contractTemplates.splice(0, contractTemplates.length, ...originals.filter(template => [n1, n2].includes(template.id)));
      const before = reset([n1, n2]);
      store.getState().acceptContract(n1, before.ships[0].id);
      const result = store.getState().gameState.portOffers[portId];
      assert.equal(result.length, 2, 'pool exhaustion may leave fewer than three offers');
      assert.equal(new Set(result.map(item => item.templateId)).size, 2);
      assert.deepEqual(result[0], before.portOffers[portId][1]);
      passed += 1;
    } finally {
      contractTemplates.splice(0, contractTemplates.length, ...originals);
    }
  } finally {
    contractTemplates.forEach((template, index) => { template.difficulty = difficulties[index]; });
  }

  for (const random of [() => 0, () => 0.999999]) {
    Math.random = random;
    store.getState().resetGame();
    for (const offers of Object.values(store.getState().gameState.portOffers)) {
      assert.equal(offers.length, 3);
      assert.ok(normalCount(offers) >= 2);
      assert.equal(new Set(offers.map(item => item.templateId)).size, 3);
      assert.ok(offers.every(item => item.templateId !== tutorialWheatContract.id));
    }
    passed += 1;
    const state = store.getState().gameState;
    store.setState({ gameState: { ...state, nextRefreshAt: now } });
    store.getState().tick();
    for (const offers of Object.values(store.getState().gameState.portOffers)) {
      assert.equal(offers.length, 3);
      assert.ok(normalCount(offers) >= 2);
      assert.equal(new Set(offers.map(item => item.templateId)).size, 3);
    }
    passed += 1;
  }
  console.log(JSON.stringify({ passed }, null, 2));
} finally {
  if (server) await server.close();
  Date.now = originalNow;
  Math.random = originalRandom;
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
