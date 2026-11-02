import assert from 'node:assert/strict';
import { runSuite } from './helpers/windForecastTestUtils.mjs';

await runSuite('integration', async ({ load, check }) => {
  const f=await load('/src/domain/windForecast.ts');
  const {createWindForecast}=f;
  const {isWindForecastHit}=await load('/src/domain/windForecastAccuracy.ts');
  const {getWindAt}=await load('/src/domain/windTimeline.ts');
  const {getSeaConditionAt}=await load('/src/domain/seaCondition.ts');
  const {hexMap}=await load('/src/data/hexMap.ts');
  const cells=hexMap.filter(h=>h.kind==='sea');assert.ok(cells.length>0);
  const issue=Date.parse('2026-11-02T06:00:00+08:00');
  const target=issue+8*3600000;
  check('all sea cells use the final composite wind as forecast input', () => {
    for(const hex of cells) {
      const actual=getWindAt(hex.id,target);
      const value=f.getWindForecastAt(hex.id,target,issue);
      const expected=createWindForecast(actual.wind,{issuedAt:issue,hexId:hex.id,slotIndex:actual.slotIndex});
      assert.deepEqual(value.forecastWind,expected);
      assert.equal(value.issuedAt,issue);assert.equal(value.hexId,hex.id);
      assert.equal(value.slotIndex,actual.slotIndex);
      assert.equal(value.startsAt,actual.startsAt);assert.equal(value.endsAt,actual.endsAt);
      assert.equal(typeof isWindForecastHit(actual.wind,value.forecastWind),'boolean');
      assert.ok(Number.isFinite(value.forecastWind.speedMps) && value.forecastWind.speedMps>=0);
    }
  });
  check('new editions leave actual weather and legacy API unchanged', () => {
    const numeric=cells.map(h=>getWindAt(h.id,target));
    const legacy=cells.map(h=>getSeaConditionAt(h.id,target));
    for(const h of cells) {
      f.getWindForecastAt(h.id,target,issue);
      f.getWindForecastAt(h.id,target,issue-86400000);
    }
    assert.deepEqual(cells.map(h=>getWindAt(h.id,target)),numeric);
    assert.deepEqual(cells.map(h=>getSeaConditionAt(h.id,target)),legacy);
  });
  check('same world forecast shared across callers and retrieval order', () => {
    const id=cells[0].id, expected=f.getWindForecastAt(id,target,issue);
    for(const h of [...cells].reverse())f.getWindForecastAt(h.id,target,issue);
    assert.deepEqual(f.getWindForecastAt(id,target,issue),expected);
  });
  check('caller mutation does not affect later results', () => {
    const id=cells[0].id, value=f.getWindForecastAt(id,target,issue), expected=structuredClone(value);
    value.forecastWind.speedMps=999;
    assert.deepEqual(f.getWindForecastAt(id,target,issue),expected);
  });
  check('saved forecast value remains unchanged when next edition is queried', () => {
    const id=cells[0].id, future=issue+2*86400000;
    const saved=f.getWindForecastAt(id,future,issue), snapshot=structuredClone(saved);
    f.getWindForecastAt(id,future,issue+86400000);
    assert.deepEqual(saved,snapshot);
  });
  check('ports and unknown HEX rejected', () => {
    const port=hexMap.find(h=>h.kind==='port');assert.ok(port);
    for(const id of [port.id,'unknown_hex']) {
      assert.throws(()=>f.getWindForecastAt(id,target,issue));
      assert.throws(()=>f.getWindForecastTimeline(id,issue));
    }
  });
});
