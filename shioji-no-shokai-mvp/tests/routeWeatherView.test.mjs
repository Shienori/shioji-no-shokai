import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
let server;
try {
  server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
  const {buildRouteWeatherView:build}=await server.ssrLoadModule('/src/components/contract/routeWeatherView.ts');
  const {hexMap}=await server.ssrLoadModule('/src/data/hexMap.ts');
  const sea=hexMap.filter(hex=>hex.kind==='sea');
  const passages=Array.from({length:6},(_,index)=>({sectionIndex:index<5?0:1,hexId:sea[0].id,nextHexId:sea[1].id,startsAt:1000+index*100,endsAt:1100+index*100}));
  const timeline={passages};
  const assessments=passages.map((passage,index)=>({...passage,hasDelay:index!==2,hasMissing:index===4}));
  const before=JSON.stringify({timeline,assessments});
  const view=build(timeline,assessments);
  assert.equal(view.segments.length,6);
  assert.equal(view.notices.length,4);
  assert.deepEqual(view.notices.map(item=>item.segments.length),[2,1,1,1]);
  assert.equal(view.notices[0].startsAt,1000);assert.equal(view.notices[0].endsAt,1200);
  assert.equal(view.notices[2].hasDelay,true);assert.equal(view.notices[2].hasMissing,true);
  assert.equal(new Set(view.segments.map(item=>item.id)).size,6);
  assert.ok(view.notices.every(item=>Number.isFinite(item.x)&&Number.isFinite(item.y)));
  assert.equal(JSON.stringify({timeline,assessments}),before);
  assert.equal(build(timeline,[]).segments.every(item=>item.hasMissing&&!item.hasDelay),true);
  const mismatched=structuredClone(assessments);mismatched[0].startsAt++;
  assert.equal(build(timeline,mismatched).segments[0].hasMissing,true);
  assert.equal(build(null).segments.length,0);
  console.log('Route weather segment alignment, grouping, repeated HEX identity and missing coverage assertions passed');
} finally {if(server)await server.close();}
