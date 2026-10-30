/**
 * Tool addresses: linelist.org/app/epicurve/, /app/maps/ and so on.
 *
 * A shared link that opens the wrong tool, or a tool with no folder in the
 * build, fails quietly: GitHub Pages answers a missing folder with the 404
 * page, and someone following a link from a workshop slide just sees "That
 * page doesn't exist". So this checks both that every tool's address maps to
 * that tool and back, and, when a build is present, that every tool has its
 * own copy of the app page.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-routes-test-'));
const bundled = path.join(tempDir, 'appRoutes.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/appRoutes.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { moduleFromPath, pathForModule, TOOL_SLUGS, APP_BASE_PATH } =
    await import(pathToFileURL(bundled).href);

  const modules = ['dashboard', ...Object.keys(TOOL_SLUGS)];

  // Round trip: every module's address opens that module.
  for (const module of modules) {
    assert.equal(moduleFromPath(pathForModule(module)), module, `round trip for ${module}`);
  }

  // Addresses as people actually type or paste them.
  assert.equal(pathForModule('dashboard'), '/app/');
  assert.equal(pathForModule('epicurve'), '/app/epicurve/');
  assert.equal(moduleFromPath('/app'), 'dashboard');
  assert.equal(moduleFromPath('/app/index.html'), 'dashboard');
  assert.equal(moduleFromPath('/app/maps'), 'maps');
  assert.equal(moduleFromPath('/app/maps/index.html'), 'maps');
  assert.equal(moduleFromPath('/app/Maps/'), 'maps');
  assert.equal(moduleFromPath('/app/analysis//'), 'analysis');
  // The tutorial has an address of its own, for workshop slides.
  assert.equal(pathForModule('tutorial'), '/app/tutorial/');
  assert.equal(moduleFromPath('/app/Tutorial'), 'tutorial');

  // An unknown tool under /app/ opens the home screen instead of nothing.
  assert.equal(moduleFromPath('/app/2x2/'), 'dashboard');

  // Outside the app is not an app address.
  assert.equal(moduleFromPath('/'), null);
  assert.equal(moduleFromPath('/application/'), null);
  assert.equal(moduleFromPath('/apps/maps/'), null);

  // Every address sits under the app and ends in a slash, which is what
  // GitHub Pages serves a folder's index.html at without a redirect.
  for (const module of modules) {
    const p = pathForModule(module);
    assert.ok(p.startsWith(APP_BASE_PATH) && p.endsWith('/'), p);
  }

  // When a build exists, each tool has its own copy of the app page.
  const dist = path.join(root, 'dist');
  const appPage = await readFile(path.join(dist, 'app/index.html'), 'utf8').catch(() => null);
  if (appPage === null) {
    console.log('app routes: no dist/ build found, skipping the built-folder check');
  } else {
    for (const slug of Object.values(TOOL_SLUGS)) {
      const copy = path.join(dist, 'app', slug, 'index.html');
      await access(copy);
      assert.equal(await readFile(copy, 'utf8'), appPage, `${slug}/index.html matches the app page`);
    }
  }

  console.log('app routes regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
