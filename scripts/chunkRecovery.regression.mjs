/**
 * Recovering from a stale lazy-loaded chunk.
 *
 * Modules are code-split under content-hashed filenames, so a deploy leaves a
 * tab opened beforehand asking for files that no longer exist. Panels already
 * visited keep working from memory; any not yet opened fail. Retrying the same
 * dead URL never helps, so this has to be told apart from an ordinary error and
 * answered with a reload, without turning a genuine bug into a silent refresh.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-chunk-test-'));
const bundled = path.join(tempDir, 'chunkRecovery.mjs');

class MemoryStorage {
  #m = new Map();
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
}

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/chunkRecovery.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: bundled, logLevel: 'silent',
  });
  const { isStaleChunkError, reloadForStaleChunk } = await import(pathToFileURL(bundled).href);

  // 1. Messages browsers actually produce when a hashed chunk has gone.
  for (const m of [
    'Loading chunk 42 failed.',
    'Failed to fetch dynamically imported module: https://linelist.org/assets/Maps-DznWLEHt.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
  ]) {
    assert.ok(isStaleChunkError({ message: m }), `should be recognised: ${m}`);
  }
  assert.ok(isStaleChunkError({ name: 'ChunkLoadError', message: '' }),
    'the error name alone is enough');

  // 2. Ordinary application errors must not trigger a reload, or a real bug
  //    turns into an unexplained refresh and the message is never seen.
  for (const m of [
    "Cannot read properties of undefined (reading 'count')",
    'Maximum call stack size exceeded',
    'Invalid project file: missing datasets',
    'localStorage is full',
    'Something went wrong',
  ]) {
    assert.ok(!isStaleChunkError({ message: m }), `should NOT reload for: ${m}`);
  }
  assert.ok(!isStaleChunkError(null) && !isStaleChunkError(undefined));

  // 3. It reloads once, then stops. Without the guard a chunk failing for any
  //    other reason would put the app in a refresh loop.
  {
    const storage = new MemoryStorage();
    let reloads = 0;
    const first = reloadForStaleChunk(storage, () => reloads++);
    const second = reloadForStaleChunk(storage, () => reloads++);
    assert.equal(first, true, 'the first failure reloads');
    assert.equal(second, false, 'the second does not');
    assert.equal(reloads, 1, 'exactly one reload');
  }

  // 4. Without usable storage it declines to reload rather than looping
  //    forever, leaving the user the on-screen instruction instead.
  {
    let reloads = 0;
    assert.equal(reloadForStaleChunk(undefined, () => reloads++), false);
    const hostile = { getItem() { throw new Error('denied'); }, setItem() {} };
    assert.equal(reloadForStaleChunk(hostile, () => reloads++), false);
    assert.equal(reloads, 0, 'no reload without somewhere to record it');
  }

  console.log('chunk recovery regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
