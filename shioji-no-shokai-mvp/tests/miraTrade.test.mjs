import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const storage = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key), clear: () => storage.clear(),
}});
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), server: { middlewareMode: true }, appType: "custom" });
  const load = path => server.ssrLoadModule(path);
  const { miraSaltGuild, findShipperById, ensureMiraReputation } = await load("/src/data/shippers.ts");
  const { getCargoById } = await load("/src/data/cargos.ts");
  const { contractTemplates, getContractTemplateById, getContractDifficulty } = await load("/src/data/contracts.ts");
  const { getRouteById } = await load("/src/data/routes.ts");
  const { initialShip } = await load("/src/data/ships.ts");
  const { calculateCargoValue, calculateVoyageDistanceAllowance } = await load("/src/domain/reward.ts");
  const { useGameStore: store } = await load("/src/state/gameStore.ts");
  assert.equal(miraSaltGuild.name, "ミラ塩商組合");
  assert.equal(miraSaltGuild.homePortId, "port_mira");
  assert.equal(findShipperById(miraSaltGuild.id), miraSaltGuild);
  assert.equal(findShipperById("unknown"), undefined);
  for (const id of [...miraSaltGuild.primaryCargoIds, ...miraSaltGuild.secondaryCargoIds]) assert.equal(getCargoById(id).id, id);
  const salt = getCargoById("cargo_salt"), spices = getCargoById("cargo_spices");
  assert.deepEqual([salt.unitPrice, salt.unitVolume, salt.weightPerUnit], [3, 1, 2]);
  assert.deepEqual([spices.unitPrice, spices.unitVolume, spices.weightPerUnit], [12, 1, 1]);
  const outbound = contractTemplates.filter(t => getRouteById(t.routeId).fromPortId === "port_mira");
  const inbound = contractTemplates.filter(t => getRouteById(t.routeId).toPortId === "port_mira");
  assert.equal(outbound.length, 5);
  assert.equal(inbound.length, 3);
  for (const t of [...outbound, ...inbound]) {
    const cargo = getCargoById(t.cargoId), route = getRouteById(t.routeId);
    assert.ok(cargo.unitVolume * t.quantity <= initialShip.maxCargoVolume);
    assert.ok(cargo.weightPerUnit * t.quantity <= initialShip.maxCargoWeight);
    assert.equal(t.offeredReward, calculateCargoValue(cargo.unitPrice, t.quantity) + calculateVoyageDistanceAllowance(route.distance));
  }
  for (const t of outbound) assert.equal(t.shipperId, miraSaltGuild.id);
  assert.deepEqual(ensureMiraReputation([]), [{ shipperId: miraSaltGuild.id, value: 0 }]);
  const existing = [{ shipperId: miraSaltGuild.id, value: 1.25 }];
  assert.equal(ensureMiraReputation(existing), existing);
  store.getState().resetGame();
  const state = store.getState().gameState, offers = state.portOffers.port_mira;
  assert.equal(offers.length, 3);
  assert.equal(state.reputations.find(r => r.shipperId === miraSaltGuild.id)?.value, 0);
  assert.equal(new Set(offers.map(o => o.templateId)).size, 3);
  assert.ok(offers.filter(o => getContractDifficulty(getContractTemplateById(o.templateId)) === "normal").length >= 2);
  store.setState({ gameState: { ...state, selectedPortId: "port_mira", ships: state.ships.map(s => ({ ...s, currentPortId: "port_mira", currentHexId: "hex_port_mira" })) }});
  const offer = offers[0], retained = offers.slice(1);
  store.getState().acceptContract(offer.id, state.ships[0].id);
  const accepted = store.getState().gameState;
  assert.equal(accepted.acceptedContract?.shipperId, miraSaltGuild.id);
  assert.equal(accepted.acceptedContract?.deadlineAt, offer.deadlineAt);
  assert.ok(accepted.activeVoyage);
  assert.equal(accepted.activeVoyage.contractId, accepted.acceptedContract.id);
  assert.equal(accepted.portOffers.port_mira.length, 3);
  for (const item of retained) assert.deepEqual(accepted.portOffers.port_mira.find(o => o.id === item.id), item);
  assert.equal(accepted.voyageMemos.at(-1)?.contractId, accepted.acceptedContract.id);
  console.log(JSON.stringify({ result: "success", verified: ["shipper", "cargo", "8 templates", "capacity", "rewards", "reputation initialization", "offer generation", "acceptance", "deadline retention", "replenishment", "memo reference"] }));
} finally {
  if (server) await server.close();
  if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
  else delete globalThis.localStorage;
}
