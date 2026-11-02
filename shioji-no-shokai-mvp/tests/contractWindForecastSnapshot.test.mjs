import assert from 'node:assert/strict';
import { runSuite } from './helpers/windForecastTestUtils.mjs';
const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'), storage=new Map(), originalNow=Date.now;
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
const base=Date.parse('2026-11-02T14:00:00+08:00');let now=base;Date.now=()=>now;
try {
  await runSuite('contract snapshot',async({load,check})=>{
    const s=await load('/src/domain/contractWindForecast.ts');
    const {createAcceptedContract}=await load('/src/domain/contractSchedule.ts');
    const {getContractPoolByPort,tutorialWheatContract}=await load('/src/data/contracts.ts');
    const {getRouteById}=await load('/src/data/routes.ts'), {getCargoById}=await load('/src/data/cargos.ts');
    const {hexMap}=await load('/src/data/hexMap.ts'), {getWindForecastAt}=await load('/src/domain/windForecast.ts');
    const {saveGame,loadGame}=await load('/src/domain/save.ts'), {useGameStore:store}=await load('/src/state/gameStore.ts');
    const seed=structuredClone(store.getState().gameState), ship=seed.ships[0], port=ship.currentPortId;
    const t=getContractPoolByPort(port).find(x=>{const c=getCargoById(x.cargoId);return x.id!==tutorialWheatContract.id&&c.unitVolume*x.quantity<=ship.maxCargoVolume&&c.weightPerUnit*x.quantity<=ship.maxCargoWeight;});assert.ok(t);
    const route=getRouteById(t.routeId), cargo=getCargoById(t.cargoId), offer={id:'snapshot_offer',templateId:t.id,generatedAt:base,deadlineAt:base+7200000,timeAllowanceRatio:2};
    function reset(){now=base;storage.clear();const x=structuredClone(seed);x.selectedPortId=port;x.acceptedContract=null;x.activeVoyage=null;x.acceptedContractIds=[];x.voyageMemos=[];x.portOffers[port]=[structuredClone(offer)];store.setState({gameState:x});return x;}
    function accept(){reset();store.getState().acceptContract(offer.id,ship.id);const x=structuredClone(store.getState().gameState);assert.ok(x.acceptedContract?.windForecastSnapshot);return x;}
    function retained(x,y){assert.ok(y);assert.equal(y.money,x.money);assert.equal(y.acceptedContract.id,x.acceptedContract.id);assert.equal(y.acceptedContract.deadlineAt,x.acceptedContract.deadlineAt);assert.deepEqual(y.activeVoyage,x.activeVoyage);assert.deepEqual(y.ships,x.ships);}
    check('capture contains route-only sea cells and 96 consistent slots',()=>{
      const x=s.createContractWindForecast(route,base);assert.ok(s.isValidContractWindForecast(x,route.id,base));
      assert.equal(x.capturedAt,base);assert.equal(x.routeId,route.id);
      assert.deepEqual(Object.keys(x.forecastsByHex).sort(),[...new Set(x.seaHexIds)].sort());
      for(const [id,rows] of Object.entries(x.forecastsByHex)){assert.equal(hexMap.find(h=>h.id===id).kind,'sea');assert.equal(rows.length,96);for(const r of rows){assert.equal(r.issuedAt,x.issuedAt);assert.equal(r.hexId,id);assert.equal(r.modelVersion,x.forecastModelVersion);assert.ok(!('actualWind'in r)&&!('isHit'in r));}}
    });
    check('06:00 boundary preserves contract metadata',()=>{
      const issue=Date.parse('2026-11-03T06:00:00+08:00');for(const [at,expected] of [[issue-1,issue-86400000],[issue,issue]]){const x=createAcceptedContract(t,route,cargo,at,at+123456);assert.equal(x.windForecastSnapshot.issuedAt,expected);assert.equal(x.windForecastSnapshot.capturedAt,x.acceptedAt);assert.equal(x.deadlineAt,at+123456);assert.equal(x.reward.offeredReward,t.offeredReward);}
    });
    check('actual acceptance and JSON save/load retain snapshot and voyage',()=>{const x=accept(),y=loadGame();retained(x,y);assert.deepEqual(y.acceptedContract,x.acceptedContract);assert.equal(x.activeVoyage.contractId,x.acceptedContract.id);assert.equal(x.money,seed.money);assert.equal(x.acceptedContract.deadlineAt,offer.deadlineAt);});
    check('daily forecast update does not replace saved values',()=>{const x=accept(),a=x.acceptedContract.windForecastSnapshot;now+=86400000;getWindForecastAt(a.seaHexIds[0],a.issuedAt+2*86400000,a.issuedAt+86400000);assert.deepEqual(loadGame().acceptedContract.windForecastSnapshot,a);});
    check('snapshots and returned slots are independent; coverage never extends',()=>{
      const a=s.createContractWindForecast(route,base),b=s.createContractWindForecast(route,base),before=structuredClone(b),id=b.seaHexIds[0];a.forecastsByHex[id][0].forecastWind.speedMps=999;assert.deepEqual(b,before);
      s.getSavedWindForecastAt(b,id,b.validFrom).forecastWind.speedMps=999;assert.deepEqual(b,before);assert.equal(s.getSavedWindForecastAt(b,id,b.validTo),null);assert.equal(s.getSavedWindForecastAt(b,'missing',base),null);assert.equal(s.getSavedWindForecastAt(undefined,id,base),null);
    });
    check('legacy missing snapshot is not backfilled; old forecast remains',()=>{const x=accept();delete x.acceptedContract.windForecastSnapshot;x.acceptedContract.seaForecast={routeId:route.id,generatedAt:base,issuedAt:base,accuracy:.8,forecasts:[]};saveGame(x);const y=loadGame();retained(x,y);assert.equal(y.acceptedContract.windForecastSnapshot,undefined);assert.equal(y.acceptedContract.windForecastSnapshotIssue,undefined);assert.deepEqual(y.acceptedContract.seaForecast,x.acceptedContract.seaForecast);});
    check('invalid snapshot isolated without resetting game; normalization idempotent',()=>{const x=accept();x.acceptedContract.windForecastSnapshot.forecastsByHex={};saveGame(x);const y=loadGame();retained(x,y);assert.equal(y.acceptedContract.windForecastSnapshot,undefined);assert.equal(y.acceptedContract.windForecastSnapshotIssue,'invalid');saveGame(y);assert.deepEqual(loadGame(),y);});
    check('validator rejects schema/contract/time/wind corruption',()=>{const a=s.createContractWindForecast(route,base),id=a.seaHexIds[0];for(const mutate of [x=>x.schemaVersion=999,x=>x.routeId='wrong',x=>x.capturedAt++,x=>x.forecastsByHex[id].pop(),x=>x.forecastsByHex[id][0].issuedAt++,x=>x.forecastsByHex[id][0].forecastWind={speedMps:-1,fromDeg:0}]){const x=structuredClone(a);mutate(x);assert.equal(s.isValidContractWindForecast(x,route.id,base),false);}});
    check('historical model labels remain valid without regeneration',()=>{const x=accept(),a=x.acceptedContract.windForecastSnapshot;a.forecastModelVersion='old-forecast';a.windModelVersion='old-wind';for(const rows of Object.values(a.forecastsByHex))for(const r of rows){r.modelVersion=a.forecastModelVersion;r.windModelVersion=a.windModelVersion;}saveGame(x);assert.deepEqual(loadGame().acceptedContract.windForecastSnapshot,a);});
    check('load saved values without current map or weather lookup',()=>{const x=accept(),backup=[...hexMap];try{hexMap.splice(0);assert.deepEqual(loadGame().acceptedContract.windForecastSnapshot,x.acceptedContract.windForecastSnapshot);}finally{hexMap.splice(0,hexMap.length,...backup);}});
    check('forecast failure aborts before state update or save',()=>{const x=reset(),before=JSON.stringify(x),backup=[...hexMap];try{hexMap.splice(0,hexMap.length,...backup.filter(h=>h.kind==='port'));assert.throws(()=>store.getState().acceptContract(offer.id,ship.id));assert.equal(JSON.stringify(store.getState().gameState),before);assert.equal(storage.size,0);}finally{hexMap.splice(0,hexMap.length,...backup);}});
  });
} finally {Date.now=originalNow;if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
