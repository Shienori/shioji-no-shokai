import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
let server;
try {
 server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
 const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
 const {createWorldPlanForecast,getWorldPlanForecastAt,buildVoyagePlanForecastFromWorld}=await load('domain/worldPlanForecast');
 const {hexMap}=await load('data/hexMap');
 const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
 const {getSavedWindForecastAt}=await load('domain/contractWindForecast');
 const {buildPlanTimeline,evaluatePlanWeather}=await load('domain/planWeather');
 const now=Date.UTC(2026,10,4),world=createWorldPlanForecast(now),before=JSON.stringify(world);
 const seaIds=hexMap.filter(hex=>hex.kind==='sea').map(hex=>hex.id).sort();
 assert.deepEqual(Object.keys(world.forecastsByHex).sort(),seaIds);
 for(const id of seaIds) {
  const slot=getWorldPlanForecastAt(world,id,now);assert.ok(slot);assert.equal(slot.issuedAt,world.issuedAt);
  assert.equal(world.forecastsByHex[id].length,96);
 }
 for(const hex of hexMap.filter(item=>item.kind==='port'))assert.equal(getWorldPlanForecastAt(world,hex.id,now),null);
 assert.equal(getWorldPlanForecastAt(world,'unknown',now),null);
 assert.equal(getWorldPlanForecastAt(world,seaIds[0],world.validTo),null);
 assert.equal(getWorldPlanForecastAt(world,seaIds[0],world.validFrom-1),null);
 assert.equal(getWorldPlanForecastAt(null,seaIds[0],now),null);
 assert.equal(getWorldPlanForecastAt(world,seaIds[0],NaN),null);
 const endpoint={departurePortId:'port_selene',destinationPortId:'port_rigel'};
 const direct=buildVoyagePlanRoute(endpoint,{stops:[],legs:[{waypointHexIds:[]}]});assert.equal(direct.ok,true);
 const via=buildVoyagePlanRoute(endpoint,{stops:[{portId:'port_aldera',refuelTargetPercent:80}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});assert.equal(via.ok,true);
 for(const route of [direct.route,via.route]) {
  const extracted=buildVoyagePlanForecastFromWorld(route,world);
  assert.equal(extracted.capturedAt,world.capturedAt);
  for(const section of extracted.sections)for(const id of section.seaHexIds)
   assert.deepEqual(getSavedWindForecastAt(section,id,now),getWorldPlanForecastAt(world,id,now));
  const result=evaluatePlanWeather(buildPlanTimeline(route,now,now+60000,6),extracted);assert.equal(result.hasMissing,false);
 }
 const extracted=buildVoyagePlanForecastFromWorld(via.route,world),id=extracted.sections[0].seaHexIds[0];
 extracted.sections[0].forecastsByHex[id][0].forecastWind.speedMps=123;
 const slot=getWorldPlanForecastAt(world,seaIds[0],now);slot.forecastWind.speedMps=456;
 assert.equal(JSON.stringify(world),before);
 assert.deepEqual(JSON.parse(JSON.stringify(world)),world);
 assert.throws(()=>createWorldPlanForecast(NaN));assert.throws(()=>createWorldPlanForecast(now+.5));
 const css=await readFile(new URL('../src/styles/voyagePlanFlow.css',import.meta.url),'utf8');
 for(const color of ['#6B4935','#FFF4DF','#E8BD74'])assert.ok(css.includes(color),`Missing theme color: ${color}`);
 assert.match(css,/\.voyage-flow\s*\{[^}]*background:\s*var\(--bg\)/);
 assert.match(css,/\.voyage-flow-body\s*\{[^}]*background:\s*var\(--bg\)/);
 assert.match(css,/\.voyage-flow-footer\s*\{[^}]*background:\s*var\(--bg\)/);
 assert.ok(css.includes('.voyage-flow-panel[hidden]'));
 assert.ok(css.includes('.route-weather-editor'));
 console.log('Full-sea forecast coverage, shared edition, independent copies and indigo planning theme assertions passed');
} finally {if(server)await server.close();}
