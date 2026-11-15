import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Run: node tests/unifiedOfferedReward.test.mjs
let server;
try {
  server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const { calculateOfferedReward } = await server.ssrLoadModule('/src/domain/offeredReward.ts');
  const { getShortestRouteDistanceNm } = await server.ssrLoadModule('/src/domain/routeDistance.ts');
  const { getRouteHexIds } = await server.ssrLoadModule('/src/domain/routePath.ts');
  const { HEX_DISTANCE_NM } = await server.ssrLoadModule('/src/domain/hexMap.ts');
  const { routes } = await server.ssrLoadModule('/src/data/routes.ts');
  const { cargoLots } = await server.ssrLoadModule('/src/data/cargoLots.ts');
  let passed = 0;
  const reward = (cargoId, quantityLots, baseDistanceNm = 30) =>
    calculateOfferedReward({ cargoId, quantityLots, baseDistanceNm });

  // Explicit 30nm fixture, not an assertion about the current world map.
  assert.equal(reward('cargo_wheat', 10), 2250);
  assert.equal(reward('cargo_wheat', 2), 450);
  assert.equal(reward('cargo_steel', 1), 585);
  assert.equal(reward('cargo_silk', 1), 315);
  assert.equal(reward('cargo_pottery', 1), 270);
  assert.equal(reward('cargo_timber', 1), 360);
  assert.equal(reward('cargo_wine', 1), 225);
  assert.equal(reward('cargo_salt', 1), 180);
  assert.equal(reward('cargo_spices', 1), 225);
  assert.equal(reward('cargo_wheat', 10, 60), 4300);
  passed += 10;

  const coefficients = {
    cargo_wheat: 1, cargo_steel: 1.3, cargo_silk: 0.7,
    cargo_iron_ore: 1, cargo_pottery: 0.8, cargo_timber: 0.8,
    cargo_wine: 1, cargo_salt: 1, cargo_spices: 1,
  };
  assert.equal(cargoLots.length, Object.keys(coefficients).length);
  for (const lot of cargoLots) {
    assert.equal(lot.rewardMultiplier, coefficients[lot.id]);
    const before = structuredClone(lot);
    reward(lot.id, 1);
    assert.deepEqual(lot, before);
    passed += 2;
  }
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => reward('cargo_wheat', quantity));
    passed += 1;
  }
  for (const distance of [0, -1, NaN, Infinity]) {
    assert.throws(() => reward('cargo_wheat', 1, distance));
    passed += 1;
  }
  assert.throws(() => reward('unknown_cargo', 1));
  assert.throws(() => reward('cargo_wheat', Number.MAX_SAFE_INTEGER));
  passed += 2;

  for (const route of routes) {
    const ids = getRouteHexIds(route.fromPortId, route.toPortId);
    assert.ok(ids && ids.length >= 2);
    assert.equal(getShortestRouteDistanceNm(route.fromPortId, route.toPortId), (ids.length - 1) * HEX_DISTANCE_NM);
    passed += 1;
  }
  assert.throws(() => getShortestRouteDistanceNm('port_selene', 'port_selene'));
  assert.throws(() => getShortestRouteDistanceNm('unknown_port', 'port_aldera'));
  passed += 2;
  console.log(JSON.stringify({ passed }, null, 2));
} finally {
  if (server) await server.close();
}
