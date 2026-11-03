import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server;
try {
 server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
 const load=name=>server.ssrLoadModule('/src/'+name+'.ts');
 const {VoyagePlanConfirmation}=await server.ssrLoadModule('/src/components/contract/VoyagePlanConfirmation.tsx');
 const {PlannedContractDetailScreen}=await server.ssrLoadModule('/src/components/contract/PlannedContractDetailScreen.tsx');
 const {createConfirmedPlanReview}=await load('domain/confirmedPlanReview');
 const {buildVoyagePlanRoute}=await load('domain/voyagePlanRoute');
 const {tutorialWheatContract:contract}=await load('data/contracts');
 const {getRouteById}=await load('data/routes');const {ports}=await load('data/ports');const {initialShip}=await load('data/ships');
 const endpoints=getRouteById(contract.routeId),ship=structuredClone(initialShip),now=Date.UTC(2026,10,3);
 const stop=ports.find(port=>port.id!==endpoints.fromPortId&&port.id!==endpoints.toPortId);
 const built=buildVoyagePlanRoute({departurePortId:endpoints.fromPortId,destinationPortId:endpoints.toPortId},
 {stops:[{portId:stop.id,refuelTargetPercent:80}],legs:[{waypointHexIds:[]},{waypointHexIds:[]}]});assert.equal(built.ok,true);
 const review=createConfirmedPlanReview(contract.id,contract,ship,built.route,ship.cruisingSpeedKnots,now,now+86400000);
 let submitted=0;
 const html=renderToStaticMarkup(createElement(VoyagePlanConfirmation,{initialReview:review,onConfirm:()=>{submitted++;},onCancel:()=>{}}));
 for(const label of ['最終受注確認','編集へ戻る','計画ETA','補油','80%','確定HEXの通過順','提示ID・テンプレートID']) assert.ok(html.includes(label),label);
 assert.ok(html.includes('role="dialog"'));assert.ok(html.includes(`data-plan-eta="${review.prediction.plannedEtaRealTime}"`));assert.equal(submitted,0);
 const before=review.ship.fuel.remainingTons;ship.fuel.remainingTons=0;assert.equal(review.ship.fuel.remainingTons,before);
 const weak=structuredClone(initialShip);weak.fuel.remainingTons=.000001;
 const warning=createConfirmedPlanReview(contract.id,contract,weak,built.route,weak.cruisingSpeedKnots,now,now+86400000);
 const shortage=renderToStaticMarkup(createElement(VoyagePlanConfirmation,{initialReview:warning,onConfirm:()=>{},onCancel:()=>{}}));
 assert.ok(shortage.includes('燃料不足の警告を確認して受注を確定'));assert.ok(shortage.includes('前区間不足'));
 const detail=renderToStaticMarkup(createElement(PlannedContractDetailScreen,{offerId:contract.id,contract,ships:[initialShip],eligibleShips:[initialShip],acceptReason:null,offeredDeadlineAt:now+86400000,onAccept:()=>{},onClose:()=>{}}));
 assert.ok(detail.includes('最終確認へ'));assert.ok(detail.includes('編集した航路は最終確認へ引き継ぎます'));
 assert.equal(detail.includes('編集結果の受注・保存はまだ未接続'),false);
 console.log('Plan confirmation and connected detail initial rendering assertions passed; browser submission and focus gestures not verified');
} finally {if(server)await server.close();}
