import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { shionamiDesignV1: design, getShipDesign } = await server.ssrLoadModule('/src/data/shipDesigns.ts');
  const { initialShip } = await server.ssrLoadModule('/src/data/ships.ts');
  const { createInitialShionamiFuel } = await server.ssrLoadModule('/src/domain/coalFuel.ts');
  assert.equal(design.version, 'shionami-design-v1');
  assert.equal(getShipDesign(initialShip.id), design);
  assert.equal(getShipDesign('unknown_ship'), null);
  assert.equal(design.validationStatus, 'concept-only');
  assert.deepEqual(design.dimensions, {
    lengthOverallM: 14, lengthWaterlineM: 13, hullBeamM: 4,
    overallBeamMinM: 6, overallBeamMaxM: 6.5, mouldedDepthM: 1.9, fullLoadDraftM: 1.2,
  });
  assert.ok(design.dimensions.lengthWaterlineM <= design.dimensions.lengthOverallM);
  assert.ok(design.dimensions.hullBeamM < design.dimensions.overallBeamMinM);
  assert.ok(design.dimensions.overallBeamMinM <= design.dimensions.overallBeamMaxM);
  assert.ok(design.dimensions.fullLoadDraftM < design.dimensions.mouldedDepthM);
  assert.equal(Object.values(design.weightBudgetTons).reduce((sum, value) => sum + value, 0), design.nominalFullLoadDisplacementTons);
  assert.equal(design.nominalFullLoadDisplacementTons, 35);
  assert.equal(design.cargoCapacity.maxWeightTons, 10);
  assert.equal(design.cargoCapacity.maxVolumeM3, 12);
  assert.equal(design.cargoCapacity.applicationStatus, 'active-for-new-contracts');
  assert.equal(design.weightBudgetTons.cargo, design.cargoCapacity.maxWeightTons);
  assert.equal(design.weightBudgetTons.coal, design.fuel.capacityTons);
  assert.equal(initialShip.cruisingSpeedKnots, design.speed.cruisingKnots);
  assert.equal(initialShip.maxSpeedKnots, design.speed.continuousMaxKnots);
  const fuel = createInitialShionamiFuel();
  assert.equal(fuel.capacityTons, design.fuel.capacityTons);
  assert.equal(fuel.referenceSpeedKnots, design.fuel.referenceSpeedKnots);
  assert.equal(fuel.referenceConsumptionTonsPerVoyageHour, design.fuel.referenceConsumptionTonsPerVoyageHour);
  const roundTrip = JSON.parse(JSON.stringify(design));
  assert.deepEqual(roundTrip, design);
  console.log(JSON.stringify({ result: 'passed', checks: ['approved dimensions and weight budget', 'cargo capacity active for new contracts', 'current speed and coal configuration agree', 'lookup and serialization'] }, null, 2));
} finally {
  if (server) await server.close();
}
