import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { PlannedContractDetailScreen, getVoyagePlanNextStep: next, getVoyagePlanPreviousStep: back } = await server.ssrLoadModule('/src/components/contract/PlannedContractDetailScreen.tsx');
  const { tutorialWheatContract: contract } = await server.ssrLoadModule('/src/data/contracts.ts');
  const { initialShip } = await server.ssrLoadModule('/src/data/ships.ts');
  for (const step of [1, 2, 3]) { assert.equal(next(step, false), step); assert.equal(next(step, true), Math.min(step + 1, 3)); assert.equal(back(step), Math.max(1, step - 1)); }
  let step = 1; for (let i = 0; i < 2; i++) step = next(step, true); assert.equal(step, 3); for (let i = 0; i < 2; i++) step = back(step); assert.equal(step, 1);
  let accepted = 0, closed = 0;
  const props = { offerId: contract.id, contract, ships: [structuredClone(initialShip)], eligibleShips: [structuredClone(initialShip)], acceptReason: null, offeredDeadlineAt: Date.now() + 86400000, onAccept: () => { accepted++; }, onClose: () => { closed++; } };
  const before = JSON.stringify({ contract: props.contract, ships: props.ships });
  const html = renderToStaticMarkup(createElement(PlannedContractDetailScreen, props));
  assert.equal((html.match(/role="dialog"/g) ?? []).length, 1); assert.ok(html.includes('aria-modal="true"')); assert.ok(html.includes('data-active-step="1"'));
  assert.match(html, /<section[^>]*data-flow-step="1"(?![^>]*hidden)[^>]*>/);
  for (const n of [2, 3]) assert.match(html, new RegExp(`<section[^>]*data-flow-step="${n}"[^>]*hidden`));
  assert.equal(html.includes('data-flow-step="4"'), false);
  for (const label of ['依頼・船選択', '航海計画', '最終確認', '最終確認へ']) assert.ok(html.includes(label), label);
  for (const label of ['ETA・燃料確認へ', 'ルート編集／気象予測', 'ルート編集／気象予報', '出港から計画到着までの気象予報時刻', '予報を更新', '航路の通過時予報の凡例']) assert.equal(html.includes(label), false, label);
  assert.equal(html.includes('aria-label="編集内容の破棄確認"'), false);
  assert.equal(accepted, 0); assert.equal(closed, 0); assert.equal(JSON.stringify({ contract: props.contract, ships: props.ships }), before);
  const source = await readFile(new URL('../src/components/contract/PlannedContractDetailScreen.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('<VoyageRouteEditor ')); assert.ok(source.includes('<VoyagePlanCalculationPanel ')); assert.ok(source.includes('<PlanSpeedSelector '));
  assert.equal(source.includes('type="range"'), false);
  for (const marker of ['<RouteWeatherEditor ', '<PlanWeatherChart ', 'createWorldPlanForecast', '<VoyagePlanConfirmation ']) assert.equal(source.includes(marker), false);
  assert.ok(source.includes('step !== 3 || !confirmation || locked.current'));
  assert.ok(source.includes('setDiscardOpen(true)')); assert.ok(source.includes('getVoyagePlanPreviousStep(step)'));
  assert.ok(source.includes('getClientRects().length > 0'));
  const main = await readFile(new URL('../src/pages/MainPage.tsx', import.meta.url), 'utf8'); assert.ok(main.includes('element.setAttribute("inert", "")'));
  const css = await readFile(new URL('../src/styles/voyagePlanFlow.css', import.meta.url), 'utf8'); assert.ok(css.includes('position: fixed')); assert.ok(css.includes('.voyage-flow-panel[hidden]'));
  console.log('Three-step planning initial rendering and flow helpers passed; browser navigation, focus and clicks not tested.');
} finally { if (server) await server.close(); }
