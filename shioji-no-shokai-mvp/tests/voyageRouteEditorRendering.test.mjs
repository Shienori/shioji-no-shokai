import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server;
try {
  server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
  const {VoyageRouteEditor}=await server.ssrLoadModule('/src/components/contract/VoyageRouteEditor.tsx');
  const {ContractDetailScreen}=await server.ssrLoadModule('/src/components/contract/ContractDetailScreen.tsx');
  const {tutorialWheatContract}=await server.ssrLoadModule('/src/data/contracts.ts');
  const {initialShip}=await server.ssrLoadModule('/src/data/ships.ts');
  const editor=renderToStaticMarkup(createElement(VoyageRouteEditor,{departurePortId:'port_selene',destinationPortId:'port_rigel',onEditedChange:()=>{}}));
  for(const label of ['航海計画1：ルート編集','編集可能な航路海図','最短ルートへ戻す','取り消し','計画距離','通過地点を追加','編集結果の受注・保存はまだ未接続']) assert.ok(editor.includes(label),label);
  assert.ok(editor.includes('<polyline'));
  const detail=renderToStaticMarkup(createElement(ContractDetailScreen,{contract:tutorialWheatContract,ships:[structuredClone(initialShip)],eligibleShips:[structuredClone(initialShip)],acceptReason:null,offeredDeadlineAt:Date.UTC(2026,10,4),onAccept:()=>{},onClose:()=>{}}));
  assert.ok(detail.includes('航海計画1：ルート編集'));
  assert.ok(detail.includes('船を選択してください'));
  console.log('Voyage route editor initial rendering assertions passed; browser gestures not verified');
} finally {if(server)await server.close();}
