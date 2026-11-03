import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server;
try {
  server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
  const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
  const {VoyagePlanSummary}=await server.ssrLoadModule('/src/components/contract/VoyagePlanSummary.tsx');
  const {tutorialWheatContract:contract}=await load('data/contracts');
  const {initialShip}=await load('data/ships');
  const {ports}=await load('data/ports');
  const {getRouteById}=await load('data/routes');
  const {getCargoForContract}=await load('domain/lotContract');
  const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
  const {predictVoyagePlan}=await load('domain/voyagePlanPrediction');
  const endpoints=getRouteById(contract.routeId);
  const fixed={departurePortId:endpoints.fromPortId,destinationPortId:endpoints.toPortId};
  const direct=buildVoyagePlanRoute(fixed,{stops:[],legs:[{waypointHexIds:[]}]});assert.equal(direct.ok,true);
  const stop=ports.find(port=>port.id!==fixed.departurePortId && port.id!==fixed.destinationPortId);
  const via=target=>buildVoyagePlanRoute(fixed,{stops:[{portId:stop.id,refuelTargetPercent:target}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});
  assert.equal(via(100).ok,true);
  const ship=structuredClone(initialShip),baseRealTime=Date.UTC(2026,10,3);
  const props={contract,ship,route:direct.route,selectedSpeedKnots:ship.cruisingSpeedKnots,baseRealTime};
  const render=changes=>renderToStaticMarkup(createElement(VoyagePlanSummary,{...props,...changes}));
  const before=JSON.stringify(props);
  for(const route of [direct.route,via(100).route,via(50).route]) {
    for(const selectedSpeedKnots of new Set([ship.cruisingSpeedKnots,ship.maxSpeedKnots])) {
      const cargo=getCargoForContract(contract);
      const expected=predictVoyagePlan({route,ship,selectedSpeedKnots,baseRealTime,loadingDurationOperationMs:cargo.loadingTimeMsPerUnit*contract.quantity});
      const html=render({route,selectedSpeedKnots});
      assert.ok(html.includes(`data-plan-distance="${expected.totalDistanceNm}"`));
      assert.ok(html.includes(`data-plan-eta="${expected.plannedEtaRealTime}"`));
      assert.ok(html.includes(`data-plan-fuel="${expected.totalRequiredFuelTons}"`));
      assert.ok(html.includes('風・積載による減速は含まない計画値'));
    }
  }
  const weak=structuredClone(ship);weak.fuel.remainingTons=.000001;
  const shortage=render({ship:weak,route:via(100).route});
  assert.ok(shortage.includes('目的地までの燃料が足りません'));
  assert.ok(shortage.includes('前区間の不足により算出不可'));
  assert.ok(shortage.includes('条件付き計画時刻'));
  assert.ok(render({ship:null}).includes('船を選択すると'));
  assert.ok(render({selectedSpeedKnots:ship.maxSpeedKnots+1}).includes('計算できません'));
  assert.ok(render({route:{...direct.route,destinationPortId:fixed.departurePortId}}).includes('計算できません'));
  assert.equal(JSON.stringify(props),before);
  assert.equal(render({}),render({}));
  console.log('Edited route ETA and fuel summary rendering assertions passed; browser interactions not verified');
} finally {if(server)await server.close();}
