import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
let passed = 0, failed = 0;
const near = (a, b, tolerance = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const test = (name, run) => {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`, error); }
};
try {
  const { getHexHeadingDeg: heading, buildRouteWindLegs, getRouteWindLegs, calculateRouteLegPerformance } = await server.ssrLoadModule('/src/domain/routeWind.ts');
  const { advanceWindNavigation: advance, estimateSavedWindArrival: estimate } = await server.ssrLoadModule('/src/domain/windNavigation.ts');
  const { routes } = await server.ssrLoadModule('/src/data/routes.ts');
  const { getHexById } = await server.ssrLoadModule('/src/data/hexMap.ts');
  const { getRouteHexIds } = await server.ssrLoadModule('/src/domain/routePath.ts');
  const { HEX_DISTANCE_NM } = await server.ssrLoadModule('/src/domain/hexMap.ts');
  const { GAME_TIME_MULTIPLIER: acceleration } = await server.ssrLoadModule('/src/data/gameConstants.ts');
  const { createContractWindForecast } = await server.ssrLoadModule('/src/domain/contractWindForecast.ts');
  const { getWindForecastIssueTime } = await server.ssrLoadModule('/src/domain/windForecast.ts');
  const HOUR = 3600000, SLOT = 2 * HOUR;
  const T = getWindForecastIssueTime(Date.UTC(2026, 10, 2));
  const calm = Object.freeze({ speedMps: 0, fromDeg: null });
  const leg = (index = 0, distanceNm = 15) => ({ hexId: `test_${index}`, nextHexId: `test_${index + 1}`, routeHexIndex: index + 1, seaHexIndex: index, distanceNm, headingDeg: 0 });
  const initial = (fuelRemaining = 10000) => ({ processedRealTime: T, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining, totalFuelUsed: 0 });
  const read = (_id, t) => ({ wind: calm, startsAt: Math.floor(t / SLOT) * SLOT, endsAt: (Math.floor(t / SLOT) + 1) * SLOT });
  const options = (overrides = {}) => ({ legs: [leg()], state: initial(), selectedSpeedKnots: 6, loadSpeedFactor: 1, referenceFuelPerVoyageHour: 2, untilRealTime: T + 10 * HOUR, readWind: read, ...overrides });
  const compare = (a, b) => {
    assert.equal(a.legIndex, b.legIndex);
    near(a.processedRealTime, b.processedRealTime, 0.01);
    for (const key of ['distanceIntoLegNm', 'fuelRemaining', 'totalFuelUsed']) near(a[key], b[key], 1e-6);
  };
  test('rendered HEX geometry gives all six headings and opposite reverse headings', () => {
    const origin = { q: 0, r: 0 };
    for (const [q, r, expected] of [[1,0,90],[-1,0,270],[0,1,30],[0,-1,210],[1,-1,150],[-1,1,330]]) {
      const next = { q, r };
      near(heading(origin, next), expected);
      near(heading(next, origin), (expected + 180) % 360);
    }
  });
  test('nonadjacent duplicate and invalid coordinates are rejected', () => {
    for (const target of [{q:0,r:0},{q:2,r:0},{q:0.5,r:0},{q:NaN,r:0},{q:Infinity,r:0}]) assert.throws(() => heading({q:0,r:0}, target));
  });
  test('all actual routes preserve path order sea distance and final port heading', () => {
    assert.ok(routes.length > 0);
    for (const route of routes) {
      const path = getRouteHexIds(route.fromPortId, route.toPortId);
      assert.ok(path);
      const before = JSON.stringify(path);
      const legs = getRouteWindLegs(route);
      assert.deepEqual(legs.map(x => x.hexId), path.filter(id => getHexById(id).kind === 'sea'));
      near(legs.reduce((sum, x) => sum + x.distanceNm, 0), legs.length * HEX_DISTANCE_NM);
      legs.forEach((x, i) => {
        assert.equal(x.seaHexIndex, i);
        assert.equal(x.nextHexId, path[x.routeHexIndex + 1]);
        near(x.headingDeg, heading(getHexById(x.hexId), getHexById(x.nextHexId)));
      });
      assert.equal(getHexById(legs.at(-1).nextHexId).kind, 'port');
      assert.equal(JSON.stringify(path), before);
    }
  });
  test('malformed paths and unknown ports are rejected', () => {
    const path = getRouteHexIds(routes[0].fromPortId, routes[0].toPortId);
    for (const value of [[], path.slice(1), [...path, path[0]], ['missing_a','missing_b','missing_c']]) assert.throws(() => buildRouteWindLegs(value));
    assert.throws(() => getRouteWindLegs({fromPortId:'missing',toPortId:routes[0].toPortId}));
  });
  test('route performance uses heading load and unchanged engine fuel rate', () => {
    const result = calculateRouteLegPerformance(leg(), 6, 0.9, {speedMps:10,fromDeg:0}, 2);
    near(result.speedKnots, 4.32); near(result.fuelPerVoyageHour, 2);
  });
  test('calm passage arrives with analytic time and fuel balance', () => {
    near(acceleration, 6);
    const result = advance(options());
    assert.equal(result.status, 'arrived');
    near(result.arrivalRealTime, T + 15 / 6 / acceleration * HOUR, 0.01);
    near(result.state.totalFuelUsed, 5); near(result.state.fuelRemaining, 9995);
    assert.equal(result.state.legIndex, 1); near(result.state.distanceIntoLegNm, 0);
  });
  test('partial processing returns progress not an invented arrival ETA', () => {
    const result = advance(options({untilRealTime:T + HOUR / 6}));
    assert.equal(result.status, 'timeReached'); assert.equal(result.arrivalRealTime, null);
    near(result.state.distanceIntoLegNm, 6); near(result.state.totalFuelUsed, 2);
  });
  test('multiple HEXes continue without adding port distance', () => {
    const result = advance(options({legs:[leg(0),leg(1),leg(2),leg(3)]}));
    assert.equal(result.status, 'arrived'); near(result.arrivalRealTime, T + 60 / 6 / acceleration * HOUR, 0.01);
    near(result.state.totalFuelUsed, 20); assert.equal(result.state.legIndex, 4);
  });
  test('wind update inside HEX affects remaining distance only', () => {
    const changing = (_id, t) => ({...read(_id,t), wind:t < T + SLOT ? calm : {speedMps:10,fromDeg:0}});
    const result = advance(options({legs:[leg(0,120)], readWind:changing}));
    assert.equal(result.status, 'arrived');
    near(result.arrivalRealTime, T + (12 + 48 / 4.8) / acceleration * HOUR, 0.01);
    near(result.state.totalFuelUsed, 44);
  });
  test('split and offline processing agree across wind and HEX boundaries', () => {
    const changing = (_id, t) => ({...read(_id,t), wind:t < T + SLOT ? calm : {speedMps:10,fromDeg:0}});
    const base = options({legs:Array.from({length:8},(_,i)=>leg(i)), readWind:changing});
    const single = advance(base);
    let state = initial(), last;
    for (let step = 1; step <= 42; step++) {
      last = advance({...base,state,untilRealTime:T + step * HOUR / 6}); state = last.state;
      if (last.status === 'arrived') break;
    }
    assert.equal(last.status, single.status); compare(state, single.state);
    const restored = JSON.parse(JSON.stringify(state));
    compare(advance({...base,state:restored}).state, single.state);
  });
  test('same timestamp and completed voyage do not burn fuel twice', () => {
    const part = advance(options({untilRealTime:T + HOUR / 6}));
    compare(advance(options({state:part.state,untilRealTime:part.state.processedRealTime})).state, part.state);
    const complete = advance(options());
    compare(advance(options({state:complete.state,untilRealTime:T + 20 * HOUR})).state, complete.state);
  });
  test('fuel depletion stops at correct time position and zero balance', () => {
    const result = advance(options({state:initial(2)}));
    assert.equal(result.status, 'fuelDepleted'); assert.equal(result.arrivalRealTime, null);
    near(result.state.processedRealTime, T + HOUR / 6, 0.01);
    near(result.state.distanceIntoLegNm, 6); near(result.state.totalFuelUsed, 2); near(result.state.fuelRemaining, 0);
    compare(advance(options({state:result.state})).state, result.state);
  });
  test('arrival and fuel depletion at identical instant counts as arrival', () => {
    const result = advance(options({state:initial(5)}));
    assert.equal(result.status, 'arrived'); near(result.state.fuelRemaining, 0); near(result.state.totalFuelUsed, 5);
  });
  test('zero initial fuel makes no distance and never reads weather', () => {
    const result = advance(options({state:initial(0),readWind:()=>{throw Error('must not read');}}));
    assert.equal(result.status, 'fuelDepleted'); compare(result.state, initial(0));
  });
  test('wind gap returns checkpoint without skipping unknown interval', () => {
    const result = advance(options({readWind:(_id,t)=>t < T + HOUR/10 ? {wind:calm,startsAt:T,endsAt:T + HOUR/10} : null}));
    assert.equal(result.status, 'windUnavailable'); assert.equal(result.arrivalRealTime, null);
    near(result.state.processedRealTime, T + HOUR/10, 0.01); near(result.state.distanceIntoLegNm, 3.6); near(result.state.totalFuelUsed, 1.2);
  });
  test('frozen inputs are not mutated during navigation', () => {
    const state = Object.freeze(initial()); const legs = Object.freeze([Object.freeze(leg())]);
    const before = JSON.stringify({state,legs}); advance(options({state,legs}));
    assert.equal(JSON.stringify({state,legs}), before);
  });
  test('invalid times checkpoints legs settings and uncovered wind are rejected', () => {
    for (const overrides of [{untilRealTime:T-1},{untilRealTime:NaN},{state:{...initial(),fuelRemaining:-1}},{state:{...initial(),totalFuelUsed:Infinity}},{state:{...initial(),legIndex:0.5}},{state:{...initial(),distanceIntoLegNm:15}},{legs:[]},{legs:[{...leg(),distanceNm:0}]},{selectedSpeedKnots:0},{readWind:()=>({wind:calm,startsAt:T+1,endsAt:T+2})},{readWind:()=>({wind:calm,startsAt:T,endsAt:T})}]) assert.throws(() => advance(options(overrides)));
  });
  const route = routes[0];
  const realLegs = getRouteWindLegs(route);
  const snapshot = createContractWindForecast(route, T);
  for (const rows of Object.values(snapshot.forecastsByHex)) for (const row of rows) row.forecastWind = {...calm};
  const preview = (overrides = {}, edition = snapshot) => estimate(options({legs:realLegs,...overrides}), edition);
  test('saved forecast ETA and fuel match independent all-calm calculation', () => {
    const before = JSON.stringify(snapshot); const result = preview();
    const distance = realLegs.reduce((sum,x)=>sum+x.distanceNm,0);
    assert.equal(result.status, 'arrived');
    near(result.arrivalRealTime, T + distance / 6 / acceleration * HOUR, 0.01);
    near(result.state.totalFuelUsed, distance / 6 * 2);
    assert.equal(JSON.stringify(snapshot), before);
  });
  test('saved forecast supports fractional processing times', () => {
    const result = preview({state:{...initial(),processedRealTime:T + 0.5}});
    assert.equal(result.status, 'arrived');
    near(result.arrivalRealTime, T + 0.5 + realLegs.length * 15 / 6 / acceleration * HOUR, 0.01);
  });
  test('saved forecast honors insufficient fuel', () => {
    const result = preview({state:initial(1)});
    assert.equal(result.status, 'fuelDepleted'); assert.equal(result.arrivalRealTime, null); near(result.state.fuelRemaining,0);
  });
  test('forecast horizon returns no arrival instead of using future actual wind', () => {
    const result = preview({legs:realLegs.map(x=>({...x,distanceNm:1000000}))});
    assert.equal(result.status, 'timeReached'); assert.equal(result.arrivalRealTime,null);
    near(result.state.processedRealTime, snapshot.validTo, 0.01);
  });
  test('invalid edition mismatched route and time outside coverage are rejected', () => {
    assert.throws(() => preview({}, {...snapshot,schemaVersion:999}));
    assert.throws(() => preview({legs:realLegs.map(x=>({...x,hexId:'missing'}))}));
    assert.throws(() => preview({state:{...initial(),processedRealTime:snapshot.validFrom-1}}));
    assert.throws(() => preview({state:{...initial(),processedRealTime:snapshot.validTo+1}}));
    const broken = JSON.parse(JSON.stringify(snapshot)); broken.forecastsByHex[realLegs[0].hexId].pop();
    assert.throws(() => preview({},broken));
  });
} finally { await server.close(); }
console.log(JSON.stringify({passed,failed}));
if (failed) process.exitCode = 1;
