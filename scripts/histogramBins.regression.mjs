/**
 * Histogram binning.
 *
 * The bin width is typed by the user and was not bounded, so a fine width over
 * a wide variable asked for millions of bins, each of which re-scanned every
 * value. The tab locked up with no way back. Binning is also where values go
 * quietly missing: a value sitting exactly on the top edge belongs in the last
 * bin, not outside the histogram.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-hist-test-'));
const bundled = path.join(tempDir, 'histogramBins.mjs');

const total = r => r.bins.reduce((s, b) => s + b.count, 0);

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/histogramBins.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { computeHistogram, MAX_HISTOGRAM_BINS } = await import(pathToFileURL(bundled).href);

  // 1. Every value is counted exactly once. A histogram that quietly drops
  //    values still looks like a distribution.
  {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r = computeHistogram(values, 2);
    assert.equal(total(r), values.length, 'every value must land in exactly one bin');
    assert.equal(r.widened, false);
  }

  // 2. The maximum belongs in the last bin. It sits exactly on the top edge,
  //    and a half-open rule applied there would drop it.
  {
    const r = computeHistogram([0, 5, 10], 5);
    assert.equal(total(r), 3, 'the maximum must not fall out of the histogram');
    assert.equal(r.bins.length, 2, 'range 0 to 10 at width 5 gives two bins');
    // The last bin is [5, 10] inclusive of both ends, so it holds 5 and 10.
    assert.equal(r.bins[1].count, 2, 'the last bin is closed at the top');
    assert.equal(r.bins[0].count, 1, 'and the first stays half-open');
  }

  // 3. Bins are half-open elsewhere, so a value on an internal boundary is
  //    counted once, in the bin it starts.
  {
    const r = computeHistogram([0, 4.999, 5, 5.001, 9.999], 5);
    assert.equal(total(r), 5);
    assert.equal(r.bins[0].count, 2, '0 and 4.999 fall in the first bin');
    assert.equal(r.bins[1].count, 3, '5, 5.001 and 9.999 fall in the second');
  }

  // 4. Negative values bin correctly; the edges round outward, not toward zero.
  {
    const r = computeHistogram([-9, -5, -1, 0, 3], 5);
    assert.equal(total(r), 5, 'negative values must all be counted');
    assert.ok(r.bins[0].binStart <= -9, `the first bin must contain the minimum, got ${r.bins[0].binStart}`);
    assert.ok(r.bins[r.bins.length - 1].binEnd >= 3, 'and the last must reach the maximum');
  }

  // 5. A single repeated value still produces one bin containing everything.
  {
    const r = computeHistogram([7, 7, 7], 1);
    assert.equal(total(r), 3);
    assert.ok(r.bins.length >= 1);
  }

  // 6. The cap. This is the hang: a fine width over a wide variable.
  {
    const values = Array.from({ length: 1000 }, (_, i) => i * 100);  // 0 to 99,900
    const r = computeHistogram(values, 0.0001);                      // ~1e9 bins requested
    assert.ok(r.bins.length <= MAX_HISTOGRAM_BINS,
      `bins must be capped, got ${r.bins.length}`);
    assert.equal(r.widened, true, 'and the caller must be told the width changed');
    assert.ok(r.binWidth > r.requestedBinWidth, 'the width used must be wider than requested');
    assert.equal(r.requestedBinWidth, 0.0001, 'the original request is reported back');
    assert.equal(total(r), values.length, 'capping must not lose values');
  }

  // 7. Widening never runs away: the result stays close to the cap rather than
  //    collapsing to a single bar.
  {
    const values = Array.from({ length: 500 }, (_, i) => i);
    const r = computeHistogram(values, 0.001);
    assert.ok(r.bins.length > 1, 'widening must not collapse the histogram to one bar');
    assert.ok(r.bins.length <= MAX_HISTOGRAM_BINS);
  }

  // 8. A width that already fits is left exactly alone.
  {
    const r = computeHistogram([0, 10, 20, 30], 10);
    assert.equal(r.widened, false);
    assert.equal(r.binWidth, 10, 'a workable width must not be altered');
  }

  // 9. Degenerate input returns nothing rather than throwing or hanging.
  for (const [label, values, width] of [
    ['no values', [], 1],
    ['a zero width', [1, 2, 3], 0],
    ['a negative width', [1, 2, 3], -5],
    ['a NaN width', [1, 2, 3], NaN],
    ['an infinite width', [1, 2, 3], Infinity],
  ]) {
    const r = computeHistogram(values, width);
    assert.deepEqual(r.bins, [], `${label} produces no bins`);
  }

  // 10. Non-finite values are excluded rather than corrupting the range. One
  //     Infinity would otherwise stretch the axis over everything.
  {
    const r = computeHistogram([1, 2, 3, NaN, Infinity, -Infinity], 1);
    assert.equal(total(r), 3, 'only the real values are counted');
    assert.ok(r.bins.length <= MAX_HISTOGRAM_BINS, 'and the range stays finite');
  }

  // 11. Labels distinguish adjacent edges. At a width below 0.1 a single
  //     decimal place renders every bin as the same range.
  {
    const r = computeHistogram([0, 0.02, 0.04, 0.06], 0.02);
    const labels = r.bins.map(b => b.label);
    assert.equal(new Set(labels).size, labels.length,
      `bin labels must be distinguishable, got ${labels.join(' | ')}`);
  }

  // 12. Counting is a single pass, so a large dataset stays fast. The old form
  //     filtered every value once per bin.
  {
    const values = Array.from({ length: 200000 }, (_, i) => i % 5000);
    const started = process.hrtime.bigint();
    const r = computeHistogram(values, 1);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(total(r), values.length);
    assert.ok(ms < 2000, `binning 200k values should not take ${Math.round(ms)}ms`);
  }

  console.log('histogram bins regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
