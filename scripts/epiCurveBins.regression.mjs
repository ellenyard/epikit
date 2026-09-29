/**
 * Epi-curve binning and axis extent.
 *
 * The axis previously ran further past the outbreak than before it: getBinEnd
 * returns the exclusive bound one bin beyond the data, padding was added on top
 * of that, and the bin loop is inclusive. A three-day outbreak came out with
 * two leading and three trailing empty bins, so short outbreaks looked like
 * they trailed off into blank space.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-bins-test-'));
const bundled = path.join(tempDir, 'epiCurve.mjs');

const iso = (d) => new Date(d).toISOString().slice(0, 10);

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/epiCurve.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { processEpiCurveData, isBinSize } = await import(pathToFileURL(bundled).href);

  // The bundled demo outbreak's real shape: 44 cases spanning three days.
  const records = [
    ...Array.from({ length: 1 }, (_, i) => ({ id: `a${i}`, onset: '2026-01-10' })),
    ...Array.from({ length: 32 }, (_, i) => ({ id: `b${i}`, onset: '2026-01-11' })),
    ...Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, onset: '2026-01-12' })),
  ];

  // 1. Daily bins: one empty bin each side of the three data days.
  {
    const d = processEpiCurveData(records, 'onset', 'daily');
    const counts = d.bins.map(b => b.total);
    const labels = d.bins.map(b => iso(b.startDate));

    assert.equal(d.bins.length, 5,
      `expected 3 data bins plus one empty each side, got ${d.bins.length}: ${labels.join(', ')}`);
    assert.deepEqual(counts, [0, 1, 32, 11, 0], `bin counts were ${counts.join(', ')}`);
    assert.equal(labels[0], '2026-01-09', 'axis starts one day before the first case');
    assert.equal(labels[labels.length - 1], '2026-01-13', 'axis ends one day after the last case');
  }

  // 2. The regression itself: the empty run before and after must match.
  //    This is what failed previously (2 leading, 3 trailing).
  for (const binSize of ['daily', '12hour', 'weekly-cdc']) {
    const d = processEpiCurveData(records, 'onset', binSize);
    const counts = d.bins.map(b => b.total);
    const leading = counts.findIndex(c => c > 0);
    const trailing = [...counts].reverse().findIndex(c => c > 0);
    assert.equal(leading, trailing,
      `${binSize}: ${leading} empty bins before the data but ${trailing} after ` +
      `(counts: ${counts.join(', ')})`);
  }

  // 3. Every case is binned exactly once, at any bin size.
  for (const binSize of ['hourly', '6hour', '12hour', 'daily', 'weekly-cdc']) {
    const d = processEpiCurveData(records, 'onset', binSize);
    const total = d.bins.reduce((s, b) => s + b.total, 0);
    assert.equal(total, 44, `${binSize}: expected all 44 cases binned, got ${total}`);
  }

  // 4. maxCount reflects the tallest bin, which the y-axis scales from.
  {
    const d = processEpiCurveData(records, 'onset', 'daily');
    assert.equal(d.maxCount, 32, 'maxCount should be the tallest daily bin');
  }

  // 5. A single-case dataset still renders a curve rather than one lone bar.
  {
    const d = processEpiCurveData([{ id: 'x', onset: '2026-02-01' }], 'onset', 'daily');
    assert.equal(d.bins.length, 3, 'one case gives one data bin plus one empty each side');
    assert.deepEqual(d.bins.map(b => b.total), [0, 1, 0]);
  }

  // 6. Stratification partitions the cases rather than duplicating them.
  {
    const mixed = [
      { id: '1', onset: '2026-01-11', status: 'Confirmed' },
      { id: '2', onset: '2026-01-11', status: 'Probable' },
      { id: '3', onset: '2026-01-12', status: 'Confirmed' },
    ];
    const d = processEpiCurveData(mixed, 'onset', 'daily', 'status');
    assert.equal(d.bins.reduce((s, b) => s + b.total, 0), 3, 'no case counted twice');
    assert.deepEqual([...d.strataKeys].sort(), ['Confirmed', 'Probable']);
  }

  // 7. Records with a missing or unparseable date are excluded, not binned at
  //    the epoch. The demo dataset has 52 such rows ("Not a case").
  {
    const withBlanks = [...records, { id: 'z1', onset: '' }, { id: 'z2', onset: 'not a date' }];
    const d = processEpiCurveData(withBlanks, 'onset', 'daily');
    assert.equal(d.bins.reduce((s, b) => s + b.total, 0), 44,
      'blank and unparseable dates must not be counted');
    assert.equal(iso(d.bins[0].startDate), '2026-01-09',
      'and must not drag the axis back to 1970');
  }

  // 8. An unrecognised bin size must not hang. getNextBinStart had no default
  //    case, so it returned the date unchanged and the generation loop spun
  //    forever, exhausting memory. binSize is cast straight from localStorage,
  //    so a stale or hand-edited value could reach this.
  {
    assert.ok(isBinSize('daily') && isBinSize('weekly-iso'), 'known sizes are accepted');
    assert.ok(!isBinSize('day') && !isBinSize('') && !isBinSize(undefined),
      'unknown values are rejected');

    const d = processEpiCurveData(records, 'onset', 'nonsense-from-storage');
    assert.ok(d.bins.length > 0 && d.bins.length < 1000,
      `an unknown bin size must terminate, got ${d.bins.length} bins`);
  }

  console.log('epiCurve bin regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
