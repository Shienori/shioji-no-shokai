import assert from 'node:assert/strict';
import { runSuite } from './helpers/windForecastTestUtils.mjs';

// Required API: getWindForecastIssueTime(nowMs),
// getWindForecastAt(hexId,targetMs,issuedAt),
// getWindForecastTimeline(hexId,issuedAt,fromMs=issuedAt,toMs=issuedAt+8days).
// Slots expose issuedAt, hexId, slotIndex, startsAt, endsAt, forecastWind.
await runSuite('timeline', async ({ load, check }) => {
  const f=await load('/src/domain/windForecast.ts');
  const {hexMap}=await load('/src/data/hexMap.ts');
  const id=hexMap.find(h=>h.kind==='sea')?.id;assert.ok(id);
  const issue=Date.parse('2026-11-02T06:00:00+08:00');
  const day=86400000, slot=7200000;
  check('06:00 issue boundary', () => {
    assert.equal(f.getWindForecastIssueTime(issue-1),issue-day);
    assert.equal(f.getWindForecastIssueTime(issue),issue);
    assert.equal(f.getWindForecastIssueTime(issue+1),issue);
    assert.equal(f.getWindForecastIssueTime(issue+day-1),issue);
    assert.equal(f.getWindForecastIssueTime(issue+day),issue+day);
  });
  check('fixed world clock independent of host timezone', () => {
    const previous=process.env.TZ;
    try {
      for(const tz of ['UTC','Asia/Tokyo','America/New_York']) {
        process.env.TZ=tz;
        assert.equal(f.getWindForecastIssueTime(issue-1),issue-day);
        assert.equal(f.getWindForecastIssueTime(issue),issue);
      }
    } finally { if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous; }
  });
  check('target date does not change issue edition', () => {
    const value=f.getWindForecastAt(id,issue+3*day,issue);
    assert.equal(value.issuedAt,issue);
    assert.equal(value.hexId,id);
    assert.deepEqual(f.getWindForecastAt(id,issue+3*day+1,issue),value);
  });
  check('two-hour boundaries', () => {
    const first=f.getWindForecastAt(id,issue,issue);
    assert.deepEqual(f.getWindForecastAt(id,issue+slot-1,issue),first);
    const next=f.getWindForecastAt(id,issue+slot,issue);
    assert.equal(next.slotIndex,first.slotIndex+1);
    assert.equal(first.endsAt,next.startsAt);
  });
  check('eight-day range has 96 complete slots', () => {
    const rows=f.getWindForecastTimeline(id,issue);
    assert.equal(rows.length,96);
    assert.equal(rows[0].startsAt,issue);
    assert.equal(rows.at(-1).endsAt,issue+8*day);
    for(let i=0;i<rows.length;i++) {
      assert.equal(rows[i].issuedAt,issue);
      if(i)assert.equal(rows[i-1].endsAt,rows[i].startsAt);
    }
  });
  check('late-edition current plus seven days remains covered', () => {
    const from=issue+day-60000,to=from+7*day;
    const rows=f.getWindForecastTimeline(id,issue,from,to);
    assert.equal(rows.length,85);
    assert.ok(rows[0].startsAt<=from);
    assert.ok(rows.at(-1).endsAt>=to);
    assert.ok(rows.every(row=>row.issuedAt===issue));
  });
  check('range endpoints and malformed times rejected', () => {
    assert.doesNotThrow(()=>f.getWindForecastAt(id,issue,issue));
    assert.doesNotThrow(()=>f.getWindForecastAt(id,issue+8*day-1,issue));
    for(const target of [issue-1,issue+8*day,NaN,Infinity])assert.throws(()=>f.getWindForecastAt(id,target,issue));
    for(const badIssue of [issue-1,NaN,Infinity])assert.throws(()=>f.getWindForecastAt(id,issue,badIssue));
    assert.throws(()=>f.getWindForecastTimeline(id,issue,issue,issue));
    assert.throws(()=>f.getWindForecastTimeline(id,issue,issue-1,issue+day));
    assert.throws(()=>f.getWindForecastTimeline(id,issue,issue,issue+8*day+1));
    assert.throws(()=>f.getWindForecastIssueTime(NaN));
  });
});
