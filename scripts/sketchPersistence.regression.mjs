/**
 * Sketch map saving and restoring.
 *
 * The sketch map kept nothing at all, and the three map modes are a ternary, so
 * clicking from Sketch Map to Spot Map unmounted the component and discarded the
 * drawing. Restored state is untrusted, and a malformed element does not throw:
 * the renderer is an if/else chain on element type, so anything unrecognised
 * draws nothing. Bad data is therefore invisible, which is why it is validated
 * rather than trusted.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-sketch-test-'));
const bundled = path.join(tempDir, 'sketchPersistence.mjs');

class MemoryStorage {
  #map = new Map();
  getItem(k) { return this.#map.has(k) ? this.#map.get(k) : null; }
  setItem(k, v) { this.#map.set(k, String(v)); }
  removeItem(k) { this.#map.delete(k); }
  has(k) { return this.#map.has(k); }
}

const marker = (over = {}) => ({
  id: 'm1', type: 'marker', start: { x: 100, y: 200 },
  color: '#1F2937', strokeWidth: 4, size: 40,
  fillPattern: 'solid', lineStyle: 'solid', filled: true, opacity: 1,
  markerId: 'case', markerShape: 'circle', legendLabel: 'Case', ...over,
});

const state = (elements) => ({
  elements,
  background: 'grid',
  showTitle: true,
  title: 'Kibera outbreak',
  subtitle: 'Not to scale',
  showLegend: true,
  legendPosition: 'side',
});

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/sketchPersistence.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    sanitizeSketchElement, sanitizeSketchState, readSketchState, writeSketchState,
    sketchStorageKey, pushHistorySnapshot, MAX_SKETCH_ELEMENTS, MAX_POINTS_PER_ELEMENT,
  } = await import(pathToFileURL(bundled).href);

  // 1. A real sketch survives the round trip through storage unchanged. This is
  //    the whole point: the drawing has to come back exactly as drawn.
  {
    const storage = new MemoryStorage();
    const original = state([
      marker(),
      marker({ id: 'm2', markerId: 'well', markerShape: 'well', start: { x: 300, y: 410 } }),
      {
        id: 'p1', type: 'pen',
        points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }],
        color: '#B91C1C', strokeWidth: 3, size: 40,
        fillPattern: 'solid', lineStyle: 'dashed', filled: false, opacity: 0.8,
      },
      {
        id: 'l1', type: 'line', start: { x: 0, y: 0 }, end: { x: 900, y: 120 },
        color: '#9CA3AF', strokeWidth: 7, size: 40,
        fillPattern: 'solid', lineStyle: 'solid', filled: false, opacity: 1,
        legendLabel: 'Road',
      },
      {
        id: 't1', type: 'label', start: { x: 50, y: 60 }, text: 'Borehole',
        color: '#111827', strokeWidth: 4, size: 16,
        fillPattern: 'solid', lineStyle: 'solid', filled: false, opacity: 1,
      },
    ]);

    assert.equal(writeSketchState(storage, 'ds1', original), true);
    const back = readSketchState(storage, 'ds1');
    assert.deepEqual(back, original, 'a saved sketch must come back exactly as drawn');
    assert.equal(back.elements.length, 5, 'no element may be lost in a round trip');
  }

  // 2. Sketches are per dataset, so one does not appear under another.
  {
    const storage = new MemoryStorage();
    writeSketchState(storage, 'ds1', state([marker()]));
    assert.equal(readSketchState(storage, 'ds2'), null, 'another dataset has its own sketch');
    assert.ok(storage.has(sketchStorageKey('ds1')));
  }

  // 3. Clearing the canvas removes the entry rather than storing a blank, so a
  //    cleared tab cannot overwrite work saved for the same dataset elsewhere.
  {
    const storage = new MemoryStorage();
    writeSketchState(storage, 'ds1', state([marker()]));
    writeSketchState(storage, 'ds1', state([]));
    assert.equal(storage.has(sketchStorageKey('ds1')), false, 'an empty sketch is removed, not written');
    assert.equal(readSketchState(storage, 'ds1'), null);
  }

  // 4. Elements that could not be drawn are dropped, because the renderer would
  //    show nothing and the user could not select them to fix them.
  {
    const undrawable = [
      ['an unknown tool type', { ...marker(), type: 'teleporter' }],
      ['a missing id', { ...marker(), id: '' }],
      ['a pen stroke with one point', { ...marker(), id: 'p', type: 'pen', points: [{ x: 1, y: 2 }], start: undefined }],
      ['a line with no end', { ...marker(), id: 'l', type: 'line', end: undefined }],
      ['a marker with no position', { ...marker(), start: undefined }],
      ['a label with no text', { ...marker(), id: 'x', type: 'label', text: '   ' }],
      ['a NaN coordinate', { ...marker(), start: { x: NaN, y: 10 } }],
      ['an infinite coordinate', { ...marker(), start: { x: Infinity, y: 10 } }],
      ['a coordinate far outside any canvas', { ...marker(), start: { x: 1e12, y: 10 } }],
      ['a non-object', 'not an element'],
      ['null', null],
    ];
    for (const [label, bad] of undrawable) {
      assert.equal(sanitizeSketchElement(bad), null, `${label} must be dropped`);
    }
  }

  // 5. One bad element must not cost the whole map. Partial recovery beats
  //    losing a village sketch because a single shape was corrupt.
  {
    const mixed = sanitizeSketchState(state([
      marker({ id: 'good1' }),
      { ...marker(), id: 'bad', type: 'nonsense' },
      marker({ id: 'good2', start: { x: 5, y: 5 } }),
    ]));
    assert.deepEqual(mixed.elements.map(e => e.id), ['good1', 'good2'],
      'the usable elements must survive alongside a corrupt one');
  }

  // 6. Duplicate ids are dropped: selection and deletion address elements by id,
  //    so a repeated id makes those act on the wrong shape.
  {
    const dup = sanitizeSketchState(state([
      marker({ id: 'same' }),
      marker({ id: 'same', start: { x: 700, y: 700 } }),
    ]));
    assert.equal(dup.elements.length, 1, 'a duplicate id is dropped');
  }

  // 7. Invalid enum values fall back rather than reaching the renderer, which
  //    switches on them.
  {
    const coerced = sanitizeSketchElement({
      ...marker(), fillPattern: 'plaid', lineStyle: 'squiggle', markerShape: 'dragon',
    });
    assert.equal(coerced.fillPattern, 'solid');
    assert.equal(coerced.lineStyle, 'solid');
    assert.ok(!('markerShape' in coerced), 'an unknown marker shape is omitted, not guessed');

    const doc = sanitizeSketchState({ ...state([marker()]), background: 'hologram', legendPosition: 'orbit' });
    assert.equal(doc.background, 'grid');
    assert.equal(doc.legendPosition, 'side');
  }

  // 8. Numbers that would break rendering are repaired: a non-positive stroke
  //    width draws nothing, and opacity outside 0..1 renders inconsistently.
  {
    const fixed = sanitizeSketchElement({ ...marker(), strokeWidth: 0, size: -5, opacity: 4 });
    assert.ok(fixed.strokeWidth > 0, 'stroke width must be positive');
    assert.ok(fixed.size > 0, 'size must be positive');
    assert.equal(fixed.opacity, 1, 'opacity above 1 is clamped');
    assert.equal(sanitizeSketchElement({ ...marker(), opacity: -2 }).opacity, 0, 'and below 0');
  }

  // 9. Caps. An oversized file would stall the renderer on restore, the way an
  //    unvalidated bin size once hung the epi curve.
  {
    const many = sanitizeSketchState(state(
      Array.from({ length: MAX_SKETCH_ELEMENTS + 500 }, (_, i) => marker({ id: `m${i}` }))
    ));
    assert.equal(many.elements.length, MAX_SKETCH_ELEMENTS, 'the element count is capped');

    const longStroke = sanitizeSketchElement({
      ...marker(), id: 'p', type: 'pen', start: undefined,
      points: Array.from({ length: MAX_POINTS_PER_ELEMENT + 100 }, (_, i) => ({ x: i, y: i })),
    });
    assert.equal(longStroke.points.length, MAX_POINTS_PER_ELEMENT, 'points per element are capped');
  }

  // 10. Corrupt or hostile storage never throws: drawing must keep working.
  {
    const storage = new MemoryStorage();
    storage.setItem(sketchStorageKey('ds1'), '{not json');
    assert.equal(readSketchState(storage, 'ds1'), null, 'corrupt JSON reads as nothing stored');

    storage.setItem(sketchStorageKey('ds2'), JSON.stringify({ nope: true }));
    assert.equal(readSketchState(storage, 'ds2'), null, 'a shape with no elements array is refused');

    assert.equal(readSketchState(undefined, 'ds1'), null, 'absent storage is not an error');
    assert.equal(writeSketchState(undefined, 'ds1', state([marker()])), false);

    const full = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
    };
    assert.equal(writeSketchState(full, 'ds1', state([marker()])), false,
      'a full quota reports failure instead of throwing mid-drawing');
  }

  // 11. Undo history is bounded, keeping the most recent steps.
  {
    let stack = [];
    for (let i = 0; i < 60; i++) stack = pushHistorySnapshot(stack, i, 50);
    assert.equal(stack.length, 50, 'history is capped');
    assert.equal(stack[stack.length - 1], 59, 'the most recent snapshot is kept');
    assert.equal(stack[0], 10, 'the oldest snapshots are discarded');
    assert.deepEqual(pushHistorySnapshot([1, 2], 3, 0), [], 'a zero limit keeps nothing');
  }

  console.log('sketch persistence regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
