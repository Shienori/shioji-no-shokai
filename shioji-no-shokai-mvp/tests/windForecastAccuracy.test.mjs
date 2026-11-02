import assert from 'node:assert/strict';
import { runSuite, near } from './helpers/windForecastTestUtils.mjs';

// Required API: angularDifferenceDeg(a,b), isWindForecastHit(actual,forecast).
await runSuite('accuracy', async ({ load, check }) => {
  const { angularDifferenceDeg, isWindForecastHit } = await load('/src/domain/windForecastAccuracy.ts');
  const wind = (fromDeg, speedMps) => ({ fromDeg, speedMps });
  const actual = wind(45, 5);
  const cases = [
    ['exact match', wind(45,5), true],
    ['direction within tolerance', wind(75,5), true],
    ['direction +45 boundary', wind(90,5), true],
    ['direction -45 boundary', wind(0,5), true],
    ['direction exceeds boundary', wind(90.001,5), false],
    ['speed +2 boundary', wind(45,7), true],
    ['speed -2 boundary', wind(45,3), true],
    ['speed exceeds upper boundary', wind(45,7.001), false],
    ['speed exceeds lower boundary', wind(45,2.999), false],
    ['both boundaries inclusive', wind(90,7), true],
    ['direction only misses', wind(135,5), false],
    ['speed only misses', wind(45,8), false],
    ['both miss', wind(135,8), false]
  ];
  for (const [name, forecast, expected] of cases)
    check(name, () => assert.equal(isWindForecastHit(actual,forecast),expected));
  for (const [a,b,expected] of [[350,10,20],[10,350,20],[315,0,45],[0,180,180],[359,44,45]])
    check(`circular angle ${a}/${b}`, () => near(angularDifferenceDeg(a,b),expected));
  for (const [name,a,b,expected] of [
    ['both calm',wind(null,0),wind(null,0),true],
    ['calm to weak',wind(null,0),wind(0,1.9),true],
    ['weak to calm',wind(0,1.9),wind(null,0),true],
    ['weak opposite directions ignored',wind(0,1.9),wind(180,1.9),true],
    ['forecast at 2 requires direction',wind(0,1.9),wind(180,2),false],
    ['actual at 2 requires direction',wind(0,2),wind(180,1.9),false],
    ['aligned at weak threshold',wind(0,1.9),wind(0,2),true],
    ['both at 2 compare direction',wind(0,2),wind(180,2),false],
    ['calm versus 2 has no comparable direction',wind(null,0),wind(0,2),false]
  ]) check(name, () => assert.equal(isWindForecastHit(a,b),expected));
  for (const invalid of [wind(null,1),wind(0,0),wind(0,-1),wind(360,5),wind(-1,5),wind(NaN,5),wind(0,Infinity),wind(0,NaN)]) {
    check(`reject malformed wind ${JSON.stringify(invalid)}`, () => {
      assert.throws(() => isWindForecastHit(invalid,actual));
      assert.throws(() => isWindForecastHit(actual,invalid));
    });
  }
  check('comparison does not mutate inputs', () => {
    const a=Object.freeze(wind(45,5)), b=Object.freeze(wind(90,7));
    assert.equal(isWindForecastHit(a,b),true);
  });
});
