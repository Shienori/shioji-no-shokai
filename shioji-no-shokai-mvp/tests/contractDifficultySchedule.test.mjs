import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Run: node tests/contractDifficultySchedule.test.mjs
const originalRandom = Math.random;
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { createOfferedContract, createAcceptedContract, calculateContractSchedule } = await server.ssrLoadModule('/src/domain/contractSchedule.ts');
  const { contractTemplates, tutorialWheatContract } = await server.ssrLoadModule('/src/data/contracts.ts');
  const { getRouteById } = await server.ssrLoadModule('/src/data/routes.ts');
  const { getCargoById } = await server.ssrLoadModule('/src/data/cargos.ts');
  const { GAME_TIME_MULTIPLIER } = await server.ssrLoadModule('/src/data/gameConstants.ts');
  const generatedAt = 1792599200000;
  const hour = 3600000;
  const roundUp = value => Math.ceil(value / 1800000) * 1800000;
  const ranges = { hard: [1, 1.5], normal: [1.5, 2.5], easy: [2.5, 3] };
  let passed = 0;
  for (const difficulty of ['hard', 'normal', 'easy', undefined]) {
    const template = { ...contractTemplates[1], difficulty };
    const snapshot = structuredClone(template);
    const route = getRouteById(template.routeId);
    const cargo = getCargoById(template.cargoId);
    const [minimum, maximum] = ranges[difficulty ?? 'normal'];
    for (const random of [0, 0.25, 0.5, 0.999999, 1 - Number.EPSILON / 2]) {
      Math.random = () => random;
      const offer = createOfferedContract(template, route, generatedAt);
      assert.ok(offer.timeAllowanceRatio >= minimum);
      assert.ok(difficulty === 'easy' ? offer.timeAllowanceRatio <= maximum : offer.timeAllowanceRatio < maximum);
      if (random === 0) assert.equal(offer.timeAllowanceRatio, minimum);
      assert.equal(offer.deadlineAt, roundUp(generatedAt + (route.distance / 6 * offer.timeAllowanceRatio + 1) * hour / GAME_TIME_MULTIPLIER));
      assert.equal(offer.generatedAt, generatedAt);
      assert.equal(offer.templateId, template.id);
      const accepted = createAcceptedContract(template, route, cargo, generatedAt + 600000, offer.deadlineAt);
      assert.equal(accepted.deadlineAt, offer.deadlineAt, 'accepting later must not extend the deadline');
      assert.equal(accepted.reward.offeredReward, template.offeredReward);
      assert.deepEqual(template, snapshot);
      passed += 1;
    }
  }
  Math.random = () => 0.5;
  const route = getRouteById(tutorialWheatContract.routeId);
  const schedule = calculateContractSchedule(tutorialWheatContract, route, generatedAt);
  assert.equal(schedule.deadlineAt, roundUp(generatedAt + tutorialWheatContract.deadlineHours * hour / GAME_TIME_MULTIPLIER));
  passed += 1;
  for (const template of contractTemplates.filter(item => item.id !== tutorialWheatContract.id)) {
    const route = getRouteById(template.routeId);
    const offer = createOfferedContract(template, route, generatedAt);
    const [minimum, maximum] = ranges[template.difficulty ?? 'normal'];
    assert.ok(offer.timeAllowanceRatio >= minimum && offer.timeAllowanceRatio < maximum);
    passed += 1;
  }
  console.log(JSON.stringify({ passed }, null, 2));
} finally {
  Math.random = originalRandom;
  if (server) await server.close();
}
