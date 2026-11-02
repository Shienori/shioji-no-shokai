import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const c = await server.ssrLoadModule('/src/domain/coastalWind.ts');
  const t = await server.ssrLoadModule('/src/domain/windTimeline.ts');
  const legacy = await server.ssrLoadModule('/src/domain/seaCondition.ts');
  const { hexMap } = await server.ssrLoadModule('/src/data/hexMap.ts');
  const { worldMap } = await server.ssrLoadModule('/src/data/worldMap.ts');
  const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
  const calm = { speedMps:0, fromDeg:null };
  const west = { east:-1, north:0, distanceFactor:1 };
  let passed=0;
  const check = (name,fn) => { fn(); passed++; console.log(`PASS ${name}`); };
  check('meteorological directions roundtrip',()=>{
    for(let angle=0;angle<360;angle+=45) { const w=c.vectorToWind(c.windToVector({speedMps:5,fromDeg:angle})); near(w.speedMps,5);near(w.fromDeg,angle); }
    near(c.windToVector({speedMps:5,fromDeg:90}).east,-5);
  });
  check('projection matches existing SVG north',()=>{
    assert.ok(c.axialToWorld({q:0,r:1}).north>0);
    assert.ok(c.axialToWorld({q:1,r:0}).east>0);
  });
  check('diurnal peaks and transitions',()=>{near(c.diurnalStrength(14),3);near(c.diurnalStrength(2),-1.5);near(c.diurnalStrength(8),0);near(c.diurnalStrength(20),0);});
  check('day/night reversal',()=>{near(c.combineCoastalWind(calm,west,14).wind.fromDeg,90);near(c.combineCoastalWind(calm,west,2).wind.fromDeg,270);});
  check('L corner is averaged not doubled',()=>{
    const p={east:-.5,north:-.5,distanceFactor:1};
    near(c.combineCoastalWind(calm,p,14).wind.fromDeg,45);
    near(c.combineCoastalWind(calm,p,2).wind.fromDeg,225);
    near(c.combineCoastalWind(calm,p,14).wind.speedMps,3/Math.sqrt(2));
  });
  check('distance attenuation and unique terrain',()=>{
    for(const [d,f] of [[1,1],[2,.6],[3,.3],[4,0]])near(c.buildCoastalProfile({q:0,r:0},[{q:-d,r:0}]).distanceFactor,f);
    const a=[{q:-1,r:0}];assert.deepEqual(c.buildCoastalProfile({q:0,r:0},a),c.buildCoastalProfile({q:0,r:0},[...a,...a]));
  });
  check('offshore background unchanged',()=>{const w={speedMps:5,fromDeg:135};const r=c.combineCoastalWind(w,{...west,distanceFactor:0},14);near(r.wind.speedMps,5);near(r.wind.fromDeg,135);});
  check('suppression and vector cancellation',()=>{
    for(const [s,f] of [[0,1],[2,1],[5,.7],[7,.4],[10,.2]])near(c.backgroundSuppression(s),f);
    const w=c.combineCoastalWind({speedMps:2,fromDeg:270},west,14);near(w.wind.speedMps,1);near(w.wind.fromDeg,90);
    assert.deepEqual(c.vectorToWind({east:0,north:0}),calm);
  });
  const cells=hexMap.filter(h=>h.kind==='sea');assert.ok(cells.length>0);
  const id=cells[0].id, boundary=Date.parse('2026-11-02T06:00:00Z');
  check('legacy time slots shared / stable within slot',()=>{
    const a=t.getWindAt(id,boundary),b=t.getWindAt(id,boundary+7199999);
    assert.deepEqual(a,b);assert.equal(a.slotIndex,legacy.getSeaConditionSlotIndex(boundary));
    assert.equal(t.getWindAt(id,boundary-1).slotIndex,a.slotIndex-1);
    assert.equal(t.getWindAt(id,boundary+7200000).slotIndex,a.slotIndex+1);
  });
  check('seven-day coverage and partial boundary slots',()=>{
    assert.equal(t.getWindTimeline(id,boundary).length,84);
    const rows=t.getWindTimeline(id,boundary+1);assert.equal(rows.length,85);
    assert.ok(rows[0].startsAt<=boundary+1);assert.ok(rows.at(-1).endsAt>=boundary+1+7*86400000);
    for(let i=1;i<rows.length;i++)assert.equal(rows[i-1].endsAt,rows[i].startsAt);
  });
  check('all actual map cells reproduce terrain composition',()=>{
    const land=worldMap.terrain.filter(x=>x.kind==='land');
    const old=cells.map(h=>legacy.getSeaConditionAt(h.id,boundary));
    for(const h of cells){
      const slot=t.getWindAt(h.id,boundary);
      const profile=c.buildCoastalProfile(h,land);
      const shifted=(slot.startsAt+slot.endsAt)/2+t.WORLD_UTC_OFFSET_MINUTES*60000;
      const hour=((shifted%86400000)+86400000)%86400000/3600000;
      assert.deepEqual(slot.backgroundWind,t.generateBackgroundWind(h.id,slot.slotIndex));
      assert.deepEqual(slot.wind,c.combineCoastalWind(slot.backgroundWind,profile,hour).wind);
      assert.ok(Number.isFinite(slot.wind.speedMps));
    }
    assert.deepEqual(cells.map(h=>legacy.getSeaConditionAt(h.id,boundary)),old);
  });
  check('background generator domains and no Math.random',()=>{
    const original=Math.random;Math.random=()=>{throw new Error('must not use Math.random');};
    try {for(let i=0;i<84;i++){const w=t.generateBackgroundWind(id,i);assert.ok([0,2,5,7,10].includes(w.speedMps));assert.ok(w.speedMps===0?w.fromDeg===null:[0,45,90,135,180,225,270,315].includes(w.fromDeg));}}finally{Math.random=original;}
  });
  check('returned objects cannot mutate future results',()=>{
    const before=t.getWindAt(id,boundary);const expected=structuredClone(before);
    before.wind.speedMps=999;before.backgroundWind.speedMps=999;
    assert.deepEqual(t.getWindAt(id,boundary),expected);
  });
  check('invalid input rejected',()=>{
    assert.throws(()=>c.windToVector({speedMps:1,fromDeg:null}));
    assert.throws(()=>c.buildCoastalProfile({q:0,r:0},[{q:0,r:0}]));
    assert.throws(()=>t.getWindAt('missing',boundary));assert.throws(()=>t.getWindAt(id,NaN));
    const port=hexMap.find(h=>h.kind==='port');if(port)assert.throws(()=>t.getWindAt(port.id,boundary));
    assert.throws(()=>t.getWindTimeline(id,boundary,boundary));
    assert.throws(()=>t.getWindTimeline(id,boundary,boundary+8*86400000));
  });
  console.log(JSON.stringify({passed,failed:0}));
} finally { if(server)await server.close(); }
