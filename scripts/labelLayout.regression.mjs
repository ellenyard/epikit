import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-label-test-'));
const bundled = path.join(tempDir, 'labelLayout.mjs');

/** Do any two labels sharing a row overlap horizontally? */
function overlapsWithin(boxes, rows) {
  const byRow = new Map();
  for (const box of boxes) {
    const row = rows.get(box.id);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(box);
  }
  const collisions = [];
  for (const [row, members] of byRow) {
    members.sort((a, b) => a.x - b.x);
    for (let i = 0; i < members.length - 1; i++) {
      const a = members[i];
      const b = members[i + 1];
      if (a.x + a.width > b.x) collisions.push(`row ${row}: ${a.id} overlaps ${b.id}`);
    }
  }
  return collisions;
}

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/labelLayout.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundled,
    logLevel: 'silent',
  });

  const { assignLabelRows, estimateLabelWidth } = await import(pathToFileURL(bundled).href);

  // 1. Labels that do not overlap all stay on the top row, so charts that were
  //    fine before this change look exactly as they did.
  {
    const boxes = [
      { id: 'a', x: 0, width: 40 },
      { id: 'b', x: 100, width: 40 },
      { id: 'c', x: 200, width: 40 },
    ];
    const rows = assignLabelRows(boxes);
    assert.deepEqual([...rows.values()], [0, 0, 0], 'non-overlapping labels should not be stacked');
    assert.deepEqual(overlapsWithin(boxes, rows), []);
  }

  // 2. The regression this was written for: a well-run 7-1-7 response puts the
  //    milestones about a bar-width apart, while the labels are far wider.
  //    Before the fix every one of these sat on the same row.
  {
    const boxes = [
      { id: 'exposure', x: 544, width: estimateLabelWidth('Exposure: 12-2 PM', 12, 8) },
      { id: 'detected', x: 604, width: estimateLabelWidth('Detected (Day 1)', 12, 8) },
      { id: 'notified', x: 664, width: estimateLabelWidth('Notified (+1d)', 12, 8) },
      { id: 'response', x: 724, width: estimateLabelWidth('Response (+1d)', 12, 8) },
    ];
    const rows = assignLabelRows(boxes);
    assert.deepEqual(overlapsWithin(boxes, rows), [], '7-1-7 milestone labels must not overlap');
    assert.ok(new Set(rows.values()).size > 1, 'colliding labels should occupy more than one row');
  }

  // 3. Labels anchored at the identical x (several annotations on one day)
  //    each get their own row.
  {
    const boxes = [
      { id: 'a', x: 300, width: 80 },
      { id: 'b', x: 300, width: 80 },
      { id: 'c', x: 300, width: 80 },
    ];
    const rows = assignLabelRows(boxes);
    assert.deepEqual([...rows.values()].sort(), [0, 1, 2], 'same-x labels should each take a row');
  }

  // 4. A row is reused once there is clear space again, rather than growing
  //    the stack indefinitely across a wide chart.
  {
    const boxes = [
      { id: 'a', x: 0, width: 50 },
      { id: 'b', x: 20, width: 50 },
      { id: 'c', x: 400, width: 50 },
    ];
    const rows = assignLabelRows(boxes);
    assert.equal(rows.get('a'), 0);
    assert.equal(rows.get('b'), 1, 'b collides with a');
    assert.equal(rows.get('c'), 0, 'c is clear of a, so it returns to the top row');
  }

  // 5. Ordering of the input must not change the result.
  {
    const boxes = [
      { id: 'a', x: 0, width: 50 },
      { id: 'b', x: 20, width: 50 },
      { id: 'c', x: 40, width: 50 },
    ];
    const forward = assignLabelRows(boxes);
    const reversed = assignLabelRows([...boxes].reverse());
    assert.deepEqual([...forward.entries()].sort(), [...reversed.entries()].sort(),
      'row assignment should not depend on input order');
  }

  // 6. Width estimation tracks the measured widths of the real labels closely
  //    enough to drive the stacking (measured in Chrome at 12px medium).
  {
    for (const [text, measured] of [['Detected (Day 1)', 105], ['Notified (+1d)', 88], ['Response (+1d)', 98]]) {
      const est = estimateLabelWidth(text, 12);
      assert.ok(Math.abs(est - measured) <= 25,
        `width estimate for "${text}" was ${est.toFixed(1)}, measured ${measured}`);
    }
  }

  // 7. Empty input is safe.
  assert.equal(assignLabelRows([]).size, 0);

  console.log('labelLayout regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
