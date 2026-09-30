/**
 * Dialog focus cycling.
 *
 * The whole point of a trap is the two ends: Tab on the last control and
 * Shift+Tab on the first are what let the keyboard escape a dialog and start
 * walking the page underneath the backdrop, where a user can operate controls
 * they cannot see. Everything in between is the browser's own behaviour and
 * must be left alone, or Tab stops working normally inside the dialog.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-focus-test-'));
const bundled = path.join(tempDir, 'focusTrap.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/focusTrap.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { nextFocusIndex, FOCUSABLE_SELECTOR } = await import(pathToFileURL(bundled).href);

  // 1. The two ends wrap, which is what keeps the keyboard inside.
  assert.equal(nextFocusIndex(4, 3, false), 0, 'Tab on the last control returns to the first');
  assert.equal(nextFocusIndex(4, 0, true), 3, 'Shift+Tab on the first goes to the last');

  // 2. Everything in between is left to the browser. Intervening there would
  //    mean reimplementing tab order, which goes wrong with nested controls.
  for (const [index, shift] of [[0, false], [1, false], [2, false], [1, true], [3, true]]) {
    assert.equal(nextFocusIndex(4, index, shift), null,
      `index ${index}${shift ? ' with shift' : ''} needs no intervention`);
  }

  // 3. A single focusable control cycles to itself rather than escaping.
  assert.equal(nextFocusIndex(1, 0, false), 0);
  assert.equal(nextFocusIndex(1, 0, true), 0);

  // 4. Focus outside the dialog is pulled back to the appropriate end. This is
  //    the state after the dialog opens but before focus has moved into it.
  assert.equal(nextFocusIndex(3, -1, false), 0);
  assert.equal(nextFocusIndex(3, -1, true), 2);

  // 5. A dialog with nothing focusable is left alone; there is nowhere to send
  //    focus, and preventing Tab would strand the user with no way out.
  assert.equal(nextFocusIndex(0, -1, false), null);
  assert.equal(nextFocusIndex(0, 0, true), null);

  // 6. The selector must exclude disabled controls and anything deliberately
  //    taken out of the tab order, or focus lands somewhere inoperable.
  assert.ok(FOCUSABLE_SELECTOR.includes('button:not([disabled])'));
  assert.ok(FOCUSABLE_SELECTOR.includes('[tabindex]:not([tabindex="-1"])'),
    'tabindex -1 elements, including the dialog panel itself, are not tab stops');
  for (const tag of ['a[href]', 'input', 'select', 'textarea']) {
    assert.ok(FOCUSABLE_SELECTOR.includes(tag), `${tag} must be reachable`);
  }

  console.log('focus trap regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
