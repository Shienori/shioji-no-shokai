import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { createContractInstanceId } = await server.ssrLoadModule('/src/domain/contractIdentity.ts');
  const { createAcceptedContract, createOfferedContract } = await server.ssrLoadModule('/src/domain/contractSchedule.ts');
  const { tutorialWheatContract: template } = await server.ssrLoadModule('/src/data/contracts.ts');
  const { getRouteById } = await server.ssrLoadModule('/src/data/routes.ts');
  const { getCargoById } = await server.ssrLoadModule('/src/data/cargos.ts');
  const { createVoyage } = await server.ssrLoadModule('/src/domain/voyage.ts');
  const { initialShip } = await server.ssrLoadModule('/src/data/ships.ts');
  const now = 1792599200000;
  const route = getRouteById(template.routeId);
  const cargo = getCargoById(template.cargoId);
  const offerA = createOfferedContract(template, route, now);
  const offerB = createOfferedContract(template, route, now);
  assert.notEqual(offerA.id, offerB.id);
  assert.equal(offerA.templateId, template.id);
  const acceptedA = createAcceptedContract(template, route, cargo, now, offerA.deadlineAt);
  const acceptedB = createAcceptedContract(template, route, cargo, now, offerA.deadlineAt);
  assert.notEqual(acceptedA.id, acceptedB.id);
  assert.notEqual(acceptedA.id, template.id);
  assert.equal(acceptedA.templateId, template.id);
  assert.equal(acceptedA.deadlineAt, offerA.deadlineAt);
  assert.deepEqual(acceptedA.reward, acceptedB.reward);
  const voyageA = createVoyage(acceptedA, initialShip, 0, now);
  const voyageB = createVoyage(acceptedB, initialShip, 0, now);
  assert.notEqual(voyageA.id, voyageB.id);
  assert.equal(voyageA.contractId, acceptedA.id);
  assert.equal(voyageB.contractId, acceptedB.id);
  const restored = JSON.parse(JSON.stringify({ acceptedA, voyageA }));
  assert.equal(restored.acceptedA.id, restored.voyageA.contractId);
  const originalNow = Date.now;
  const originalRandom = Math.random;
  try {
    Date.now = () => now;
    Math.random = () => 0.5;
    const ids = Array.from({ length: 1000 }, () => createContractInstanceId('accepted'));
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
  console.log('PASS: offer IDs, accepted IDs, voyage references, deadline preservation, JSON round-trip, repeated generation');
} finally {
  await server.close();
}
