import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
let server;
try {
  server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
  const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
  const {advanceConfirmedPlanNavigation:advance}=await load('domain/confirmedPlanNavigation');
  const {createPlannedVoyageState}=await load('domain/plannedVoyageState');
  const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
  const {initialShip}=await load('data/ships');
  const {getPortHexId}=await load('data/hexMap');
  const built=buildVoyagePlanRoute({departurePortId:'port_selene',destinationPortId:'port_rigel'},
    {stops:[{portId:'port_aldera',refuelTargetPercent:100}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});
  assert.equal(built.ok,true);
  const start=Date.UTC(2026,10,3);
  const originalShip=structuredClone(initialShip);
  const seed={id:'adapter-voyage',shipId:originalShip.id,contractId:'adapter-contract',phase:'loading',departedRealTime:start};
  const plan=createPlannedVoyageState({voyage:seed,ship:originalShip,route:built.route,selectedSpeedKnots:6,loadSpeedFactor:1});
  const ship={...originalShip,status:'sailing',activeContractId:seed.contractId};
  const voyage={...seed,phase:'sailing',plannedNavigation:plan,forecastEtaRealTime:start+7500000,
    lastProcessedRealTime:start,currentSeaHexIndex:0,distanceIntoHexNm:0};
  const calm=(_id,time)=>({wind:{speedMps:0,fromDeg:null},startsAt:time,endsAt:time+86400000});
  const before=JSON.stringify({ship,voyage});
  const full=advance(voyage,ship,start+10000000,calm);
  assert.equal(full.navigation.status,'arrived');
  assert.equal(full.navigation.arrivalRealTime,start+7500000);
  assert.equal(full.ship.currentHexId,getPortHexId('port_rigel'));
  assert.equal(full.voyage.forecastEtaRealTime,voyage.forecastEtaRealTime);
  assert.equal(full.voyage.phase,'sailing');
  assert.equal(full.voyage.plannedNavigation.checkpoint.portCalls.length,1);
  assert.ok(Math.abs(full.ship.fuel.remainingTons-3.5)<1e-10);
  assert.ok(Math.abs(full.voyage.plannedNavigation.checkpoint.totalFuelUsedTons-2.5)<1e-10);
  assert.equal(JSON.stringify({ship,voyage}),before);
  const first=advance(voyage,ship,start+3000000,calm);
  assert.equal(first.voyage.plannedNavigation.checkpoint.currentSectionIndex,1);
  const saved=JSON.parse(JSON.stringify({voyage:first.voyage,ship:first.ship}));
  assert.deepEqual(advance(saved.voyage,saved.ship,start+10000000,calm),full);
  assert.deepEqual(advance(full.voyage,full.ship,start+10000000,calm),full);
  const absent=advance(voyage,ship,start+1000000,()=>null);
  assert.equal(absent.navigation.status,'windUnavailable');
  assert.equal(absent.ship.fuel.remainingTons,ship.fuel.remainingTons);
  const empty=advance(voyage,{...ship,fuel:{...ship.fuel,remainingTons:0}},start+1000000,calm);
  assert.equal(empty.navigation.status,'fuelDepleted');
  assert.equal(empty.ship.currentPortId,ship.currentPortId);
  assert.equal(empty.ship.fuel.remainingTons,0);
  for(const phase of ['loading','unloading','completed']) {
    const inactive={...voyage,phase};
    const result=advance(inactive,ship,start+1000000,calm);
    assert.equal(result.navigation,null);assert.equal(result.voyage,inactive);assert.equal(result.ship,ship);
  }
  assert.equal(advance({...voyage,plannedNavigation:undefined},ship,start,calm).navigation,null);
  assert.throws(()=>advance({...voyage,plannedNavigation:null},ship,start,calm));
  assert.throws(()=>advance({...voyage,fuelNavigation:{}},ship,start,calm));
  assert.throws(()=>advance(voyage,{...ship,activeContractId:'wrong'},start,calm));
  assert.throws(()=>advance({...voyage,plannedNavigation:{...plan,windModelVersion:'unsupported'}},ship,start,calm));
  assert.throws(()=>advance(voyage,ship,NaN,calm));
  assert.throws(()=>advance(voyage,ship,start-1,calm));
  console.log('Confirmed plan navigation adapter assertions passed');
} finally {if(server)await server.close();}
