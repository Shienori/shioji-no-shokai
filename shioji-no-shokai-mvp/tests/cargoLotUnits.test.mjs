import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server;
try {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  const { cargoLots, getCargoLotById } = await server.ssrLoadModule('/src/data/cargoLots.ts');
  const { cargos, getCargoById } = await server.ssrLoadModule('/src/data/cargos.ts');
  const { CARGO_LOT_DATA_VERSION, calculateCargoLotRequirements, createCargoLotSnapshot } = await server.ssrLoadModule('/src/domain/cargoLotUnits.ts');
  const legacyBefore = JSON.stringify(cargos);
  const expected = [
    ['cargo_wheat', 0.5, 1, 2, 4, 8, 3, 30000],
    ['cargo_steel', 2, 0.5, 1, 2, 4, 7, 45000],
    ['cargo_silk', 0.2, 2, 1, 2, 4, 5, 40000],
    ['cargo_iron_ore', 1, 0.5, 2, 4, 8, 4, 30000],
    ['cargo_pottery', 0.3, 1.5, 1, 3, 5, 7, 35000],
    ['cargo_timber', 0.8, 2, 1, 2, 4, 2, 25000],
    ['cargo_wine', 0.5, 1, 2, 4, 8, 10, 50000],
    ['cargo_salt', 0.5, 0.8, 2, 4, 8, 3, 30000],
    ['cargo_spices', 0.2, 1, 1, 3, 6, 12, 45000],
  ];
  assert.equal(cargoLots.length, 9);
  assert.equal(new Set(cargoLots.map(lot => lot.id)).size, 9);
  for (const [id, weight, volume, small, standard, large, price, time] of expected) {
    const lot = getCargoLotById(id);
    assert.equal(lot.dataVersion, CARGO_LOT_DATA_VERSION);
    assert.equal(lot.transportUnitLabel, 'ロット');
    assert.ok(lot.packagingLabel.length > 0);
    assert.equal(lot.weightTonsPerLot, weight);
    assert.equal(lot.volumeM3PerLot, volume);
    assert.deepEqual(lot.initialLotQuantities, { small, standard, large });
    assert.equal(lot.unitPrice, price);
    assert.equal(lot.loadingTimeMsPerLot, time);
    assert.equal(lot.unloadingTimeMsPerLot, time);
    assert.equal(getCargoById(id).unitPrice, price);
    assert.equal(getCargoById(id).loadingTimeMsPerUnit, time);
    for (const quantity of [small, standard, large]) {
      const totals = calculateCargoLotRequirements(lot, quantity);
      assert.equal(totals.totalWeightTons, weight * quantity);
      assert.equal(totals.totalVolumeM3, volume * quantity);
      assert.equal(totals.cargoValue, price * quantity);
      assert.equal(totals.loadingDurationMs, time * quantity);
      assert.equal(totals.unloadingDurationMs, time * quantity);
    }
  }
  assert.deepEqual(calculateCargoLotRequirements(getCargoLotById('cargo_wheat'), 4), {
    totalWeightTons: 2, totalVolumeM3: 4, cargoValue: 12, loadingDurationMs: 120000, unloadingDurationMs: 120000,
  });
  const source = structuredClone(getCargoLotById('cargo_wheat'));
  const snapshot = createCargoLotSnapshot(source, 4);
  source.weightTonsPerLot = 99;
  assert.equal(snapshot.weightTonsPerLot, 0.5);
  assert.equal(snapshot.totalWeightTons, 2);
  assert.equal(snapshot.quantityLots, 4);
  assert.equal(snapshot.dataVersion, CARGO_LOT_DATA_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  for (const quantity of [0, -1, 1.5, NaN, Infinity, null, '4', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => calculateCargoLotRequirements(getCargoLotById('cargo_wheat'), quantity));
  }
  for (const field of ['weightTonsPerLot', 'volumeM3PerLot', 'loadingTimeMsPerLot', 'unloadingTimeMsPerLot']) {
    for (const value of [0, -1, NaN, Infinity]) {
      assert.throws(() => calculateCargoLotRequirements({ ...getCargoLotById('cargo_wheat'), [field]: value }, 1));
    }
  }
  assert.throws(() => calculateCargoLotRequirements({ ...getCargoLotById('cargo_wheat'), dataVersion: 'unknown' }, 1));
  assert.throws(() => calculateCargoLotRequirements({ ...getCargoLotById('cargo_wheat'), unitPrice: -1 }, 1));
  assert.throws(() => calculateCargoLotRequirements({ ...getCargoLotById('cargo_wheat'), weightTonsPerLot: Number.MAX_VALUE }, 2));
  assert.throws(() => getCargoLotById('unknown'));
  assert.equal(JSON.stringify(cargos), legacyBefore);
  assert.equal(getCargoById('cargo_wheat').weightPerUnit, 1);
  assert.equal(getCargoLotById('cargo_wheat').weightTonsPerLot, 0.5);
  console.log(JSON.stringify({ result: 'passed', checks: ['all nine approved cargo definitions and quantity presets', 'weight volume value and handling totals', 'snapshot independence and JSON serialization', 'invalid quantity version and overflow rejection', 'legacy catalog remains distinct and unchanged'] }, null, 2));
} finally {
  if (server) await server.close();
}
