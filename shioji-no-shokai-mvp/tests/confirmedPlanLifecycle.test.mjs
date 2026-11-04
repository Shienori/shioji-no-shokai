import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
let server;
try {
  server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
  const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
  const {progressConfirmedPlanLifecycle:progress}=await load('domain/confirmedPlanLifecycle');
  const {createConfirmedPlanVoyage}=await load('domain/confirmedPlanVoyage');
  const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
  const {createAcceptedContract}=await load('domain/contractSchedule');
  const {tutorialWheatContract:template}=await load('data/contracts');
  const {getRouteById}=await load('data/routes');
  const {getCargoById}=await load('data/cargos');
  const {initialShip}=await load('data/ships');
  const {ports}=await load('data/ports');
  const {getPortHexId}=await load('data/hexMap');
  const {GAME_TIME_MULTIPLIER}=await load('data/gameConstants');
  const start=Date.UTC(2026,10,3),operationStart=12000;
  const endpoints=getRouteById(template.routeId);
  const contract=createAcceptedContract(template,endpoints,getCargoById(template.cargoId),start,start+86400000);
  const stop=ports.find(port=>port.id!==endpoints.fromPortId && port.id!==endpoints.toPortId);
  const built=buildVoyagePlanRoute({departurePortId:endpoints.fromPortId,destinationPortId:endpoints.toPortId},
    {stops:[{portId:stop.id,refuelTargetPercent:100}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});
  assert.equal(built.ok,true);
  const calm=(_id,time)=>({wind:{speedMps:0,fromDeg:null},startsAt:time,endsAt:time+86400000});
  function begin(remaining=100) {
    const ship=structuredClone(initialShip);ship.fuel.capacityTons=100;ship.fuel.remainingTons=remaining;
    const voyage=createConfirmedPlanVoyage({contract,ship,route:built.route,selectedSpeedKnots:ship.cruisingSpeedKnots,operationTime:operationStart});
    const memo={voyageNumber:1,label:'V.01',contractId:contract.id,shipId:ship.id,shipName:ship.name,routeLabel:'test',cargoLabel:'test',
      acceptedAt:start,acceptedOperationTime:operationStart,plannedEtaRealTime:voyage.forecastEtaRealTime,
      actualArrivalRealTime:null,etaDiffMinutes:null,settlement:null};
    return {operationTime:operationStart,money:1000,reputations:[{shipperId:contract.shipperId,value:0}],
      ships:[{...ship,status:'loading',activeContractId:contract.id}],activeVoyage:voyage,acceptedContract:contract,voyageMemos:[memo]};
  }
  const at=(state,time,wind=calm)=>progress({...state,operationTime:operationStart+(time-start)*GAME_TIME_MULTIPLIER},time,wind);
  const seed=begin(),before=JSON.stringify(seed),departure=seed.activeVoyage.departedRealTime;
  const loading=at(seed,departure-1);
  assert.equal(loading.activeVoyage.phase,'loading');assert.equal(loading.ships[0].fuel.remainingTons,100);
  const sailing=at(seed,departure+1000);
  assert.equal(sailing.activeVoyage.phase,'sailing');assert.ok(sailing.ships[0].fuel.remainingTons<100);
  assert.equal(sailing.activeVoyage.forecastEtaRealTime,seed.activeVoyage.forecastEtaRealTime);
  assert.equal(sailing.voyageMemos[0].plannedEtaRealTime,seed.voyageMemos[0].plannedEtaRealTime);
  assert.deepEqual(at(sailing,departure+1000),sailing);
  const full=at(seed,departure+86400000);
  assert.equal(full.activeVoyage.phase,'completed');assert.equal(full.activeVoyage.plannedNavigation.checkpoint.portCalls.length,1);
  assert.equal(full.ships[0].currentHexId,getPortHexId(endpoints.toPortId));
  assert.equal(full.acceptedContract.id,contract.id);assert.equal(full.voyageMemos[0].settlement,null);assert.equal(full.money,1000);
  assert.equal(full.voyageMemos[0].fuelConsumedTons,full.activeVoyage.plannedNavigation.checkpoint.totalFuelUsedTons);
  assert.deepEqual(at(JSON.parse(JSON.stringify(sailing)),departure+86400000),full);
  assert.equal(at(full,departure+86400001).ships[0].fuel.remainingTons,full.ships[0].fuel.remainingTons);
  const arrival=full.activeVoyage.plannedNavigation.checkpoint.processedRealTime;
  assert.equal(at(seed,arrival).activeVoyage.phase,'unloading');
  const emptySeed=begin(.001),returned=at(emptySeed,emptySeed.activeVoyage.departedRealTime+60000);
  assert.equal(returned.activeVoyage,null);assert.equal(returned.acceptedContract,null);
  assert.equal(returned.ships[0].currentPortId,endpoints.fromPortId);assert.equal(returned.ships[0].fuel.remainingTons,100);
  assert.equal(returned.ships[0].activeContractId,null);assert.equal(returned.money,emptySeed.money);
  assert.deepEqual(returned.reputations,emptySeed.reputations);assert.equal(returned.voyageMemos[0].settlement,null);
  assert.equal(returned.voyageMemos[0].fuelDepletionReturn.returnedToPortId,endpoints.fromPortId);
  assert.ok(Math.abs(returned.voyageMemos[0].fuelConsumedTons-.001)<1e-10);
  assert.equal(progress(returned,departure+86400000,calm),returned);
  const unavailable=at(seed,departure+1000,()=>null);
  assert.equal(unavailable.activeVoyage.phase,'sailing');assert.equal(unavailable.ships[0].fuel.remainingTons,100);
  assert.throws(()=>progress({...seed,voyageMemos:[]},departure,calm));
  assert.throws(()=>progress({...seed,acceptedContract:null},departure,calm));
  assert.throws(()=>progress({...seed,activeVoyage:{...seed.activeVoyage,plannedNavigation:null}},departure,calm));
  assert.equal(JSON.stringify(seed),before);
  const legacy={...seed,activeVoyage:{...seed.activeVoyage,plannedNavigation:undefined}};
  assert.equal(progress(legacy,departure,calm),legacy);
  console.log('Confirmed plan lifecycle assertions passed');
} finally {if(server)await server.close();}
