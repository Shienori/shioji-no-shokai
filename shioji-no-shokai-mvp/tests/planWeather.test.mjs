import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server;
try {
 server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
 const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
 const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
 const {createVoyagePlanForecast}=await load('domain/voyagePlanForecast');
 const {buildPlanTimeline,getPlanPosition,evaluatePlanWeather,PLAN_DELAY_NOTICE,PLAN_FORECAST_MISSING_NOTICE,PLAN_NO_DELAY_NOTICE}=await load('domain/planWeather');
 const {calculateWindSpeedFactor}=await load('domain/shipPerformance');
 const {getPortHexId,hexMap}=await load('data/hexMap');
 const {PlanWeatherChart}=await server.ssrLoadModule('/src/components/map/PlanWeatherChart.tsx');
 const start=Date.UTC(2026,10,3),departure=start+60000;
 const built=buildVoyagePlanRoute({departurePortId:'port_selene',destinationPortId:'port_rigel'},
 {stops:[{portId:'port_aldera',refuelTargetPercent:100}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});assert.equal(built.ok,true);
 const route=built.route,timeline=buildPlanTimeline(route,start,departure,6);
 assert.equal(timeline.plannedEtaRealTime,departure+7500000);
 assert.equal(getPlanPosition(timeline,start).hexId,getPortHexId('port_selene'));
 assert.equal(getPlanPosition(timeline,departure-1).status,'notDeparted');
 assert.equal(getPlanPosition(timeline,timeline.plannedEtaRealTime).hexId,getPortHexId('port_rigel'));
 assert.equal(getPlanPosition(timeline,timeline.plannedEtaRealTime+100000).progress,1);
 const second=timeline.passages.find(passage=>passage.sectionIndex===1);
 assert.equal(getPlanPosition(timeline,second.startsAt).sectionIndex,1);
 const mid=getPlanPosition(timeline,departure+1000);assert.ok(mid.progress>0&&mid.progress<1);
 const forecast=createVoyagePlanForecast(route,start);
 for(const section of forecast.sections)for(const rows of Object.values(section.forecastsByHex))for(const row of rows)row.forecastWind={speedMps:0,fromDeg:null};
 const before=JSON.stringify({route,forecast,timeline});
 assert.deepEqual([evaluatePlanWeather(timeline,forecast).hasDelay,evaluatePlanWeather(timeline,forecast).hasMissing],[false,false]);
 const first=timeline.passages[0],withWind=speed=>{
  const copy=structuredClone(forecast);for(const row of copy.sections[0].forecastsByHex[first.hexId])row.forecastWind={speedMps:speed,fromDeg:first.headingDeg};return copy;
 };
 assert.equal(calculateWindSpeedFactor(first.headingDeg,{speedMps:5,fromDeg:first.headingDeg}),.95);
 assert.equal(evaluatePlanWeather(timeline,withWind(5)).passages[0].hasDelay,true);
 assert.equal(evaluatePlanWeather(timeline,withWind(5-1e-6)).passages[0].hasDelay,false);
 assert.equal(evaluatePlanWeather(timeline,withWind(5+1e-6)).passages[0].hasDelay,true);
 const boundary=forecast.sections[0].forecastsByHex[first.hexId].find(row=>row.startsAt>departure).startsAt;
 const boundaryTimeline=buildPlanTimeline(route,boundary-60000,boundary-1000,6);
 const changed=structuredClone(forecast);
 const laterRow=changed.sections[0].forecastsByHex[first.hexId].find(row=>row.startsAt===boundary);
 laterRow.forecastWind={speedMps:10,fromDeg:first.headingDeg};
 assert.equal(evaluatePlanWeather(boundaryTimeline,changed).passages[0].hasDelay,true);
 const end=forecast.sections[0].validTo;
 const outside=buildPlanTimeline(route,end+1000,end+2000,6);
 assert.equal(evaluatePlanWeather(outside,forecast).hasMissing,true);
 assert.equal(evaluatePlanWeather(outside,forecast).hasDelay,false);
 assert.equal(getPlanPosition(outside,outside.plannedEtaRealTime).progress,1);
 const partial=buildPlanTimeline(route,end-60000,end-1000,6),partialAssessment=evaluatePlanWeather(partial,withWind(5));
 assert.equal(partialAssessment.hasDelay,true);assert.equal(partialAssessment.hasMissing,true);
 assert.equal(evaluatePlanWeather(timeline,null).hasMissing,true);
 const wrong=structuredClone(forecast);wrong.sections[0].routeId='wrong-route';assert.equal(evaluatePlanWeather(timeline,wrong).hasMissing,true);
 // Explicit shared waypoint: never assume that two independently shortest paths overlap.
 let repeatedFixture=null;
 for(const hex of hexMap.filter(item=>item.kind==='sea')) {
  const candidate=buildVoyagePlanRoute({departurePortId:'port_selene',destinationPortId:'port_aldera'},
   {stops:[{portId:'port_rigel',refuelTargetPercent:100}],legs:[{waypointHexIds:[hex.id]},{waypointHexIds:[hex.id]}]});
  if(!candidate.ok)continue;
  const candidateTimeline=buildPlanTimeline(candidate.route,start,departure,6);
  const outward=candidateTimeline.passages.find(passage=>passage.sectionIndex===0&&passage.hexId===hex.id);
  const returning=candidateTimeline.passages.find(passage=>passage.sectionIndex===1&&passage.hexId===hex.id);
  if(!outward||!returning)continue;
  const angle=(returning.headingDeg-outward.headingDeg+360)%360;
  if(Math.abs(angle-180)>1e-9)continue;
  repeatedFixture={route:candidate.route,timeline:candidateTimeline,outward,returning,hexId:hex.id};break;
 }
 assert.ok(repeatedFixture,'The actual map must provide a valid explicit shared-waypoint route with opposite passage headings');
 const repeated=repeatedFixture.timeline;
 const ids=repeated.passages.map(p=>p.hexId);assert.ok(new Set(ids).size<ids.length);
 assert.deepEqual(repeatedFixture.route.sections.map(section=>section.waypointHexIds),[[repeatedFixture.hexId],[repeatedFixture.hexId]]);
 for(const section of repeatedFixture.route.sections)assert.equal(new Set(section.hexIds).size,section.hexIds.length,'No repeats inside a port-to-port section');
 const outwardTime=(repeatedFixture.outward.startsAt+repeatedFixture.outward.endsAt)/2;
 const returnTime=(repeatedFixture.returning.startsAt+repeatedFixture.returning.endsAt)/2;
 const outwardPosition=getPlanPosition(repeated,outwardTime),returnPosition=getPlanPosition(repeated,returnTime);
 assert.equal(outwardPosition.hexId,repeatedFixture.hexId);assert.equal(returnPosition.hexId,repeatedFixture.hexId);
 assert.equal(outwardPosition.sectionIndex,0);assert.equal(returnPosition.sectionIndex,1);
 const repeatForecast=createVoyagePlanForecast(repeatedFixture.route,start);
 for(const section of repeatForecast.sections)for(const [hexId,rows] of Object.entries(section.forecastsByHex))for(const row of rows)
  row.forecastWind=hexId===repeatedFixture.hexId?{speedMps:10,fromDeg:repeatedFixture.outward.headingDeg}:{speedMps:0,fromDeg:null};
 const repeatAssessment=evaluatePlanWeather(repeated,repeatForecast);
 assert.equal(repeatAssessment.hasMissing,false);
 assert.equal(repeatAssessment.passages.find(p=>p.sectionIndex===0&&p.hexId===repeatedFixture.hexId).hasDelay,true);
 assert.equal(repeatAssessment.passages.find(p=>p.sectionIndex===1&&p.hexId===repeatedFixture.hexId).hasDelay,false);
 assert.ok(calculateWindSpeedFactor(repeatedFixture.returning.headingDeg,{speedMps:10,fromDeg:repeatedFixture.outward.headingDeg})>1);
 const props={route,baseRealTime:start,departureRealTime:departure,plannedEtaRealTime:timeline.plannedEtaRealTime,selectedSpeedKnots:6,forecastCapturedAt:start,forecastOverride:forecast};
 const render=changes=>renderToStaticMarkup(createElement(PlanWeatherChart,{...props,...changes}));
 const calmHtml=render({});assert.ok(calmHtml.includes(PLAN_NO_DELAY_NOTICE));assert.ok(calmHtml.includes('data-planned-hex='));
 const missingHtml=render({forecastOverride:null});assert.ok(missingHtml.includes(PLAN_FORECAST_MISSING_NOTICE));assert.ok(missingHtml.includes('data-planned-hex='));
 const delayHtml=render({forecastOverride:withWind(5)});assert.ok(delayHtml.includes(PLAN_DELAY_NOTICE));
 assert.equal(JSON.stringify({route,forecast,timeline}),before);
 assert.equal(Object.hasOwn(evaluatePlanWeather(timeline,forecast),'etaRealTime'),false);
 const source=await readFile(new URL('../src/domain/planWeather.ts',import.meta.url),'utf8');
 assert.equal(source.includes('getWindAt'),false);assert.equal(source.includes('Date.now'),false);
 assert.throws(()=>buildPlanTimeline(route,start,departure,0));
 console.log('Plan position, forecast slot overlap, 5 percent boundary, missing coverage, explicit opposite-heading HEX revisits and chart rendering assertions passed; browser gestures not verified');
} finally {if(server)await server.close();}
