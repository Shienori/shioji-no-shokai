import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server;
try {
 server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
 const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
 const {FleetPanel}=await server.ssrLoadModule('/src/components/fleet/FleetPanel.tsx');
 const {getPlannedShipPresentation}=await load('domain/plannedShipPresentation');
 const {createConfirmedPlanVoyage}=await load('domain/confirmedPlanVoyage');
 const {progressConfirmedPlanLifecycle}=await load('domain/confirmedPlanLifecycle');
 const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
 const {createAcceptedContract}=await load('domain/contractSchedule');
 const {tutorialWheatContract:template}=await load('data/contracts');
 const {getRouteById}=await load('data/routes');const {getCargoById}=await load('data/cargos');
 const {initialShip}=await load('data/ships');const {ports}=await load('data/ports');
 const {GAME_TIME_MULTIPLIER}=await load('data/gameConstants');
 const start=Date.UTC(2026,10,3),endpoints=getRouteById(template.routeId);
 const contract=createAcceptedContract(template,endpoints,getCargoById(template.cargoId),start,start+86400000);
 const stop=ports.find(port=>port.id!==endpoints.fromPortId&&port.id!==endpoints.toPortId);
 const built=buildVoyagePlanRoute({departurePortId:endpoints.fromPortId,destinationPortId:endpoints.toPortId},
 {stops:[{portId:stop.id,refuelTargetPercent:100}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});assert.equal(built.ok,true);
 const docked=structuredClone(initialShip);docked.fuel.capacityTons=100;docked.fuel.remainingTons=100;
 const voyage=createConfirmedPlanVoyage({contract,ship:docked,route:built.route,selectedSpeedKnots:docked.cruisingSpeedKnots,operationTime:0});
 const ship={...docked,status:'loading',activeContractId:contract.id};
 const initial={operationTime:0,ships:[ship],activeVoyage:voyage,acceptedContract:contract,
 voyageMemos:[{contractId:contract.id,shipId:ship.id,acceptedAt:start,settlement:null}]};
 const calm=(_id,time)=>({wind:{speedMps:0,fromDeg:null},startsAt:time,endsAt:time+86400000});
 const at=time=>progressConfirmedPlanLifecycle({...initial,operationTime:(time-start)*GAME_TIME_MULTIPLIER},time,calm);
 const idle={...structuredClone(initialShip),id:'idle-other',name:'停泊テスト船',activeContractId:null,status:'docked'};
 let selected=0;
 const render=(state,changes={})=>renderToStaticMarkup(createElement(FleetPanel,{ships:[state.ships[0],idle],voyage:state.activeVoyage,
 contract:state.acceptedContract,operationTime:state.operationTime,onSelectShip:()=>{selected++;},...changes}));
 const before=JSON.stringify(initial);
 const loading=render(initial);assert.ok(loading.includes('航路距離の進捗'));assert.ok(loading.includes('data-distance-progress="0"'));
 const sailing=at(voyage.departedRealTime+1000),model=getPlannedShipPresentation(sailing.ships[0],sailing.activeVoyage,contract);
 const html=render(sailing);assert.ok(html.includes(`data-plan-eta="${model.plannedEtaRealTime}"`));
 assert.ok(html.includes(`data-distance-progress="${model.progress}"`));
 for(const label of ['計画ETA（受注時固定）','現在区間','次の到着先','実燃料残量','途中補油処理済み','実到着（荷卸し前）','海里'])assert.ok(html.includes(label),label);
 const idlePart=html.slice(html.indexOf('停泊テスト船'));
 assert.equal(idlePart.includes('計画ETA（受注時固定）'),false);assert.equal(idlePart.includes('途中補油処理済み'),false);
 assert.ok(idlePart.includes('<span>なし</span>'));
 const full=at(voyage.departedRealTime+86400000),done=render(full);
 assert.ok(done.includes('精算待ち'));assert.ok(done.includes('data-distance-progress="1"'));assert.ok(done.includes('最終目的港へ到着済み'));
 const record=full.activeVoyage.plannedNavigation.checkpoint.portCalls[0],afterStop=at(record.arrivedAtRealTime);
 assert.ok(render(afterStop).includes('1/1港'));
 assert.equal(render(JSON.parse(JSON.stringify(afterStop))),render(afterStop));
 assert.equal(JSON.stringify(initial),before);assert.equal(selected,0);
 const broken={...sailing,activeVoyage:{...sailing.activeVoyage,plannedNavigation:null}};
 const invalid=render(broken);assert.ok(invalid.includes('従来の航路・ETAで代用しません'));assert.equal(invalid.includes('data-plan-eta='),false);
 const mismatch=render(sailing,{contract:{...contract,id:'wrong-contract'}});assert.ok(mismatch.includes('確認できません'));
 console.log('Planned fleet ETA, distance progress, port calls and per-ship isolation rendering assertions passed; browser interactions not verified');
} finally {if(server)await server.close();}
