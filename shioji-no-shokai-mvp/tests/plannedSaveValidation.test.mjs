import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
const storage=new Map();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)}});
const originalNow=Date.now,start=Date.UTC(2026,10,3);let now=start;Date.now=()=>now;
let server;
try {
  server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
  const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
  const {SAVE_KEY,SAVE_VERSION,GAME_TIME_MULTIPLIER}=await load('data/gameConstants');
  assert.equal(SAVE_VERSION,8);assert.equal(SAVE_KEY,'shioji-no-shokai:save:v8');
  const {saveGame,loadGame}=await load('domain/save');
  const {assertValidPlannedSave}=await load('domain/plannedSaveValidation');
  storage.set('shioji-no-shokai:save:v7','old-v7-sentinel');assert.equal(loadGame(),null);
  const {useGameStore:store}=await load('state/gameStore');
  const seed=structuredClone(store.getState().gameState);
  const {tutorialWheatContract:template}=await load('data/contracts');
  const {ports}=await load('data/ports');const {getRouteById}=await load('data/routes');
  const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
  const {createConfirmedPlanVoyage}=await load('domain/confirmedPlanVoyage');
  const {progressConfirmedPlanLifecycle}=await load('domain/confirmedPlanLifecycle');
  const endpoints=getRouteById(template.routeId),stop=ports.find(port=>port.id!==endpoints.fromPortId&&port.id!==endpoints.toPortId);
  const built=buildVoyagePlanRoute({departurePortId:endpoints.fromPortId,destinationPortId:endpoints.toPortId},
    {stops:[{portId:stop.id,refuelTargetPercent:100}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});assert.equal(built.ok,true);
  const docked=structuredClone(seed.ships[0]);docked.fuel.capacityTons=100;docked.fuel.remainingTons=100;
  store.setState({gameState:{...seed,ships:[docked]}});store.getState().acceptContract(template.id,docked.id);
  const accepted=store.getState().gameState;
  const voyage=createConfirmedPlanVoyage({contract:accepted.acceptedContract,ship:docked,route:built.route,selectedSpeedKnots:docked.cruisingSpeedKnots,operationTime:seed.operationTime});
  const loading={...accepted,activeVoyage:voyage,voyageMemos:accepted.voyageMemos.map(memo=>({...memo,plannedEtaRealTime:voyage.forecastEtaRealTime}))};
  const calm=(_id,time)=>({wind:{speedMps:0,fromDeg:null},startsAt:time,endsAt:time+86400000});
  const at=(state,time)=>progressConfirmedPlanLifecycle({...state,currentGameTime:time,lastRealTimeSyncedAt:time,
    operationTime:seed.operationTime+(time-start)*GAME_TIME_MULTIPLIER},time,calm);
  function roundtrip(state) {
    const before=JSON.stringify(state);assertValidPlannedSave(state);assert.equal(JSON.stringify(state),before);
    saveGame(state);const raw=storage.get(SAVE_KEY);assert.deepEqual(loadGame(),state);assert.equal(storage.get(SAVE_KEY),raw);
    assert.equal(storage.get('shioji-no-shokai:save:v7'),'old-v7-sentinel');
  }
  roundtrip(loading);
  const departure=voyage.departedRealTime;
  const sailing=at(loading,departure+1000);now=departure+1000;roundtrip(sailing);
  const full=at(loading,departure+86400000);now=departure+86400000;roundtrip(full);
  const arrival=full.activeVoyage.plannedNavigation.checkpoint.processedRealTime;
  const unloading=at(loading,arrival);now=arrival;roundtrip(unloading);
  const call=full.activeVoyage.plannedNavigation.checkpoint.portCalls[0];
  const afterCall=at(loading,call.arrivedAtRealTime);now=call.arrivedAtRealTime;roundtrip(afterCall);
  const restored=loadGame();assert.deepEqual(at(restored,departure+86400000),full);
  const mutations=[
    state=>{state.activeVoyage.plannedNavigation=null;},
    state=>{state.activeVoyage.plannedNavigation.shipId='wrong';},
    state=>{state.activeVoyage.plannedNavigation.windModelVersion='unsupported';},
    state=>{state.activeVoyage.plannedNavigation.route.sections[0].hexIds.reverse();},
    state=>{state.activeVoyage.plannedNavigation.checkpoint.currentSectionIndex=999;},
    state=>{state.activeVoyage.plannedNavigation.checkpoint.distanceIntoLegNm=-1;},
    state=>{state.activeVoyage.plannedNavigation.checkpoint.portCalls=[];},
    state=>{state.activeVoyage.plannedNavigation.checkpoint.portCalls[0].addedFuelTons+=1;},
    state=>{state.activeVoyage.forecastEtaRealTime+=1000;},
    state=>{state.voyageMemos[0].plannedEtaRealTime+=1000;},
    state=>{delete state.activeVoyage.departedRealTime;},
    state=>{delete state.ships[0].fuel;},
    state=>{state.acceptedContract=null;},
    state=>{state.activeVoyage.fuelNavigation={};},
  ];
  for(const mutate of mutations) {
    const broken=structuredClone(afterCall);mutate(broken);
    const original=storage.get(SAVE_KEY);assert.throws(()=>saveGame(broken));assert.equal(storage.get(SAVE_KEY),original);
    const raw=JSON.stringify({version:SAVE_VERSION,savedAtRealTime:now,gameState:broken});storage.set(SAVE_KEY,raw);
    assert.throws(()=>loadGame());assert.equal(storage.get(SAVE_KEY),raw);
  }
  for(const raw of ['{broken',JSON.stringify({version:7,savedAtRealTime:now,gameState:loading})]) {
    storage.set(SAVE_KEY,raw);assert.throws(()=>loadGame());assert.equal(storage.get(SAVE_KEY),raw);
  }
  storage.delete(SAVE_KEY);assert.equal(loadGame(),null);assert.equal(storage.get('shioji-no-shokai:save:v7'),'old-v7-sentinel');
  console.log('V8 planned save isolation, resume and corruption rejection assertions passed');
} finally {
  if(server)await server.close();Date.now=originalNow;
  if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;
}
