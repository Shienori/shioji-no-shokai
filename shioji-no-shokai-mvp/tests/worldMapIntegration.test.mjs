import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  const proposal = JSON.parse(await readFile(new URL('../../docs/l-coast-map-proposal.json', import.meta.url), 'utf8'));
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { worldMap } = await server.ssrLoadModule('/src/data/worldMap.ts');
  const { hexMap, getHexById, getPortHexId } = await server.ssrLoadModule('/src/data/hexMap.ts');
  const { getRouteHexIds } = await server.ssrLoadModule('/src/domain/routePath.ts');
  const { getHexNeighbors, HEX_DISTANCE_NM } = await server.ssrLoadModule('/src/domain/hexMap.ts');
  const { ports } = await server.ssrLoadModule('/src/data/ports.ts');
  const { routes, getRouteById } = await server.ssrLoadModule('/src/data/routes.ts');
  const { getSeaConditionAt, getSeaConditionForecastAt, calculateEstimatedArrivalAt } = await server.ssrLoadModule('/src/domain/seaCondition.ts');
  const { SAVE_KEY, SAVE_VERSION } = await server.ssrLoadModule('/src/data/gameConstants.ts');
  const { saveGame, loadGame } = await server.ssrLoadModule('/src/domain/save.ts');
  const key = hex => `${hex.q},${hex.r}`;
  const checks = [];
  assert.deepEqual(JSON.parse(JSON.stringify(worldMap)), { meta: proposal.meta, terrain: proposal.terrain, seaHexes: proposal.seaHexes, features: proposal.features });
  assert.equal(worldMap.terrain.length, 88);
  assert.equal(worldMap.terrain.filter(hex => hex.kind === 'land').length, 34);
  assert.equal(worldMap.seaHexes.length, 50);
  assert.equal(worldMap.features.length, 4);
  assert.equal(hexMap.length, 54);
  assert.equal(new Set(worldMap.terrain.map(key)).size, 88);
  assert.equal(new Set(hexMap.map(key)).size, 54);
  assert.equal(new Set(hexMap.map(hex => hex.id)).size, 54);
  const landKeys = new Set(worldMap.terrain.filter(hex => hex.kind === 'land').map(key));
  const seaKeys = new Set(worldMap.seaHexes.map(key));
  for (const hex of hexMap) {
    assert.ok(!landKeys.has(key(hex)));
    if (hex.kind === 'sea') {
      assert.ok(seaKeys.has(key(hex)));
      assert.equal(hex.regionId, undefined);
      assert.equal(getHexById(hex.id).id, hex.id);
    }
  }
  const expectedPorts = { port_selene: [1, -3], port_aldera: [0, 0], port_rigel: [4, -1], port_mira: [7, -2] };
  assert.equal(ports.length, 4);
  for (const port of ports) {
    const hex = getHexById(getPortHexId(port.id));
    assert.equal(hex.id, `hex_${port.id}`);
    assert.deepEqual([hex.q, hex.r], expectedPorts[port.id]);
    assert.equal(worldMap.features.find(feature => feature.type === 'port' && feature.portId === port.id)?.name, port.name);
  }
  checks.push('proposal equality; 88 terrain cells; 54 unique navigable HEXes; four ports');
  const expectedPairs = [
    ['port_selene', 'port_aldera', 30], ['port_aldera', 'port_rigel', 45],
    ['port_selene', 'port_rigel', 60], ['port_aldera', 'port_mira', 90],
    ['port_selene', 'port_mira', 90], ['port_rigel', 'port_mira', 30],
  ];
  function verifyRoute(from, to, distance) {
    const ids = getRouteHexIds(from, to);
    assert.ok(ids && ids.length > 1, `${from} -> ${to} must be reachable`);
    assert.equal(ids[0], getPortHexId(from));
    assert.equal(ids.at(-1), getPortHexId(to));
    assert.equal(new Set(ids).size, ids.length);
    const hexes = ids.map(getHexById);
    assert.ok(hexes.slice(1, -1).every(hex => hex.kind === 'sea'));
    assert.equal(hexes.filter(hex => hex.kind === 'sea').length * HEX_DISTANCE_NM, distance);
    for (let index = 1; index < hexes.length; index += 1) {
      assert.ok(getHexNeighbors(hexes[index - 1]).some(neighbor => key(neighbor) === key(hexes[index])));
    }
  }
  for (const [a, b, distance] of expectedPairs) {
    verifyRoute(a, b, distance);
    verifyRoute(b, a, distance);
  }
  for (const route of routes) {
    verifyRoute(route.fromPortId, route.toPortId, route.distance);
    assert.equal(route.baseVoyageHours, route.distance / 6);
  }
  checks.push('12 directed shortest routes; land and intermediate ports excluded; registered route distances agree');
  const approaches = [
    [[0, 0], [1, -1], [2, -1], [3, -1], [4, -2], [5, -2], [6, -2], [7, -2]],
    [[4, -1], [5, -1], [6, -1], [7, -2]],
  ];
  const byCoordinate = new Map(hexMap.map(hex => [key(hex), hex]));
  for (const path of approaches) {
    const hexes = path.map(([q, r]) => byCoordinate.get(`${q},${r}`));
    assert.ok(hexes.every(Boolean));
    assert.ok(hexes.slice(1, -1).every(hex => hex.kind === 'sea'));
    for (let index = 1; index < hexes.length; index += 1) {
      assert.ok(getHexNeighbors(hexes[index - 1]).some(neighbor => key(neighbor) === key(hexes[index])));
    }
  }
  assert.notDeepEqual(approaches[0].at(-2), approaches[1].at(-2));
  checks.push('Mira has connected approaches from Aldera and Rigel sides');
  const conditions = ['calm', 'followingWind', 'headwind'];
  for (const hex of hexMap.filter(item => item.kind === 'sea')) {
    for (const time of [now, now + 7200000]) {
      assert.ok(conditions.includes(getSeaConditionAt(hex.id, time)));
      assert.ok(conditions.includes(getSeaConditionForecastAt(hex.id, time)));
      assert.ok(Number.isFinite(calculateEstimatedArrivalAt([hex.id], time, 6)));
    }
  }
  checks.push('existing sea-condition and forecast functions cover every sea HEX');
  assert.equal(SAVE_VERSION, 7);
  assert.equal(SAVE_KEY, 'shioji-no-shokai:save:v7');
  const oldKey = 'shioji-no-shokai:save:v6';
  const oldValue = JSON.stringify({ version: 6, savedAtRealTime: now, gameState: { playerId: 'legacy-only' } });
  storage.set(oldKey, oldValue);
  assert.equal(loadGame(), null);
  const { useGameStore: store } = await server.ssrLoadModule('/src/state/gameStore.ts');
  const seed = structuredClone(store.getState().gameState);
  assert.equal(seed.playerId, 'player_001');
  assert.deepEqual(Object.keys(seed.portOffers).sort(), ports.map(port => port.id).sort());
  assert.deepEqual(seed.portOffers.port_mira, []);
  for (const ship of seed.ships) assert.equal(ship.currentHexId, getPortHexId(ship.currentPortId));
  saveGame(seed);
  assert.deepEqual(JSON.parse(JSON.stringify(loadGame())), JSON.parse(JSON.stringify(seed)));
  assert.equal(storage.get(oldKey), oldValue);
  const { tutorialWheatContract } = await server.ssrLoadModule('/src/data/contracts.ts');
  store.getState().acceptContract(tutorialWheatContract.id, seed.ships[0].id);
  const accepted = store.getState().gameState;
  assert.ok(accepted.acceptedContract);
  assert.ok(accepted.activeVoyage);
  assert.equal(accepted.activeVoyage.contractId, accepted.acceptedContract.id);
  assert.deepEqual(JSON.parse(JSON.stringify(loadGame())), JSON.parse(JSON.stringify(accepted)));
  const tutorialRoute = getRouteById(tutorialWheatContract.routeId);
  assert.equal(accepted.ships[0].currentHexId, getPortHexId(tutorialRoute.fromPortId));
  assert.equal(storage.get(oldKey), oldValue);
  checks.push('four initial offer arrays; fresh and accepted state round-trip in v7; v6 data untouched');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (server) await server.close();
  Date.now = originalNow;
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
