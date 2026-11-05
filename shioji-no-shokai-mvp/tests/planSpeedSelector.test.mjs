import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { PlanSpeedSelector } = await server.ssrLoadModule('/src/components/contract/PlanSpeedSelector.tsx');
  let calls = 0;
  const render = changes => renderToStaticMarkup(createElement(PlanSpeedSelector, { cruisingSpeedKnots: 6, maxSpeedKnots: 7, selectedSpeedKnots: 6, onChange: () => { calls++; }, ...changes }));
  const eco = render({});
  assert.ok(eco.includes('ECO · 6ノット'));
  assert.ok(eco.includes('MAX · 7ノット'));
  assert.match(eco, /aria-pressed="true"[^>]*>ECO/);
  assert.match(eco, /aria-pressed="false"[^>]*>MAX/);
  assert.equal(eco.includes('type="range"'), false);
  const max = render({ selectedSpeedKnots: 7 });
  assert.match(max, /aria-pressed="false"[^>]*>ECO/);
  assert.match(max, /aria-pressed="true"[^>]*>MAX/);
  const other = render({ cruisingSpeedKnots: 9, maxSpeedKnots: 12, selectedSpeedKnots: 12 });
  assert.ok(other.includes('ECO · 9ノット'));
  assert.ok(other.includes('MAX · 12ノット'));
  const same = render({ maxSpeedKnots: 6 });
  assert.match(same, /disabled=""[^>]*aria-pressed="false"[^>]*>MAX/);
  assert.ok(same.includes('巡航速力と最大速力が同じ'));
  const invalidSelection = render({ selectedSpeedKnots: 6.5 });
  assert.ok(invalidSelection.includes('ECOまたはMAXを選択'));
  assert.equal(invalidSelection.includes('aria-pressed="true"'), false);
  for (const changes of [{ cruisingSpeedKnots: 0 }, { cruisingSpeedKnots: NaN }, { maxSpeedKnots: 5 }, { maxSpeedKnots: Infinity }, { maxSpeedKnots: 7.5 }]) {
    const html = render(changes);
    assert.ok(html.includes('role="alert"'));
    assert.equal(html.includes('<button'), false);
  }
  assert.equal(calls, 0);
  console.log('ECO/MAX rendering tests passed; click interactions and planning-screen integration not tested.');
} finally { if (server) await server.close(); }
