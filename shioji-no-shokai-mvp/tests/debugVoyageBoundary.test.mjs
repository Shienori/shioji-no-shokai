import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
let server;
try {
  server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
  const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
  const {findNextDebugVoyageBoundary:find}=await load('domain/debugVoyageBoundary');
  const {createConfirmedPlanVoyage}=await load('domain/confirmedPlanVoyage');
  const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
  const {createAcceptedContract}=await load('domain/contractSchedule');
  const {tutorialWheatContract:template}=await load('data/contracts');
  const {getRouteById}=await load('data/routes');
  const {getCargoById}=await load('data/cargos');
  const {initialShip}=await load('data/ships');
  const {ports}=await load('data/ports');
  const start=Date.UTC(2026,10,4), endpoints=getRouteById(template.routeId);
  const contract=createAcceptedContract(template,endpoints,getCargoById(template.cargoId),start,start+86400000);
  const stop=ports.find(port=>port.id!==endpoints.fromPortId&&port.id!==endpoints.toPortId);
  const built=buildVoyagePlanRoute({departurePortId:endpoints.fromPortId,destinationPortId:endpoints.toPortId},{stops:[{portId:stop.id,refuelTargetPercent:100}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});
  assert.equal(built.ok,true);
  const calm=(_id,time)=>({wind:{speedMps:0,fromDeg:null},startsAt:time,endsAt:time+86400000});
  function seed(remaining=100) {
    const ship=structuredClone(initialShip);ship.fuel.capacityTons=100;ship.fuel.remainingTons=remaining;
    const voyage=createConfirmedPlanVoyage({contract,ship,route:built.route,selectedSpeedKnots:ship.cruisingSpeedKnots,operationTime:0});
    return {currentGameTime:start,lastRealTimeSyncedAt:start,operationTime:0,money:1000,reputations:[],
      ships:[{...ship,status:'loading',activeContractId:contract.id}],activeVoyage:voyage,acceptedContract:contract,
      voyageMemos:[{voyageNumber:1,label:'V.01',contractId:contract.id,shipId:ship.id,shipName:ship.name,routeLabel:'test',cargoLabel:'test',acceptedAt:start,acceptedOperationTime:0,plannedEtaRealTime:voyage.forecastEtaRealTime,actualArrivalRealTime:null,etaDiffMinutes:null,settlement:null}]};
  }
  const original=seed(), before=JSON.stringify(original);
  let state=original;
  const events=[];
  for(let i=0;i<4;i++) {
    const result=find(state,calm);
    assert.equal(result.kind,'found');events.push(result.event);
    assert.ok(result.atRealTime>=state.lastRealTimeSyncedAt);
    state=result.state;
    assert.equal(state.money,1000);assert.equal(state.acceptedContract.id,contract.id);
    assert.equal(state.voyageMemos[0].settlement,null);
    assert.equal(state.activeVoyage.forecastEtaRealTime,original.activeVoyage.forecastEtaRealTime);
  }
  assert.deepEqual(events,['departed','portCall','arrived','completed']);
  assert.equal(find(state,calm).kind,'unavailable');
  assert.equal(JSON.stringify(original),before);
  assert.deepEqual(find(JSON.parse(before),calm),find(original,calm));
  const weak=seed(.001),departure=find(weak,calm),depleted=find(departure.state,calm);
  assert.equal(depleted.event,'fuelDepleted');assert.equal(depleted.state.activeVoyage,null);
  assert.equal(depleted.state.money,1000);assert.equal(depleted.state.voyageMemos[0].settlement,null);
  const noWind=find(find(original,calm).state,()=>null,60000);
  assert.equal(noWind.kind,'unavailable');
  assert.throws(()=>find(original,calm,0));
  console.log('Next debug boundary: departure, port call, arrival, completion, depletion and immutable input assertions passed');
} finally {if(server)await server.close();}
