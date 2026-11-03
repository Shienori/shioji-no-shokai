import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
let server;
try {
  server = await createServer({root: fileURLToPath(new URL('../', import.meta.url)), server: {middlewareMode: true}, appType: 'custom'});
  const load = name => server.ssrLoadModule('/src/' + name + '.ts');
  const {buildVoyagePlanRoute} = await load('domain/voyagePlanRoute');
  const {createPlannedVoyageCheckpoint, advancePlannedVoyage} = await load('domain/plannedVoyage');
  const {calculateVoyagePortRefuel} = await load('domain/voyagePortCall');
  const {initialShip} = await load('data/ships');
  const fuel = structuredClone(initialShip.fuel);
  const settings = {selectedSpeedKnots: 6, loadSpeedFactor: 1, fuelCapacityTons: fuel.capacityTons,
    referenceSpeedKnots: fuel.referenceSpeedKnots, referenceConsumptionTonsPerVoyageHour: fuel.referenceConsumptionTonsPerVoyageHour};
  const built = buildVoyagePlanRoute({departurePortId: 'port_selene', destinationPortId: 'port_rigel'}, {
    stops: [{portId: 'port_aldera', refuelTargetPercent: 100}], legs: [{waypointHexIds: []}, {waypointHexIds: []}],
  });
  assert.equal(built.ok, true);
  const route = built.route;
  const start = Date.UTC(2026,10,3);
  const calm = (_id,t) => ({wind: {speedMps: 0, fromDeg: null}, startsAt: t, endsAt: t + 86400000});
  const input = {route, settings, checkpoint: createPlannedVoyageCheckpoint(route,start), fuel, untilRealTime: start + 10000000, readActualWind: calm};
  const before = JSON.stringify(input);
  const full = advancePlannedVoyage(input);
  assert.equal(full.status, 'arrived');
  assert.equal(full.arrivalRealTime, start + 7500000);
  assert.equal(full.checkpoint.portCalls.length, 1);
  const call = full.checkpoint.portCalls[0];
  assert.equal(call.portId, 'port_aldera');
  assert.equal(call.arrivedAtRealTime, start + 3000000);
  assert.ok(Math.abs(call.addedFuelTons - 1) < 1e-10);
  assert.ok(Math.abs(full.fuel.remainingTons - 3.5) < 1e-10);
  assert.ok(Math.abs(full.checkpoint.totalFuelUsedTons - 2.5) < 1e-10);
  assert.equal(JSON.stringify(input), before);
  // Cut exactly at the intermediate arrival, then serialize and resume.
  const first = advancePlannedVoyage({...input, untilRealTime: call.arrivedAtRealTime});
  assert.equal(first.status, 'sailing');
  assert.equal(first.checkpoint.currentSectionIndex, 1);
  assert.equal(first.checkpoint.portCalls.length, 1);
  const saved = JSON.parse(JSON.stringify({checkpoint: first.checkpoint, fuel: first.fuel}));
  const resumed = advancePlannedVoyage({...input, ...saved});
  assert.deepEqual(resumed, full);
  const repeated = advancePlannedVoyage({...input, checkpoint: full.checkpoint, fuel: full.fuel});
  assert.deepEqual(repeated, full);
  const noFuel = advancePlannedVoyage({...input, fuel: {...fuel, remainingTons: 0}});
  assert.equal(noFuel.status,'fuelDepleted'); assert.equal(noFuel.checkpoint.portCalls.length,0);
  const absent = advancePlannedVoyage({...input, readActualWind: () => null});
  assert.equal(absent.status,'windUnavailable');
  assert.equal(absent.fuel.remainingTons, fuel.remainingTons);
  assert.deepEqual(calculateVoyagePortRefuel({...fuel, remainingTons:4.5},80),{addedFuelTons:0,departureFuelTons:4.5});
  assert.throws(() => advancePlannedVoyage({...input, untilRealTime:start-1}), RangeError);
  console.log('Planned voyage advance assertions passed');
} finally {if(server) await server.close();}
