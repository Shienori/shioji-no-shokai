import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const {
    MAP_HEX_SIZE,
    MAP_PADDING,
    getMapCenter,
    getMapViewBox,
  } = await server.ssrLoadModule(
    '/src/components/map/mapGeometry.ts',
  );

  const { worldMap } = await server.ssrLoadModule(
    '/src/data/worldMap.ts',
  );

  const { hexMap } = await server.ssrLoadModule(
    '/src/data/hexMap.ts',
  );

  assert.equal(MAP_HEX_SIZE, 26);
  assert.equal(MAP_PADDING, 74);

  const originalBaseCenter = ({ q, r }) => ({
    x: (Math.sqrt(3) * 26) * (q + r / 2),
    y: -1.5 * 26 * r,
  });

  const originalNumericCenter = ({ q, r }) => ({
    x: Math.sqrt(3) * 26 * (q + r / 2),
    y: -39 * r,
  });

  const cells = [
    ...worldMap.terrain,
    ...hexMap,
    { q: 0, r: 0 },
    { q: -3, r: 4 },
    { q: 5, r: -2 },
  ];

  for (const cell of cells) {
    assert.deepEqual(
      getMapCenter(cell),
      originalBaseCenter(cell),
    );
    assert.deepEqual(
      getMapCenter(cell),
      originalNumericCenter(cell),
    );
  }

  console.log('PASS map centers retain existing coordinates');

  const points = worldMap.terrain.map(originalBaseCenter);
  assert.ok(points.length > 0);

  const padding = 26 + 48;
  const minX = Math.min(...points.map(point => point.x)) - padding;
  const maxX = Math.max(...points.map(point => point.x)) + padding;
  const minY = Math.min(...points.map(point => point.y)) - padding;
  const maxY = Math.max(...points.map(point => point.y)) + padding;

  const originalBaseViewBox =
    `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  const originalOverlayViewBox =
    `${minX} ${minY} ${
      Math.max(...points.map(point => point.x)) + padding - minX
    } ${
      Math.max(...points.map(point => point.y)) + padding - minY
    }`;

  const sharedViewBox = getMapViewBox(
    worldMap.terrain.map(getMapCenter),
  );

  assert.equal(sharedViewBox, originalBaseViewBox);
  assert.equal(sharedViewBox, originalOverlayViewBox);

  console.log('PASS base map and overlays retain matching view boxes');

  const display = await server.ssrLoadModule(
    '/src/components/map/NumericWindDisplay.tsx',
  );

  const presentation = await server.ssrLoadModule(
    '/src/components/map/numericWindPresentation.ts',
  );

  for (const name of [
    'WIND_IMPACT_COLORS',
    'describeNumericWind',
    'getNumericWindRows',
  ]) {
    assert.equal(display[name], presentation[name]);
  }

  console.log('PASS existing numeric wind exports remain compatible');
} finally {
  await server.close();
}
