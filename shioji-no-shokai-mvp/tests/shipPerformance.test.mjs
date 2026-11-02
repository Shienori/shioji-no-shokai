import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom',
});
let passed = 0;
let failed = 0;
const near = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};
const test = (name, run) => {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`, error); }
};
try {
  const { calculateWindSpeedFactor: factor, calculateEffectiveSpeedKnots: speed, calculateFuelRate: fuel } =
    await server.ssrLoadModule('/src/domain/shipPerformance.ts');
  const calm = Object.freeze({ speedMps: 0, fromDeg: null });
  const wind = (speedMps, fromDeg) => ({ speedMps, fromDeg });

  test('calm leaves powered ship at selected speed', () => {
    for (const heading of [0, 90, 180, 359.99]) near(factor(heading, calm), 1);
    near(speed(6, 1, 0, calm), 6);
  });
  test('head tail and cross wind examples', () => {
    near(factor(0, wind(5, 0)), 0.95);
    near(factor(0, wind(10, 0)), 0.8);
    near(factor(0, wind(10, 180)), 1.08);
    near(factor(0, wind(10, 90)), 0.95);
    near(factor(0, wind(10, 270)), 0.95);
  });
  test('oblique wind combines longitudinal and lateral effects', () => {
    near(factor(0, wind(10, 45)), 0.875);
    near(factor(0, wind(10, 135)), 1.015);
    near(factor(0, wind(10, 315)), 0.875);
  });
  test('reversing heading exchanges headwind and tailwind', () => {
    near(factor(0, wind(10, 0)), 0.8);
    near(factor(180, wind(10, 0)), 1.08);
  });
  test('rotation and north wrap preserve relative angle', () => {
    for (const heading of [0, 30, 120, 250, 359]) {
      near(factor(heading, wind(7, (heading + 45) % 360)), factor(0, wind(7, 45)));
    }
    near(factor(359, wind(7, 1)), factor(0, wind(7, 2)));
  });
  test('strong wind clamps and finite input grid stays within bounds', () => {
    near(factor(0, wind(100, 0)), 0.6);
    near(factor(0, wind(100, 180)), 1.08);
    near(factor(0, wind(100, 90)), 0.6);
    for (const strength of [0.01, 2, 5, 10, 20, 100]) {
      for (let direction = 0; direction < 360; direction += 5) {
        const value = factor(17, wind(strength, direction));
        assert.ok(Number.isFinite(value) && value >= 0.6 && value <= 1.08);
      }
    }
  });
  test('direction and clamp boundaries are continuous', () => {
    assert.ok(Math.abs(factor(0, wind(10, 90 - 1e-6)) - factor(0, wind(10, 90 + 1e-6))) < 1e-7);
    const limit = Math.sqrt(200);
    assert.ok(Math.abs(factor(0, wind(limit - 1e-6, 0)) - factor(0, wind(limit + 1e-6, 0))) < 1e-6);
  });
  test('effective speed applies load once without legacy multiplier', () => {
    near(speed(6, 0.9, 0, calm), 5.4);
    near(speed(6, 0.9, 0, wind(10, 0)), 4.32);
    near(speed(6, 1, 0, wind(10, 180)), 6.48);
    near(speed(7, 1, 0, wind(10, 180)), 7.56);
  });
  test('frozen input is unchanged and results repeat', () => {
    const input = Object.freeze(wind(7, 45));
    const before = JSON.stringify(input);
    const first = speed(6, 0.9, 0, input);
    for (let i = 0; i < 20; i++) assert.equal(speed(6, 0.9, 0, input), first);
    assert.equal(JSON.stringify(input), before);
  });
  test('reference fuel rate and seven knot cubic example', () => {
    near(fuel(6, 10), 10);
    near(fuel(7, 10), 10 * 397 / 270);
    assert.ok(fuel(5, 10) < fuel(6, 10));
    assert.ok(fuel(6, 10) < fuel(7, 10));
  });
  test('fuel reference speed and units are explicit without hidden sixfold rate', () => {
    near(fuel(8, 3, 8), 3);
    near(fuel(4, 100, 8), 30);
    near(fuel(6, 20), 2 * fuel(6, 10));
  });
  test('constant wind passage fuel examples use duration not actual speed setting', () => {
    const distance = 60;
    const baseline = fuel(6, 10) * distance / speed(6, 1, 0, calm);
    near(baseline, 100);
    near(fuel(6, 10) * distance / speed(6, 1, 0, wind(10, 0)) / baseline, 1.25);
    near(fuel(6, 10) * distance / speed(6, 1, 0, wind(10, 180)) / baseline, 1 / 1.08);
    near(fuel(7, 10) * distance / speed(7, 1, 0, calm) / baseline, 397 / 315);
  });
  test('invalid headings are rejected even in calm', () => {
    for (const value of [-1, 360, NaN, Infinity, -Infinity, undefined, '0']) {
      assert.throws(() => factor(value, calm));
    }
  });
  test('invalid wind speed direction and calm shape are rejected', () => {
    for (const value of [wind(-1, 0), wind(NaN, 0), wind(Infinity, 0), wind(0, 0), wind(1, null), wind(1, -1), wind(1, 360), wind(1, NaN), wind(1, Infinity), wind('1', 0)]) {
      assert.throws(() => factor(0, value));
    }
  });
  test('invalid selected speeds and load factors are rejected', () => {
    for (const value of [0, -1, NaN, Infinity, -Infinity, undefined, '6']) {
      assert.throws(() => speed(value, 1, 0, calm));
    }
    for (const value of [0, -1, 1.01, NaN, Infinity, undefined, '1']) {
      assert.throws(() => speed(6, value, 0, calm));
    }
  });
  test('invalid fuel arguments are rejected', () => {
    for (const value of [0, -1, NaN, Infinity, -Infinity, '6']) {
      assert.throws(() => fuel(value, 10));
      assert.throws(() => fuel(6, value));
      assert.throws(() => fuel(6, 10, value));
    }
  });
  test('numeric overflow is rejected instead of returning infinity or NaN', () => {
    assert.throws(() => factor(0, wind(Number.MAX_VALUE, 0)), RangeError);
    assert.throws(() => speed(Number.MAX_VALUE, 1, 0, wind(10, 180)), RangeError);
    assert.throws(() => fuel(Number.MAX_VALUE, 1), RangeError);
  });
} finally {
  await server.close();
}
console.log(JSON.stringify({ passed, failed }));
if (failed) process.exitCode = 1;
