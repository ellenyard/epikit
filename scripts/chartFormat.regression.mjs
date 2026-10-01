/**
 * Chart axes and number formatting.
 *
 * Every chart in the Visualize gallery used to carry its own "nice maximum"
 * and its own formatter. Between them they drew a bar chart of negative means
 * with an axis from 0 to 10 and no bars, labelled a count axis 0, 0.4, 0.8,
 * printed attack rates of 0.03 as "0.0", and ran the axis to 100 for a maximum
 * of 52. These are the cases those faults came from.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-chartformat-test-'));
const bundled = path.join(tempDir, 'chartFormat.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/chartFormat.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { niceScale, decimalsForStep, decimalsForValues, formatFixed, formatTick, median, allocateSquares } =
    await import(pathToFileURL(bundled).href);

  // 1. The axis stops at the first round value past the data. The bundled
  //    outbreak sample has a largest bar of 52; its axis ran to 100.
  {
    const scale = niceScale(0, 52, { integer: true });
    assert.deepEqual(scale.ticks, [0, 10, 20, 30, 40, 50, 60]);
    assert.equal(niceScale(0, 100).max, 100, 'a maximum already on a round value is not pushed further');
    assert.equal(niceScale(0, 73).max, 80);
  }

  // 2. A count axis steps in whole records. A maximum of 2 used to read
  //    0, 0.4, 0.8, 1.2, 1.6, 2.
  {
    assert.deepEqual(niceScale(0, 2, { integer: true }).ticks, [0, 1, 2]);
    assert.deepEqual(niceScale(0, 1, { integer: true }).ticks, [0, 1]);
    assert.deepEqual(niceScale(0, 7, { integer: true }).ticks, [0, 2, 4, 6, 8]);
    for (const max of [1, 2, 3, 5, 9, 13, 52, 147, 1234]) {
      const { ticks } = niceScale(0, max, { integer: true });
      assert.ok(ticks.every(Number.isInteger), `fractional tick on a count axis with maximum ${max}: ${ticks}`);
      assert.ok(ticks[ticks.length - 1] >= max, `axis stops short of ${max}`);
    }
  }

  // 3. Negative data gets an axis that contains it, through zero. Mean
  //    weight-for-height z-scores from the bundled nutrition sample.
  {
    const scale = niceScale(-1.38, -0.79);
    assert.ok(scale.min <= -1.38, 'the axis reaches below the lowest value');
    assert.equal(scale.max, 0, 'and ends at zero, the baseline the bars grow from');
    assert.ok(scale.ticks.includes(0));

    const mixed = niceScale(-3, 7);
    assert.ok(mixed.min <= -3 && mixed.max >= 7 && mixed.ticks.includes(0));
  }

  // 4. Small values keep their ticks distinct. A maximum of 0.046 used to give
  //    an axis reading 0, 0.0, 0.0, 0.0, 0.0, 0.1.
  {
    const scale = niceScale(0, 0.046);
    const labels = scale.ticks.map(t => formatTick(t, scale));
    assert.deepEqual(labels, ['0.00', '0.01', '0.02', '0.03', '0.04', '0.05']);
    assert.equal(new Set(labels).size, labels.length, 'no two ticks print the same');
  }

  // 5. Ticks are free of binary noise, and their decimals match the step.
  {
    const scale = niceScale(0, 0.9);
    assert.ok(scale.ticks.every(t => String(t).length <= 4), `noisy ticks: ${scale.ticks}`);
    assert.equal(decimalsForStep(0.25), 2);
    assert.equal(decimalsForStep(0.1), 1);
    assert.equal(decimalsForStep(20), 0);
  }

  // 6. A dot plot may start its axis near the data, with round ticks. The old
  //    padding arithmetic produced 9.9, 10.0, 10.0, 10.0, 10.1, 10.1.
  {
    const scale = niceScale(29.9, 33.3, { includeZero: false });
    assert.ok(scale.min > 0 && scale.min <= 29.9 && scale.max >= 33.3);
    assert.ok(scale.ticks.every(Number.isInteger), `expected whole-number ticks, got ${scale.ticks}`);
  }

  // 7. A single value, or no extent at all, still yields a usable axis.
  {
    for (const [lo, hi, options] of [[0, 0, {}], [5, 5, {}], [5, 5, { includeZero: false }], [-2, -2, {}], [NaN, NaN, {}], [Infinity, -Infinity, {}]]) {
      const scale = niceScale(lo, hi, options);
      assert.ok(scale.max > scale.min, `no extent for ${lo}..${hi}`);
      assert.ok(scale.ticks.length >= 2 && scale.ticks.every(Number.isFinite));
    }
  }

  // 8. One decimal setting per chart, enough for the values on it.
  {
    assert.equal(decimalsForValues([3, 10, 52]), 0, 'whole numbers print whole');
    assert.equal(decimalsForValues([-0.8, -1.4]), 1);
    assert.equal(decimalsForValues([0.01, 0.022, 0.046]), 3, 'rates keep two significant figures');
    assert.equal(formatFixed(0.046, decimalsForValues([0.01, 0.022, 0.046])), '0.046');
    assert.equal(decimalsForValues([]), 0);
  }

  // 9. Numbers use the separators chosen in the app, not the browser's.
  {
    assert.equal(formatFixed(14222, 0), '14,222');
    assert.equal(formatFixed(1234.5, 1, { decimalSeparator: ',', thousandsSeparator: '.' }), '1.234,5');
    assert.equal(formatFixed(1234567, 0, { decimalSeparator: ',', thousandsSeparator: ' ' }), '1 234 567',
      'a space separator is a no-break space, so the number cannot be split');
    assert.equal(formatFixed(-0.04, 1), '0.0', 'a value that rounds to zero is not printed as minus zero');
    assert.equal(formatFixed(-1.38, 1), '-1.4');
    assert.equal(formatFixed(999, 0), '999');
  }

  // 10. Median of an even and an odd run.
  {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
  }

  // 11. Waffle squares always sum to the grid. They are square counts, not the
  //     percentages to print: three equal thirds are 34, 33 and 33 squares.
  {
    assert.deepEqual(allocateSquares([10, 10, 10]), [34, 33, 33]);
    assert.deepEqual(allocateSquares([100, 100, 99, 1]).reduce((a, b) => a + b, 0), 100);
    for (const shares of [[1, 299], [7, 11, 13], [1, 1, 1, 1, 1, 1, 1], [42]]) {
      assert.equal(allocateSquares(shares).reduce((a, b) => a + b, 0), 100, `squares for ${shares}`);
    }
    assert.deepEqual(allocateSquares([0, 0]), [0, 0], 'nothing to share out');
  }

  console.log('chartFormat regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
