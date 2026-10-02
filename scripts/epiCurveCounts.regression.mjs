/**
 * Epidemic curves from aggregated data, monthly bars, and the bin size a curve
 * opens with.
 *
 * A surveillance extract has one row per district, month and disease, with a
 * column of cases. The curve counted rows: 15 "cases" in every month, under an
 * axis that said Number of Cases. And it had no bar wider than a week, so
 * monthly reports were one bar and three gaps.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-epicurve-counts-test-'));
const bundled = path.join(tempDir, 'epiCurve.mjs');
const demoBundled = path.join(tempDir, 'demoData.mjs');
const zone = process.env.TZ || 'system timezone';

try {
  await build({ entryPoints: [path.join(root, 'src/utils/epiCurve.ts')], bundle: true, format: 'esm', platform: 'node', outfile: bundled, logLevel: 'silent' });
  await build({ entryPoints: [path.join(root, 'src/data/demoData.ts')], bundle: true, format: 'esm', platform: 'node', outfile: demoBundled, logLevel: 'silent' });
  const { processEpiCurveData, suggestBinSize, chooseAxisLabels, isBinSize, binSizeNote, niceAxisMax } = await import(pathToFileURL(bundled).href);
  const { surveillanceDemoRecords, demoCaseRecords } = await import(pathToFileURL(demoBundled).href);

  const filled = d => d.bins.filter(b => b.total > 0);
  const sum = values => values.reduce((a, b) => a + b, 0);

  // 1. Monthly bars: one per calendar month, whatever its length, and a case
  //    on the last day of a month stays in that month.
  {
    const recs = ['2024-01-31', '2024-02-01', '2024-02-29', '2024-03-01', '2024-12-31', '2025-01-01']
      .map((onset, i) => ({ id: String(i), onset }));
    const d = processEpiCurveData(recs, 'onset', 'monthly');
    assert.ok(isBinSize('monthly'));
    assert.deepEqual(filled(d).map(b => [b.label, b.total]),
      [['Jan', 1], ['Feb', 2], ['Mar', 1], ['Dec', 1], ['Jan', 1]], `${zone}: monthly bars`);
    // One empty month either side, and every month between is drawn.
    assert.equal(d.bins.length, 15, `${zone}: Dec 2023 to Feb 2025 is fifteen bars`);
    assert.equal(d.bins[0].startDate.getDate(), 1);
    assert.equal(d.bins[2].endDate.getTime(), d.bins[3].startDate.getTime(), 'bars meet with no gap');
    for (const bin of d.bins) {
      for (const c of bin.cases) {
        assert.equal(c.onset.slice(0, 7),
          `${bin.startDate.getFullYear()}-${String(bin.startDate.getMonth() + 1).padStart(2, '0')}`,
          `${zone}: ${c.onset} must be in the bar for its own month`);
      }
    }
    assert.equal(d.summary.plotted, 6);
    assert.match(binSizeNote('monthly'), /calendar month/);
    // Labels spanning a year change carry the year where it changes.
    const labels = chooseAxisLabels(d.bins, 'monthly', 20).map(l => l.text);
    assert.equal(labels[0], 'Dec 2023');
    assert.ok(labels.includes('Jan 2024') && labels.includes('Jan 2025'), `${zone}: ${labels.join(', ')}`);
    assert.ok(labels.includes('Feb'), 'months within a year need no year');
    // With room for only a few labels they fall on quarters, counted from January.
    const few = chooseAxisLabels(d.bins, 'monthly', 6).map(l => l.text.split(' ')[0]);
    assert.ok(few.every(m => ['Jan', 'Apr', 'Jul', 'Oct'].includes(m)), `${zone}: ${few.join(', ')}`);
  }

  // 2. A custom range on monthly bars is drawn exactly.
  {
    const recs = [{ id: '1', onset: '2024-03-15' }];
    const d = processEpiCurveData(recs, 'onset', 'monthly', undefined, undefined, undefined,
      { range: { start: new Date(2024, 0, 1), end: new Date(2024, 11, 31, 23, 59, 59, 999) } });
    assert.equal(d.bins.length, 12, `${zone}: January to December is twelve bars`);
    assert.deepEqual(d.bins.map(b => b.label).slice(0, 3), ['Jan', 'Feb', 'Mar']);
  }

  // 3. A count column: bars add up the cases each row reports.
  {
    const recs = [
      { id: '1', month: '2025-01-01', district: 'A', cases: 10 },
      { id: '2', month: '2025-01-01', district: 'B', cases: 4 },
      { id: '3', month: '2025-02-01', district: 'A', cases: 0 },
      { id: '4', month: '2025-02-01', district: 'B', cases: 7 },
      { id: '5', month: '2025-03-01', district: 'A', cases: null },
      { id: '6', month: '2025-03-01', district: 'B', cases: 'n/a' },
      { id: '7', month: '2025-03-01', district: 'A', cases: 2.5 },
      { id: '8', month: '2025-03-01', district: 'B', cases: -3 },
      { id: '9', month: '', district: 'A', cases: 5 },
      { id: '10', month: '2025-04-01', district: 'B', cases: '6' },
    ];
    const d = processEpiCurveData(recs, 'month', 'monthly', 'district', undefined, undefined, { countColumn: 'cases' });
    assert.deepEqual(filled(d).map(b => [b.label, b.total]), [['Jan', 14], ['Feb', 7], ['Apr', 6]], `${zone}: weighted bars`);
    assert.equal(d.maxCount, 14, 'the axis is scaled to cases, not rows');
    assert.equal(d.summary.plotted, 27, 'the summary adds up cases');
    assert.equal(d.summary.plottedRecords, 5, 'and says how many records they came from');
    assert.equal(d.summary.missingCount, 4, 'blank, text, fractional and negative counts are not guessed at');
    assert.deepEqual(d.summary.missingCountExamples, ['n/a', '2.5', '-3']);
    assert.equal(d.summary.missingDate, 1);
    assert.equal(d.summary.plottedRecords + d.summary.missingCount + d.summary.missingDate, recs.length,
      'every record is plotted or accounted for');
    // Strata heights add up to the bar.
    const jan = filled(d)[0];
    assert.deepEqual([jan.strataTotals.get('A'), jan.strataTotals.get('B')], [10, 4]);
    for (const bin of d.bins) {
      assert.equal(sum([...bin.strataTotals.values()]), bin.total, 'strata add up to their bar');
    }
    // A report of zero cases is not the first or last onset.
    const zeros = processEpiCurveData(
      [{ id: '1', m: '2025-01-01', n: 0 }, { id: '2', m: '2025-02-01', n: 3 }, { id: '3', m: '2025-03-01', n: 0 }],
      'm', 'monthly', undefined, undefined, undefined, { countColumn: 'n' });
    assert.equal(zeros.summary.firstOnset.getMonth(), 1);
    assert.equal(zeros.summary.lastOnset.getMonth(), 1);
    assert.equal(zeros.summary.plottedRecords, 3);
  }

  // 4. Without a count column nothing changes: one record, one case.
  {
    const d = processEpiCurveData(demoCaseRecords, 'onset_date', 'daily', 'case_status');
    assert.equal(d.summary.plotted, d.summary.plottedRecords);
    assert.equal(d.summary.missingCount, 0);
    for (const bin of d.bins) {
      assert.equal(bin.total, bin.cases.length);
      for (const [key, group] of bin.strata) assert.equal(bin.strataTotals.get(key), group.length);
    }
  }

  // 5. The bundled surveillance sample, drawn the way the app now opens it.
  {
    const expected = new Map();
    for (const r of surveillanceDemoRecords) {
      const month = r.report_date.slice(0, 7);
      expected.set(month, (expected.get(month) ?? 0) + r.cases);
    }
    const d = processEpiCurveData(surveillanceDemoRecords, 'report_date', 'monthly', undefined, undefined, undefined, { countColumn: 'cases' });
    assert.equal(filled(d).length, expected.size, `${zone}: one bar per reported month`);
    for (const bin of filled(d)) {
      const month = `${bin.startDate.getFullYear()}-${String(bin.startDate.getMonth() + 1).padStart(2, '0')}`;
      assert.equal(bin.total, expected.get(month), `${zone}: ${month} adds up to the cases reported that month`);
    }
    assert.equal(d.summary.plotted, sum(surveillanceDemoRecords.map(r => r.cases)));
    assert.equal(d.summary.plottedRecords, surveillanceDemoRecords.length);
  }

  // 6. The bin size a curve opens with.
  {
    const s = (spanDays, cases, hasTimes = false, minGapDays = 1) => suggestBinSize({ spanDays, cases, hasTimes, minGapDays });
    // The outbreak sample: 44 cases over 34 hours, with onset times.
    assert.equal(s(34 / 24, 44, true, 0), '6hour', 'a two-day point-source outbreak opens in 6-hour bars, not 35 hourly ones');
    // The same outbreak with dates only cannot be drawn finer than days.
    assert.equal(s(2, 44, false, 1), 'daily');
    assert.equal(s(5, 33, false, 1), 'daily', 'a dates-only week is daily');
    assert.equal(s(4 / 24, 200, true, 0), 'hourly', 'a four-hour cluster of 200 with times is hourly');
    assert.equal(s(21, 60, false, 1), 'daily', 'three weeks of 60 cases stays daily');
    assert.equal(s(40, 400, false, 1), 'daily', 'six weeks of 400 cases stays daily');
    assert.equal(s(120, 300, false, 1), 'weekly-cdc', 'four months is weekly');
    assert.equal(s(365, 5000, false, 1), 'weekly-cdc', 'a year of daily-dated cases is weekly');
    assert.equal(s(365, 5000, false, 7), 'weekly-cdc', 'a year of weekly reports stays weekly');
    assert.equal(s(4 * 365, 30000, false, 30), 'monthly', 'four years of monthly reports is monthly');
    assert.equal(s(334, 2000, false, 28), 'monthly', 'one year of monthly reports is monthly, not weekly bars with gaps');
    assert.equal(s(10 * 365, 100000, false, 1), 'monthly', 'a span no size can fit falls back to the coarsest');
    assert.equal(s(0, 1, false, null), 'daily', 'a single dated case is daily');
    assert.equal(s(0, 0, false, null), 'daily');
  }

  // 7. The count axis. Small curves keep whole-case steps exactly as before;
  //    large ones get steps a reader can count in.
  {
    for (const [atLeast, expected] of [
      [1, 5], [2, 5], [5, 5], [6, 10], [13, 15], [21, 25], [33, 35], [50, 50],
      // Above fifty the steps are 15, 20, 25, 30, 40, 50, 60, 80, 100, 150...
      [51, 75], [76, 100], [101, 125], [126, 150], [151, 200], [201, 250], [251, 300], [301, 400], [401, 500], [501, 750],
      [917, 1000], [1001, 1250], [2400, 2500], [12001, 12500], [40001, 50000],
    ]) {
      assert.equal(niceAxisMax(atLeast), expected, `axis for ${atLeast}`);
    }
    for (let n = 1; n < 5000; n += 7) {
      const top = niceAxisMax(n);
      assert.ok(top >= n, `the axis must reach ${n}`);
      assert.ok(Number.isInteger(top / 5), `five whole steps to ${top}`);
      assert.ok(top <= Math.max(10, n * 2.6), `the axis for ${n} must not be mostly empty (${top})`);
    }
  }

  console.log(`epiCurve counts regression: all checks passed (${zone})`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
