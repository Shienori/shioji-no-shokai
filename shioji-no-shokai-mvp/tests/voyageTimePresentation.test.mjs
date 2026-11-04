import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true }, appType: 'custom' });
  const { getVoyageTimePresentation: present, operationTimeToRealTime: convert } =
    await server.ssrLoadModule('/src/domain/voyageTimePresentation.ts');
  const { GAME_TIME_MULTIPLIER: multiplier } = await server.ssrLoadModule('/src/data/gameConstants.ts');
  const { formatDateTime, ceilTo1Minute } = await server.ssrLoadModule('/src/domain/time.ts');
  const real = Date.UTC(2026, 10, 4, 23, 59, 30), operation = 3600000;
  const clock = { realTimeMs: real, operationTimeMs: operation };
  const contract = { id: 'contract-time-test' };
  const voyage = { contractId: contract.id, phase: 'sailing', settled: false,
    estimatedArrivalAt: operation + 120000 * multiplier, forecastEtaRealTime: real + 180000,
    arrivedAt: null, unloadingStartedAt: null, unloadingCompletedAt: null };
  const input = { voyage, contract, clock, unloadingDurationOperationMs: 60000 * multiplier };
  let assertions = 0;
  const eq = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
  const bad = changes => eq(present({ ...input, ...changes }).kind, 'unavailable');
  eq(convert(operation, clock), real);
  eq(convert(operation + 120000 * multiplier, clock), real + 120000);
  eq(convert(operation - 1000 * multiplier, clock), real - 1000);
  eq(convert(-1, clock), null);
  eq(convert(NaN, clock), null);
  eq(convert(Infinity, clock), null);
  eq(convert(operation, { ...clock, realTimeMs: NaN }), null);
  eq(convert(operation, { ...clock, operationTimeMs: -1 }), null);
  eq(convert(Number.MAX_VALUE, clock), null);
  eq(present({ ...input, voyage: null, contract: null }), { kind: 'none' });
  bad({ voyage: null }); bad({ contract: null }); bad({ contract: { id: 'wrong' } });
  bad({ clock: { ...clock, realTimeMs: Infinity } });
  bad({ voyage: { ...voyage, phase: 'unknown' } });
  bad({ voyage: { ...voyage, settled: true } });
  const arrival = present(input);
  eq(arrival.kind, 'time'); eq(arrival.label, '到着予想時刻');
  eq(arrival.basis, 'existing-arrival-estimate');
  eq(arrival.realTimeMs, real + 120000); eq(arrival.remainingRealMs, 120000);
  eq(arrival.displayRealTimeMs, ceilTo1Minute(real + 120000));
  eq(arrival.value, formatDateTime(ceilTo1Minute(real + 120000)));
  eq(arrival.remainingLabel, '到着まで');
  eq(present({ ...input, voyage: { ...voyage, phase: 'loading' } }).realTimeMs, arrival.realTimeMs);
  eq(present({ ...input, unloadingDurationOperationMs: null }).realTimeMs, arrival.realTimeMs);
  eq(present({ ...input, voyage: { ...voyage, estimatedArrivalAt: operation - multiplier * 1000 } }).remainingRealMs, 0);
  bad({ voyage: { ...voyage, estimatedArrivalAt: NaN } });
  // This adapter does not validate full plans; these are isolated display-input fixtures.
  const planned = { ...voyage, plannedNavigation: {}, estimatedArrivalAt: NaN };
  const plan = present({ ...input, voyage: planned });
  eq(plan.basis, 'fixed-plan'); eq(plan.realTimeMs, planned.forecastEtaRealTime);
  assert.ok(plan.notice.includes('現在の到着予測ではありません')); assertions++;
  bad({ voyage: { ...planned, forecastEtaRealTime: Infinity } });
  bad({ voyage: { ...planned, plannedNavigation: null } });
  const unloading = { ...voyage, phase: 'unloading', arrivedAt: operation,
    unloadingStartedAt: operation, estimatedArrivalAt: NaN, forecastEtaRealTime: NaN };
  const handling = present({ ...input, voyage: unloading });
  eq(handling.kind, 'time'); eq(handling.label, '荷役終了予定時刻');
  eq(handling.basis, 'unloading-schedule'); eq(handling.realTimeMs, real + 60000);
  eq(handling.remainingLabel, '荷役終了まで');
  const laterClock = { realTimeMs: real + 10000, operationTimeMs: operation + 10000 * multiplier };
  eq(present({ ...input, voyage: unloading, clock: laterClock }).realTimeMs, handling.realTimeMs);
  for (const duration of [null, NaN, Infinity, -1])
    bad({ voyage: unloading, unloadingDurationOperationMs: duration });
  bad({ voyage: { ...unloading, unloadingStartedAt: null } });
  bad({ voyage: { ...unloading, arrivedAt: null } });
  bad({ voyage: { ...unloading, unloadingStartedAt: operation - 1 } });
  bad({ voyage: { ...unloading, settled: true } });
  const zero = present({ ...input, voyage: unloading, unloadingDurationOperationMs: 0 });
  eq(zero.remainingRealMs, 0); assert.ok(zero.notice); assertions++;
  const done = { ...unloading, phase: 'completed' };
  eq(present({ ...input, voyage: done }), { kind: 'ready', label: '状態', value: '精算可能' });
  eq(present({ ...input, voyage: { ...done, settled: true } }),
    { kind: 'completed', label: '状態', value: '完了' });
  const serialized = JSON.stringify(input), copy = JSON.parse(serialized);
  eq(present(copy), present(input)); eq(JSON.stringify(input), serialized);
  Object.freeze(input.clock); Object.freeze(input.contract); Object.freeze(input.voyage); Object.freeze(input);
  const originalNow = Date.now;
  try {
    Date.now = () => { throw new Error('Presentation must not sample current time'); };
    eq(present(input), arrival);
  } finally { Date.now = originalNow; }
  console.log(`Voyage time presentation: ${assertions} assertions passed; UI integration not tested.`);
} finally { if (server) await server.close(); }
