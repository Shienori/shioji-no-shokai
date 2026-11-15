import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Run: node tests/normalOfferReward.test.mjs
const originalRandom = Math.random;
let server;
try {
  server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const load = path => server.ssrLoadModule(path);
  const { createOfferedContract, createAcceptedContract } = await load('/src/domain/contractSchedule.ts');
  const { calculateOfferedReward } = await load('/src/domain/offeredReward.ts');
  const { getShortestRouteDistanceNm } = await load('/src/domain/routeDistance.ts');
  const { contractTemplates, tutorialWheatContract } = await load('/src/data/contracts.ts');
  const { getRouteById } = await load('/src/data/routes.ts');
  const { getCargoLotById } = await load('/src/data/cargoLots.ts');
  const { getCargoById } = await load('/src/data/cargos.ts');
  const { GAME_TIME_MULTIPLIER } = await load('/src/data/gameConstants.ts');
  const generatedAt = 1792599200000;
  Math.random = () => 0.5;
  let passed = 0;
  for (const template of contractTemplates.filter(item => item.id !== tutorialWheatContract.id)) {
    const before = structuredClone(template);
    const route = getRouteById(template.routeId);
    const routeBefore = structuredClone(route);
    const lot = getCargoLotById(template.cargoId);
    const distance = getShortestRouteDistanceNm(route.fromPortId, route.toPortId);
    const expected = Math.round(
      Math.max(template.quantity * lot.weightTonsPerLot, template.quantity * lot.volumeM3PerLot)
      * lot.rewardMultiplier * (20 + 35 * (distance / 6) + distance),
    );
    const offer = createOfferedContract(template, route, generatedAt);
    assert.equal(offer.offeredReward, expected);
    assert.equal(offer.offeredReward, calculateOfferedReward({ cargoId: template.cargoId, quantityLots: template.quantity, baseDistanceNm: distance }));
    const deadline = generatedAt + (route.distance / 6 * offer.timeAllowanceRatio + 1) * 3600000 / GAME_TIME_MULTIPLIER;
    assert.equal(offer.deadlineAt, Math.ceil(deadline / 1800000) * 1800000);

    const changedTemplate = { ...template, offeredReward: -999 };
    assert.equal(createOfferedContract(changedTemplate, route, generatedAt).offeredReward, expected);
    const changedDistance = { ...route, distance: route.distance + 123 };
    assert.equal(createOfferedContract(template, changedDistance, generatedAt).offeredReward, expected);

    const accepted = createAcceptedContract(template, route, getCargoById(template.cargoId), generatedAt + 1000, offer.deadlineAt, offer.offeredReward);
    assert.equal(accepted.reward.offeredReward, offer.offeredReward);
    assert.equal(accepted.deadlineAt, offer.deadlineAt);
    // Existing stored offers may have historical prices: retain, never reprice.
    const historical = createAcceptedContract(template, route, getCargoById(template.cargoId), generatedAt + 1000, offer.deadlineAt, 777);
    assert.equal(historical.reward.offeredReward, 777);
    assert.equal(createAcceptedContract(template, route, getCargoById(template.cargoId), generatedAt + 1000, offer.deadlineAt, 0).reward.offeredReward, 0);
    assert.deepEqual(template, before);
    assert.deepEqual(route, routeBefore);
    assert.throws(() => createOfferedContract(template, { ...route, id: 'wrong_route' }, generatedAt));
    passed += 12;
  }
  console.log(JSON.stringify({ passed }, null, 2));
} finally {
  Math.random = originalRandom;
  if (server) await server.close();
}
