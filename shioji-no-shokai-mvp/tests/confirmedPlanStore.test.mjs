import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
const storage=new Map();let failSave=false;
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>{if(failSave)throw new Error('Simulated save failure');storage.set(key,String(value));},removeItem:key=>storage.delete(key)}});
const originalNow=Date.now,start=Date.UTC(2026,10,3);let now=start;Date.now=()=>now;
let server;
try {
  server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
  const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
  const {useGameStore:store}=await load('state/gameStore');
  const {tutorialWheatContract:template}=await load('data/contracts');
  const {getRouteById}=await load('data/routes');
  const {ports}=await load('data/ports');
  const {getPortHexId}=await load('data/hexMap');
  const {buildRouteWindLegs}=await load('domain/routeWind');
  const {createConfirmedPlanVoyage}=await load('domain/confirmedPlanVoyage');
  const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
  const {loadGame}=await load('domain/save');
  const {SAVE_KEY}=await load('data/gameConstants');
  const seed=structuredClone(store.getState().gameState);
  const endpoints=getRouteById(template.routeId);
  const stop=ports.find(port=>port.id!==endpoints.fromPortId&&port.id!==endpoints.toPortId);
  const built=buildVoyagePlanRoute({departurePortId:endpoints.fromPortId,destinationPortId:endpoints.toPortId},
    {stops:[{portId:stop.id,refuelTargetPercent:100}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});
  assert.equal(built.ok,true);
  // Inject only in the test: production acceptance remains on the old path until the new save is ready.
  function begin(remaining=100) {
    now=start;storage.clear();failSave=false;
    const initial=structuredClone(seed);initial.ships[0].fuel.capacityTons=100;initial.ships[0].fuel.remainingTons=remaining;
    const docked=structuredClone(initial.ships[0]);store.setState({gameState:initial});
    store.getState().acceptContract(template.id,docked.id);
    const accepted=store.getState().gameState;assert.ok(accepted.acceptedContract);
    const voyage=createConfirmedPlanVoyage({contract:accepted.acceptedContract,ship:docked,route:built.route,
      selectedSpeedKnots:docked.cruisingSpeedKnots,operationTime:initial.operationTime});
    const state={...accepted,activeVoyage:voyage,voyageMemos:accepted.voyageMemos.map(memo=>({...memo,plannedEtaRealTime:voyage.forecastEtaRealTime}))};
    store.setState({gameState:state});return state;
  }
  const tick=time=>{now=time;store.getState().tick();return store.getState().gameState;};
  let initial=begin(),departure=initial.activeVoyage.departedRealTime;
  let state=tick(departure-1);assert.equal(state.activeVoyage.phase,'loading');assert.equal(state.ships[0].fuel.remainingTons,100);
  state=tick(departure+1000);assert.equal(state.activeVoyage.phase,'sailing');assert.ok(state.ships[0].fuel.remainingTons<100);
  let checkpoint=state.activeVoyage.plannedNavigation.checkpoint;
  const legs=buildRouteWindLegs(built.route.sections[checkpoint.currentSectionIndex].hexIds);
  assert.equal(state.ships[0].currentHexId,legs[checkpoint.legIndex].hexId);
  assert.deepEqual(state.activeVoyage.plannedNavigation.route,built.route);
  assert.equal(state.voyageMemos[0].plannedEtaRealTime,initial.voyageMemos[0].plannedEtaRealTime);
  const balance=state.ships[0].fuel.remainingTons;
  assert.equal(tick(now).ships[0].fuel.remainingTons,balance);
  const saved=loadGame();assert.deepEqual(saved.activeVoyage.plannedNavigation,state.activeVoyage.plannedNavigation);
  store.setState({gameState:saved});assert.equal(tick(now).ships[0].fuel.remainingTons,balance);
  state=tick(departure+2*86400000);assert.equal(state.activeVoyage.phase,'completed');
  assert.equal(state.activeVoyage.plannedNavigation.checkpoint.portCalls.length,1);
  assert.equal(state.ships[0].currentHexId,getPortHexId(endpoints.toPortId));
  assert.equal(state.voyageMemos[0].fuelConsumedTons,state.activeVoyage.plannedNavigation.checkpoint.totalFuelUsedTons);
  assert.equal(state.voyageMemos[0].settlement,null);
  const finalBalance=state.ships[0].fuel.remainingTons;
  store.getState().settleContract();state=store.getState().gameState;
  assert.equal(state.activeVoyage,null);assert.ok(state.voyageMemos[0].settlement);
  assert.equal(state.ships[0].fuel.remainingTons,finalBalance);
  assert.equal(state.voyageMemos[0].plannedEtaRealTime,initial.voyageMemos[0].plannedEtaRealTime);
  const money=state.money;store.getState().settleContract();assert.equal(store.getState().gameState.money,money);
  initial=begin(.001);state=tick(initial.activeVoyage.departedRealTime+60000);
  assert.equal(state.activeVoyage,null);assert.equal(state.acceptedContract,null);
  assert.equal(state.ships[0].currentPortId,endpoints.fromPortId);assert.equal(state.ships[0].fuel.remainingTons,100);
  assert.equal(state.money,initial.money);assert.deepEqual(state.reputations,initial.reputations);
  assert.equal(state.voyageMemos[0].fuelDepletionReturn.returnedToPortId,endpoints.fromPortId);
  const terminal=structuredClone(state.voyageMemos[0]);tick(now+1000);
  assert.deepEqual(store.getState().gameState.voyageMemos[0],terminal);
  initial=begin();const original=store.getState().gameState,raw=storage.get(SAVE_KEY);
  failSave=true;now=initial.activeVoyage.departedRealTime+1000;
  assert.throws(()=>store.getState().tick(),/Simulated save failure/);
  assert.equal(store.getState().gameState,original);assert.equal(storage.get(SAVE_KEY),raw);failSave=false;
  for(const change of [{plannedNavigation:null},{fuelNavigation:{}},{plannedNavigation:{...initial.activeVoyage.plannedNavigation,windModelVersion:'unsupported'}}]) {
    const broken={...initial,activeVoyage:{...initial.activeVoyage,...change}};store.setState({gameState:broken});
    const previous=storage.get(SAVE_KEY);assert.throws(()=>store.getState().tick());
    assert.equal(store.getState().gameState,broken);assert.equal(storage.get(SAVE_KEY),previous);
  }
  const orphan={...initial,acceptedContract:null};store.setState({gameState:orphan});assert.throws(()=>store.getState().tick());
  assert.equal(store.getState().gameState,orphan);
  console.log('Confirmed plan store tick, settlement and save-failure assertions passed; UI acceptance remains disabled');
} finally {
  if(server)await server.close();Date.now=originalNow;
  if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;
}
