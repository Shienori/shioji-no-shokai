import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
let server;
try {
  server = await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
  const load = name => server.ssrLoadModule('/src/'+name+'.ts');
  const {createConfirmedPlanVoyage} = await load('domain/confirmedPlanVoyage');
  const {buildVoyagePlanRoute} = await load('domain/voyagePlanRoute');
  const {predictVoyagePlan} = await load('domain/voyagePlanPrediction');
  const {createAcceptedContract} = await load('domain/contractSchedule');
  const {getCargoForContract} = await load('domain/lotContract');
  const {tutorialWheatContract:template} = await load('data/contracts');
  const {getRouteById} = await load('data/routes');
  const {getCargoById} = await load('data/cargos');
  const {initialShip} = await load('data/ships');
  const {ports} = await load('data/ports');
  const {GAME_TIME_MULTIPLIER} = await load('data/gameConstants');
  const endpoints=getRouteById(template.routeId);
  const now=Date.UTC(2026,10,3);
  const contract=createAcceptedContract(template,endpoints,getCargoById(template.cargoId),now,now+86400000);
  const ship=structuredClone(initialShip);
  const stop=ports.find(port=>port.id!==endpoints.fromPortId && port.id!==endpoints.toPortId);
  for (const stops of [[],[{portId:stop.id,refuelTargetPercent:80}]]) {
    const built=buildVoyagePlanRoute({departurePortId:endpoints.fromPortId,destinationPortId:endpoints.toPortId},
      {stops,legs:Array.from({length:stops.length+1},()=>({waypointHexIds:[]}))});
    assert.equal(built.ok,true);
    const input={contract,ship,route:built.route,selectedSpeedKnots:ship.cruisingSpeedKnots,operationTime:12000};
    const before=JSON.stringify(input);
    const voyage=createConfirmedPlanVoyage(input);
    const cargo=getCargoForContract(contract);
    const prediction=predictVoyagePlan({route:built.route,ship,selectedSpeedKnots:input.selectedSpeedKnots,
      baseRealTime:now,loadingDurationOperationMs:cargo.loadingTimeMsPerUnit*contract.quantity});
    assert.equal(voyage.forecastEtaRealTime,prediction.plannedEtaRealTime);
    assert.equal(voyage.departedRealTime,prediction.departureRealTime);
    assert.equal(voyage.estimatedArrivalAt,input.operationTime+(prediction.plannedEtaRealTime-now)*GAME_TIME_MULTIPLIER);
    assert.equal(voyage.plannedNavigation.settings.selectedSpeedKnots,input.selectedSpeedKnots);
    assert.equal(voyage.plannedNavigation.contractId,contract.id);
    assert.equal(Object.hasOwn(voyage,'fuelNavigation'),false);
    assert.deepEqual(voyage.plannedNavigation.route,built.route);
    assert.equal(JSON.stringify(input),before);
    assert.deepEqual(JSON.parse(JSON.stringify(voyage)),voyage);
    const zero=structuredClone(ship);zero.fuel.remainingTons=0;
    assert.throws(()=>createConfirmedPlanVoyage({...input,ship:zero}));
    assert.throws(()=>createConfirmedPlanVoyage({...input,ship:{...ship,status:'sailing'}}));
    assert.throws(()=>createConfirmedPlanVoyage({...input,selectedSpeedKnots:ship.maxSpeedKnots+1}));
    assert.throws(()=>createConfirmedPlanVoyage({...input,operationTime:NaN}));
    assert.throws(()=>createConfirmedPlanVoyage({...input,route:{...built.route,destinationPortId:endpoints.fromPortId}}));
    const broken=structuredClone(built.route);broken.sections[0].hexIds.reverse();
    assert.throws(()=>createConfirmedPlanVoyage({...input,route:broken}));
    input.route.sections[0].hexIds.length=0;
    assert.ok(voyage.plannedNavigation.route.sections[0].hexIds.length>0);
  }
  console.log('Confirmed plan voyage creation assertions passed');
} finally {if(server)await server.close();}
