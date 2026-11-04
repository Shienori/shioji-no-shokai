import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true }, appType: 'custom' });
  const load = name => server.ssrLoadModule('/src/' + name + '.ts');
  const { FleetPanel } = await server.ssrLoadModule('/src/components/fleet/FleetPanel.tsx');
  const { PlannedShipVoyageStatus } = await server.ssrLoadModule('/src/components/fleet/PlannedShipVoyageStatus.tsx');
  const { createConfirmedPlanVoyage } = await load('domain/confirmedPlanVoyage');
  const { progressConfirmedPlanLifecycle } = await load('domain/confirmedPlanLifecycle');
  const { getPlannedShipPresentation } = await load('domain/plannedShipPresentation');
  const { buildVoyagePlanRoute } = await load('domain/voyagePlanRoute');
  const { createAcceptedContract } = await load('domain/contractSchedule');
  const { getCargoForContract } = await load('domain/lotContract');
  const { tutorialWheatContract: template } = await load('data/contracts');
  const { getRouteById } = await load('data/routes');
  const { getCargoById } = await load('data/cargos');
  const { initialShip } = await load('data/ships');
  const { ports } = await load('data/ports');
  const { GAME_TIME_MULTIPLIER: multiplier } = await load('data/gameConstants');
  const start = Date.UTC(2026, 10, 4, 23, 59, 30);
  const endpoints = getRouteById(template.routeId);
  const contract = createAcceptedContract(template, endpoints, getCargoById(template.cargoId), start, start + 86400000);
  const stop = ports.find(p => p.id !== endpoints.fromPortId && p.id !== endpoints.toPortId);
  const built = buildVoyagePlanRoute({ departurePortId: endpoints.fromPortId, destinationPortId: endpoints.toPortId },
    { stops: [{ portId: stop.id, refuelTargetPercent: 100 }], legs: [{ waypointHexIds: [] }, { waypointHexIds: [] }] });
  assert.equal(built.ok, true);
  const docked = structuredClone(initialShip);
  docked.fuel.capacityTons = 100;
  docked.fuel.remainingTons = 100;
  const voyage = createConfirmedPlanVoyage({ contract, ship: docked, route: built.route,
    selectedSpeedKnots: docked.cruisingSpeedKnots, operationTime: 0 });
  const initial = { currentGameTime: start, operationTime: 0,
    ships: [{ ...docked, status: 'loading', activeContractId: contract.id }],
    activeVoyage: voyage, acceptedContract: contract,
    voyageMemos: [{ contractId: contract.id, shipId: docked.id, acceptedAt: start, settlement: null }] };
  const calm = (_id, time) => ({ wind: { speedMps: 0, fromDeg: null }, startsAt: time, endsAt: time + 86400000 });
  const at = time => progressConfirmedPlanLifecycle({ ...initial, currentGameTime: time,
    operationTime: (time - start) * multiplier }, time, calm);
  const idle = { ...structuredClone(initialShip), id: 'idle-time-test', name: '時刻非表示テスト船',
    activeContractId: null, status: 'docked' };
  const render = state => {
    const clock = { realTimeMs: state.currentGameTime, operationTimeMs: state.operationTime };
    return [renderToStaticMarkup(createElement(FleetPanel, {
      ships: [state.ships[0], idle], voyage: state.activeVoyage, contract: state.acceptedContract,
      operationTime: state.operationTime, displayClock: clock, onSelectShip: () => {} })),
      renderToStaticMarkup(createElement(PlannedShipVoyageStatus, { ship: state.ships[0],
        voyage: state.activeVoyage, contract: state.acceptedContract, clock }))];
  };
  const check = (state, kind, label, time = null) => {
    const before = JSON.stringify(state);
    const output = render(state);
    for (const html of output) {
      assert.ok(html.includes(`data-voyage-time-kind="${kind}"`), kind);
      assert.ok(html.includes(label), label);
      if (time !== null) assert.ok(html.includes(`data-voyage-time-ms="${time}"`));
    }
    assert.deepEqual(render(JSON.parse(before)), output);
    assert.equal(JSON.stringify(state), before);
    const idlePart = output[0].slice(output[0].indexOf(idle.name));
    assert.equal(idlePart.includes('data-voyage-time-kind='), false);
    return output;
  };
  const loading = check(initial, 'time', '到着予想時刻', voyage.forecastEtaRealTime);
  assert.ok(loading.every(html => html.includes('現在の到着予測ではありません')));
  const sailing = at(voyage.departedRealTime + 1000);
  assert.equal(sailing.activeVoyage.phase, 'sailing');
  check(sailing, 'time', '到着予想時刻', voyage.forecastEtaRealTime);
  const full = at(voyage.departedRealTime + 86400000);
  assert.equal(full.activeVoyage.phase, 'completed');
  const fullModel = getPlannedShipPresentation(full.ships[0], full.activeVoyage, contract);
  const arrival = fullModel.actualArrivalRealTime;
  assert.ok(Number.isFinite(arrival));
  const duration = getCargoForContract(contract).unloadingTimeMsPerUnit * contract.quantity / multiplier;
  assert.ok(duration > 1);
  const justBefore = at(arrival - 1);
  assert.equal(justBefore.activeVoyage.phase, 'sailing');
  check(justBefore, 'time', '到着予想時刻');
  const unloading = at(arrival + 1);
  assert.equal(unloading.activeVoyage.phase, 'unloading');
  const expectedEnd = unloading.currentGameTime +
    (unloading.activeVoyage.unloadingStartedAt + duration * multiplier - unloading.operationTime) / multiplier;
  for (const html of check(unloading, 'time', '荷役終了予定時刻', expectedEnd)) {
    assert.equal(html.includes('>到着予想時刻<'), false);
    assert.ok(html.includes('計画ETA（受注時固定）'));
  }
  const beforeEnd = at(arrival + duration - 1);
  assert.equal(beforeEnd.activeVoyage.phase, 'unloading');
  check(beforeEnd, 'time', '荷役終了予定時刻');
  const afterEnd = at(arrival + duration + 1);
  assert.equal(afterEnd.activeVoyage.phase, 'completed');
  for (const html of check(afterEnd, 'ready', '精算可能')) {
    assert.equal(html.includes('>到着予想時刻<'), false);
    assert.equal(html.includes('>荷役終了予定時刻<'), false);
  }
  check(full, 'ready', '精算可能');
  const call = full.activeVoyage.plannedNavigation.checkpoint.portCalls[0];
  const intermediate = at(call.arrivedAtRealTime + 1);
  assert.equal(intermediate.activeVoyage.phase, 'sailing');
  check(intermediate, 'time', '到着予想時刻');
  const broken = { ...sailing, activeVoyage: { ...sailing.activeVoyage, plannedNavigation: null } };
  for (const html of render(broken)) {
    assert.ok(html.includes('確認できません'));
    assert.equal(html.includes('data-voyage-time-kind="time"'), false);
  }
  const mismatch = { ...sailing, acceptedContract: { ...contract, id: 'wrong-time-contract' } };
  for (const html of render(mismatch)) assert.equal(html.includes('data-voyage-time-kind="time"'), false);
  assert.equal(initial.activeVoyage.forecastEtaRealTime, voyage.forecastEtaRealTime);
  assert.equal(contract.deadlineAt, start + 86400000);
  console.log('Planned voyage time rendering assertions passed; browser interactions and settlement UI not tested.');
} finally {
  if (server) await server.close();
}
