import assert from 'node:assert/strict';
import { runSuite } from './helpers/windForecastTestUtils.mjs';

// Required API in windForecast.ts:
// generateWindForecast(actual, random, accuracy=0.8): Wind (pure, injectable draws).
// createWindForecast(actual,{issuedAt,hexId,slotIndex},accuracy=0.8): Wind (seeded).
await runSuite('generation', async ({ load, check }) => {
  const { generateWindForecast, createWindForecast } = await load('/src/domain/windForecast.ts');
  const { isWindForecastHit } = await load('/src/domain/windForecastAccuracy.ts');
  const issuedAt=Date.parse('2026-11-02T06:00:00+08:00');
  const key={issuedAt,hexId:'test_sea_1',slotIndex:Math.floor(issuedAt/7200000)};
  const inputs=[{fromDeg:null,speedMps:0},{fromDeg:0,speedMps:.1},{fromDeg:359,speedMps:1.999},{fromDeg:0,speedMps:2},{fromDeg:45,speedMps:5},{fromDeg:315,speedMps:10}];
  function draws(first, rest) {
    let count=0;
    return () => {
      if (++count>256) throw new Error('Forecast generation exceeded bounded draw budget');
      return count===1 ? first : rest;
    };
  }
  for (const actual of inputs) {
    for (const rest of [0,.25,.5,1-Number.EPSILON]) {
      check(`hit branch ${JSON.stringify(actual)} / ${rest}`, () => {
        const forecast=generateWindForecast(actual,draws(0,rest),.8);
        assert.equal(isWindForecastHit(actual,forecast),true);
        assert.ok(Number.isFinite(forecast.speedMps) && forecast.speedMps>=0);
      });
      check(`miss branch ${JSON.stringify(actual)} / ${rest}`, () => {
        const forecast=generateWindForecast(actual,draws(.8,rest),.8);
        assert.equal(isWindForecastHit(actual,forecast),false);
        assert.ok(Number.isFinite(forecast.speedMps) && forecast.speedMps>=0);
      });
    }
  }
  check('80 percent draw boundary', () => {
    const a=inputs[4];
    assert.equal(isWindForecastHit(a,generateWindForecast(a,draws(.799999, .5),.8)),true);
    assert.equal(isWindForecastHit(a,generateWindForecast(a,draws(.8, .5),.8)),false);
  });
  check('accuracy 0 and 1 endpoints', () => {
    for (const actual of inputs) {
      assert.equal(isWindForecastHit(actual,generateWindForecast(actual,draws(0,.5),0)),false);
      assert.equal(isWindForecastHit(actual,generateWindForecast(actual,draws(1-Number.EPSILON,.5),1)),true);
    }
  });
  check('seeded reproducibility and call-order independence', () => {
    const a=Object.freeze({...inputs[4]});
    const expected=createWindForecast(a,key);
    createWindForecast(inputs[5],{...key,hexId:'test_sea_other'});
    assert.deepEqual(createWindForecast(a,{...key}),expected);
    assert.deepEqual(a,inputs[4]);
  });
  check('seeded path does not call Math.random', () => {
    const original=Math.random;
    Math.random=()=>{throw new Error('Use deterministic forecast seed');};
    try { createWindForecast(inputs[4],key); } finally { Math.random=original; }
  });
  check('fixed 10000-key sample hit rate is 78 to 82 percent', () => {
    let hits=0;
    for(let i=0;i<10000;i++) {
      const actual=inputs[i%inputs.length];
      const forecast=createWindForecast(actual,{...key,hexId:`test_sea_${i%50}`,slotIndex:key.slotIndex+Math.floor(i/50)});
      if(isWindForecastHit(actual,forecast))hits++;
    }
    const rate=hits/10000;
    console.log(JSON.stringify({sampleSize:10000,hits,hitRate:rate}));
    assert.ok(rate>=.78 && rate<=.82, `hit rate ${rate}`);
  });
  check('reject invalid probabilities and draws', () => {
    for(const p of [-.01,1.01,NaN,Infinity]) assert.throws(()=>generateWindForecast(inputs[4],()=>.5,p));
    for(const draw of [-.1,1,NaN,Infinity]) assert.throws(()=>generateWindForecast(inputs[4],()=>draw,.8));
  });
});
