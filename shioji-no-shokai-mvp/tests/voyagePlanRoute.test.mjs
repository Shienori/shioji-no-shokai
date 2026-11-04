import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { buildVoyagePlanRoute: build } = await server.ssrLoadModule('/src/domain/voyagePlanRoute.ts');
  const { hexMap } = await server.ssrLoadModule('/src/data/hexMap.ts');
  const { getRouteHexIds } = await server.ssrLoadModule('/src/domain/routePath.ts');
  const { buildRouteWindLegs } = await server.ssrLoadModule('/src/domain/routeWind.ts');
  const checks = [];
  const sea = (q, r) => { const h = hexMap.find(h => h.kind === 'sea' && h.q === q && h.r === r); assert.ok(h); return h.id; };
  const endpoints = { departurePortId: 'port_aldera', destinationPortId: 'port_selene' };
  const empty = () => ({ stops: [], legs: [{ waypointHexIds: [] }] });
  const success = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
  let result = success(build(endpoints, empty()));
  assert.equal(result.totalDistanceNm, 30);
  assert.deepEqual(result.route.sections[0].hexIds, getRouteHexIds(endpoints.departurePortId, endpoints.destinationPortId));
  assert.equal(result.route.departurePortId, endpoints.departurePortId);
  assert.equal(result.route.destinationPortId, endpoints.destinationPortId);
  checks.push('fixed endpoints, existing route and real 30nm distance');
  const draft = { stops: [], legs: [{ waypointHexIds: [sea(0,-1)] }] };
  const before = structuredClone(draft), mapBefore = JSON.stringify(hexMap);
  result = success(build(endpoints, draft));
  assert.equal(result.route.sections[0].hexIds.filter(id => id === sea(0,-1)).length, 1);
  assert.equal(result.totalDistanceNm, 30);
  assert.deepEqual(draft, before); assert.equal(JSON.stringify(hexMap), mapBefore);
  draft.legs[0].waypointHexIds.length = 0;
  assert.equal(result.route.sections[0].waypointHexIds.length, 1);
  checks.push('single join point, pure inputs and independent copy');
  const rigel = { departurePortId: 'port_aldera', destinationPortId: 'port_rigel' };
  for (const points of [[sea(2,-1),sea(1,-1)], [sea(1,-1),sea(1,-1)]]) {
    const r = build(rigel, { stops: [], legs: [{ waypointHexIds: points }] });
    assert.equal(r.ok, false); assert.equal(r.reason, 'repeatedHex');
  }
  checks.push('repeated path and repeated waypoint rejected');
  result = success(build(rigel, { stops: [{ portId: 'port_mira', refuelTargetPercent: 80 }], legs: [{ waypointHexIds: [] }, { waypointHexIds: [] }] }));
  assert.equal(result.totalDistanceNm, 120);
  assert.equal(result.route.sections[0].refuelTargetPercent, 80);
  assert.equal(result.route.sections[1].refuelTargetPercent, undefined);
  const [a,b] = result.route.sections.map(s => buildRouteWindLegs(s.hexIds));
  assert.ok(a.some(x => b.some(y => x.hexId === y.hexId)));
  checks.push('cross-section reuse and real wind-leg conversion');
  for (const invalid of [{ stops: [], legs: [] }, { stops: [], legs: [{ waypointHexIds: ['unknown'] }] }, { stops: [], legs: [{ waypointHexIds: Array(9).fill(sea(0,-1)) }] }, { stops: [{portId: 'port_mira', refuelTargetPercent: 101}], legs: [{waypointHexIds: []},{waypointHexIds: []}] }]) assert.equal(build(endpoints, invalid).ok, false);
  checks.push('invalid section count, HEX, waypoint count and target rejected');
  console.log(JSON.stringify({ passedGroups: checks.length, checks }, null, 2));
} finally { if (server) await server.close(); }
