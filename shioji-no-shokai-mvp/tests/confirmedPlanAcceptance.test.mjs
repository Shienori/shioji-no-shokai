import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),storage=new Map();let failSave=false;
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,
 setItem:(key,value)=>{if(failSave)throw new Error('Save failed');storage.set(key,String(value));},removeItem:key=>storage.delete(key)}});
const originalNow=Date.now,start=Date.UTC(2026,10,3);let now=start;Date.now=()=>now;let server;
try {
 server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
 const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
 const {useGameStore:store}=await load('state/gameStore');
 const {createConfirmedPlanReview}=await load('domain/confirmedPlanReview');
 const {tutorialWheatContract:template}=await load('data/contracts');
 const {getRouteById}=await load('data/routes');const {ports}=await load('data/ports');
 const {calculateContractSchedule}=await load('domain/contractSchedule');
 const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
 const {loadGame}=await load('domain/save');const {SAVE_KEY}=await load('data/gameConstants');
 const seed=structuredClone(store.getState().gameState),endpoints=getRouteById(template.routeId);
 const stop=ports.find(port=>port.id!==endpoints.fromPortId&&port.id!==endpoints.toPortId);
 const built=buildVoyagePlanRoute({departurePortId:endpoints.fromPortId,destinationPortId:endpoints.toPortId},
 {stops:[{portId:stop.id,refuelTargetPercent:100}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});assert.equal(built.ok,true);
 function begin(remaining=100){now=start;failSave=false;storage.clear();const state=structuredClone(seed);
 state.ships[0].fuel.capacityTons=100;state.ships[0].fuel.remainingTons=remaining;store.setState({gameState:state});return state;}
 function review(){const ship=store.getState().gameState.ships[0];return createConfirmedPlanReview(template.id,template,ship,built.route,
 ship.cruisingSpeedKnots,now,calculateContractSchedule(template,endpoints,now).deadlineAt);}
 const accept=r=>store.getState().acceptContract(r.offerId,r.shipId,r.selectedSpeedKnots,r);
 let initial=begin(),r=review(),before=JSON.stringify(initial);assert.equal(JSON.stringify(initial),before);
 assert.equal(accept(r).kind,'accepted');let state=store.getState().gameState;
 assert.ok(state.activeVoyage.plannedNavigation);assert.equal(Object.hasOwn(state.activeVoyage,'fuelNavigation'),false);
 assert.deepEqual(state.activeVoyage.plannedNavigation.route,built.route);
 assert.equal(state.ships[0].fuel.remainingTons,100);assert.equal(state.money,initial.money);
 assert.equal(state.voyageMemos[0].plannedEtaRealTime,state.activeVoyage.forecastEtaRealTime);
 const saved=loadGame();assert.deepEqual(saved.activeVoyage.plannedNavigation,state.activeVoyage.plannedNavigation);
 const count=state.voyageMemos.length;accept(r);assert.equal(store.getState().gameState.voyageMemos.length,count);
 const departure=state.activeVoyage.departedRealTime;now=departure+1000;store.getState().tick();
 state=store.getState().gameState;assert.equal(state.activeVoyage.phase,'sailing');assert.ok(state.ships[0].fuel.remainingTons<100);
 begin();r=review();now+=120000;const unchanged=store.getState().gameState;
 const update=accept(r);assert.equal(update.kind,'reviewRequired');assert.equal(store.getState().gameState,unchanged);assert.equal(storage.size,0);
 assert.equal(accept(update.review).kind,'accepted');
 begin();r=review();state=store.getState().gameState;
 store.setState({gameState:{...state,ships:state.ships.map(ship=>({...ship,fuel:{...ship.fuel,remainingTons:99}}))}});
 const fuelUpdate=accept(r);assert.equal(fuelUpdate.kind,'reviewRequired');assert.equal(storage.size,0);
 assert.equal(accept(fuelUpdate.review).kind,'accepted');
 begin(.001);r=review();assert.equal(r.prediction.hasFuelShortage,true);assert.equal(accept(r).kind,'accepted');
 begin();r=review();state=store.getState().gameState;
 store.setState({gameState:{...state,ships:state.ships.map(ship=>({...ship,fuel:{...ship.fuel,remainingTons:0}}))}});
 assert.equal(accept(r),undefined);assert.equal(storage.size,0);
 begin();r=review();const original=store.getState().gameState;failSave=true;
 assert.throws(()=>accept(r),/Save failed/);assert.equal(store.getState().gameState,original);assert.equal(storage.has(SAVE_KEY),false);failSave=false;
 begin();r=review();assert.equal(accept({...r,offerId:'different-offer'}),undefined);assert.equal(storage.size,0);
 const broken=structuredClone(r);broken.route.sections[0].hexIds.reverse();assert.equal(accept(broken),undefined);assert.equal(storage.size,0);
 console.log('Reviewed plan acceptance, reconfirmation, v8 save and sailing assertions passed; confirmation UI not connected yet');
} finally {if(server)await server.close();Date.now=originalNow;if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;}
