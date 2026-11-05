import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { calculateFreeRefuel: calculate, applyFreeRefuel: apply, formatFuelTons: format } = await server.ssrLoadModule('/src/domain/freeRefuel.ts');
  const { initialShip } = await server.ssrLoadModule('/src/data/ships.ts');
  let assertions = 0;
  const eq = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
  const near = (actual, expected) => { assert.ok(Math.abs(actual - expected) <= 1e-12); assertions++; };
  const rejects = fn => { assert.throws(fn); assertions++; };

  const fractional = calculate(0.37, 3, 24);
  eq(fractional.targetTenths, 24); eq(fractional.targetTons, 2.4);
  eq(fractional.beforeTons, 0.37); near(fractional.addedTons, 2.03);
  eq(fractional.afterTons, 2.4); eq(fractional.costGold, 0);
  for (const [remaining, capacity, target, added, after] of [
    [0, 3, 0, 0, 0], [0, 3, 1, 0.1, 0.1], [0, 3, 30, 3, 3],
    [2.4, 3, 24, 0, 2.4], [2.7, 3, 24, 0, 2.7],
    [3, 3, 30, 0, 3], [2.34, 3, 0, 0, 2.34],
    [0.099, 3, 1, 0.001, 0.1], [2.34, 2.35, 23, 0, 2.34],
  ]) {
    const result = calculate(remaining, capacity, target);
    near(result.addedTons, added); eq(result.afterTons, after); eq(result.costGold, 0);
  }
  for (const args of [
    [-1, 3, 1], [NaN, 3, 1], [Infinity, 3, 1], [0, 0, 0],
    [0, -1, 0], [0, NaN, 0], [0, Infinity, 0], [4, 3, 1],
    [0, 3, -1], [0, 3, 0.1], [0, 3, NaN], [0, 3, Infinity],
    [0, 3, Number.MAX_SAFE_INTEGER + 1], [0, 3, 31], [0, 2.35, 24],
  ]) rejects(() => calculate(...args));

  const source = structuredClone(initialShip);
  source.fuel = { ...source.fuel, capacityTons: 3, remainingTons: 0.37 };
  const before = JSON.stringify(source);
  Object.freeze(source.fuel); Object.freeze(source);
  const applied = apply(source, 24);
  eq(JSON.stringify(source), before); eq(applied.ship.fuel.remainingTons, 2.4);
  eq(applied.ship, { ...source, fuel: { ...source.fuel, remainingTons: 2.4 } });
  assert.notEqual(applied.ship, source); assertions++;
  assert.notEqual(applied.ship.fuel, source.fuel); assertions++;
  eq(apply(applied.ship, 24).refuel.addedTons, 0);
  eq(apply(applied.ship, 24).refuel.costGold, 0);
  rejects(() => apply({ ...source, kind: 'sailing' }, 24));
  rejects(() => apply({ ...source, fuel: undefined }, 24));
  rejects(() => apply({ ...source, fuel: { ...source.fuel, remainingTons: NaN } }, 24));
  rejects(() => apply(source, 31));

  for (const [value, expected] of [
    [0, '0.0t'], [0.001, '0.1t未満'], [0.049, '0.1t未満'],
    [0.05, '0.1t'], [0.1, '0.1t'], [2.34, '2.3t'], [2.36, '2.4t'],
    [null, '算出不可'], [-1, '算出不可'], [NaN, '算出不可'], [Infinity, '算出不可'],
  ]) eq(format(value), expected);
  eq(source.fuel.remainingTons, 0.37);
  console.log(`Free refuel helpers: ${assertions} assertions passed; UI, acceptance and persistence integration not tested.`);
} finally { if (server) await server.close(); }
