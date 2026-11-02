import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected} (tolerance ${tolerance})`);
}

export async function runSuite(suite, body) {
  let server;
  let passed = 0, failed = 0;
  try {
    server = await createServer({
      root: fileURLToPath(new URL('../../', import.meta.url)),
      server: { middlewareMode: true }, appType: 'custom'
    });
    const check = (name, fn) => {
      try {
        const result = fn();
        if (result && typeof result.then === 'function') throw new Error('Use synchronous assertions inside check');
        passed++; console.log(`PASS [${suite}] ${name}`);
      } catch (error) {
        failed++; console.error(`FAIL [${suite}] ${name}`); console.error(error);
      }
    };
    await body({ load: path => server.ssrLoadModule(path), check });
    console.log(JSON.stringify({ suite, passed, failed }));
    assert.equal(failed, 0, `${suite}: ${failed} failed`);
  } catch (error) {
    process.exitCode = 1;
    throw error;
  } finally {
    if (server) await server.close();
  }
}
