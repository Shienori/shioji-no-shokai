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
    isSelectedSpeedWithinLimits,
  } = await server.ssrLoadModule(
    '/src/domain/voyageSpeedValidation.ts',
  );

  const values = [
    -Infinity, -1, 0, 5, 6, 6.5, 7, 7.5, 8,
    NaN, Infinity,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ];

  const originalRange = (ship, speed) =>
    Number.isSafeInteger(speed) &&
    speed >= ship.cruisingSpeedKnots &&
    speed <= ship.maxSpeedKnots;

  const originalStoreAllowed = (ship, speed) => !(
    !Number.isSafeInteger(ship.cruisingSpeedKnots) ||
    ship.cruisingSpeedKnots <= 0 ||
    !Number.isSafeInteger(ship.maxSpeedKnots) ||
    !Number.isSafeInteger(speed) ||
    speed < ship.cruisingSpeedKnots ||
    speed > ship.maxSpeedKnots ||
    (ship.kind !== 'powered' && speed !== ship.cruisingSpeedKnots)
  );

  const proposedStoreAllowed = (ship, speed) => !(
    !Number.isSafeInteger(ship.cruisingSpeedKnots) ||
    ship.cruisingSpeedKnots <= 0 ||
    !Number.isSafeInteger(ship.maxSpeedKnots) ||
    !isSelectedSpeedWithinLimits(ship, speed) ||
    (ship.kind !== 'powered' && speed !== ship.cruisingSpeedKnots)
  );

  let checked = 0;

  for (const cruisingSpeedKnots of values) {
    for (const maxSpeedKnots of values) {
      for (const speed of [
        ...values, undefined, null, '7',
      ]) {
        for (const kind of ['powered', 'sailing']) {
          const ship = {
            kind,
            cruisingSpeedKnots,
            maxSpeedKnots,
          };

          assert.equal(
            isSelectedSpeedWithinLimits(ship, speed),
            originalRange(ship, speed),
          );

          assert.equal(
            proposedStoreAllowed(ship, speed),
            originalStoreAllowed(ship, speed),
          );

          checked++;
        }
      }
    }
  }

  const ship = {
    cruisingSpeedKnots: 6,
    maxSpeedKnots: 7,
  };

  assert.equal(isSelectedSpeedWithinLimits(ship, 6), true);
  assert.equal(isSelectedSpeedWithinLimits(ship, 7), true);
  assert.equal(isSelectedSpeedWithinLimits(ship, 5), false);
  assert.equal(isSelectedSpeedWithinLimits(ship, 8), false);
  assert.equal(isSelectedSpeedWithinLimits(ship, 6.5), false);

  console.log(
    `PASS ${checked} validation combinations match existing predicates`,
  );
} finally {
  await server.close();
}
