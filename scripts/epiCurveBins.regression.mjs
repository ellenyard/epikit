/**
 * Epi-curve binning and axis extent.
 *
 * The axis previously ran further past the outbreak than before it: getBinEnd
 * returns the exclusive bound one bin beyond the data, padding was added on top
 * of that, and the bin loop is inclusive. A three-day outbreak came out with
 * two leading and three trailing empty bins, so short outbreaks looked like
 * they trailed off into blank space.
 *
 * Run under several timezones (see package.json). Every expected value here is
 * written out by hand or taken from the text of the input, never computed with
 * a Date, so the same assertions hold in every zone: which bar a case lands in
 * must not depend on where the browser is.
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
const zone = process.env.TZ || 'system timezone';

// The local calendar date of a Date. This was toISOString().slice(0, 10), which
// is the UTC date: east of Greenwich local midnight is the previous UTC day, so
// the test itself failed in every UTC+ zone.
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-04-24" -> "Apr 24", from the text alone. */
const dayLabel = (text) => `${MONTHS[Number(text.slice(5, 7)) - 1]} ${Number(text.slice(8, 10))}`;

const withCases = (d) => d.bins.filter(b => b.total > 0);
const sum = (d) => d.bins.reduce((s, b) => s + b.total, 0);

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/epiCurve.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { processEpiCurveData, isBinSize, chooseAxisLabels, MAX_EPI_CURVE_BINS } =
    await import(pathToFileURL(bundled).href);

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
  for (const binSize of ['hourly', '6hour', '12hour', 'daily', 'weekly-cdc', 'weekly-iso']) {
    const d = processEpiCurveData(records, 'onset', binSize);
    assert.equal(sum(d), 44, `${binSize}: expected all 44 cases binned, got ${sum(d)}`);
    assert.equal(d.summary.plotted, 44, `${binSize}: the summary must agree with the bars`);
  }

  // 4. maxCount reflects the tallest bin, which the y-axis scales from.
  {
    const d = processEpiCurveData(records, 'onset', 'daily');
    assert.equal(d.maxCount, 32, 'maxCount should be the tallest daily bin');
    assert.equal(d.bins[d.peakBinIndex].label, 'Jan 11', 'and the peak is the bar that holds it');
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
    assert.equal(sum(d), 3, 'no case counted twice');
    assert.deepEqual([...d.strataKeys].sort(), ['Confirmed', 'Probable']);
  }

  // 7. Records with a missing or unparseable date are excluded, not binned at
  //    the epoch. The demo dataset has 52 such rows ("Not a case"). They are
  //    also counted, by reason, so the chart can say what it left out.
  {
    const withBlanks = [...records, { id: 'z1', onset: '' }, { id: 'z2', onset: 'not a date' },
      { id: 'z3', onset: null }, { id: 'z4', onset: '   ' }];
    const d = processEpiCurveData(withBlanks, 'onset', 'daily');
    assert.equal(sum(d), 44, 'blank and unparseable dates must not be counted');
    assert.equal(iso(d.bins[0].startDate), '2026-01-09',
      'and must not drag the axis back to 1970');
    assert.equal(d.summary.missingDate, 3, 'empty, null and whitespace-only are all "no date"');
    assert.equal(d.summary.unrecognisedDate, 1);
    assert.deepEqual(d.summary.unrecognisedDateExamples, ['not a date']);
    assert.equal(d.summary.plotted + d.summary.missingDate + d.summary.unrecognisedDate, withBlanks.length,
      'every record is either plotted or accounted for');
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

  // 9. Timezones whose clocks change at midnight. The changeover day has no
  //    00:00 there, so its bin used to start at 01:00, and so did every bin
  //    after it; a case dated the following day (read as 00:00) then fell in
  //    the bar before. In Cairo, one case a day over 22-26 April 2026 came out
  //    as Apr 24 = 2 and Apr 25 = the case from the 26th. Each of these runs
  //    crosses the changeover of one of the zones this script is run under.
  const changeovers = {
    'Africa/Cairo 2026': ['2026-04-22', '2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26'],
    'America/Santiago 2026': ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08'],
    'America/Havana 2026': ['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'],
    'Asia/Beirut 2026': ['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'],
    'America/Sao_Paulo 2018': ['2018-11-02', '2018-11-03', '2018-11-04', '2018-11-05', '2018-11-06'],
    'America/New_York 2026': ['2026-03-07', '2026-03-08', '2026-03-09', '2026-10-31', '2026-11-01', '2026-11-02'],
    'Pacific/Auckland 2026': ['2026-04-04', '2026-04-05', '2026-04-06', '2026-09-26', '2026-09-27', '2026-09-28'],
  };
  for (const [name, days] of Object.entries(changeovers)) {
    const d = processEpiCurveData(days.map((onset, i) => ({ id: String(i), onset })), 'onset', 'daily');
    const filled = withCases(d);
    assert.equal(filled.length, days.length,
      `${zone}, ${name}: ${days.length} cases on ${days.length} days must fill ${days.length} bars, ` +
      `got ${filled.map(b => `${b.label}=${b.total}`).join(', ')}`);
    filled.forEach((bin, i) => {
      assert.equal(bin.label, dayLabel(days[i]), `${zone}, ${name}: bar ${i} is labelled for its own day`);
      assert.equal(bin.cases[0].onset, days[i],
        `${zone}, ${name}: the bar labelled ${bin.label} must hold the case dated ${days[i]}, not ${bin.cases[0].onset}`);
      assert.equal(iso(bin.startDate), days[i],
        `${zone}, ${name}: and its start, which annotations are placed against, is on that day`);
    });
    d.bins.forEach((bin, i) => {
      if (i > 0) {
        assert.equal(bin.startDate.getTime(), d.bins[i - 1].endDate.getTime(),
          `${zone}, ${name}: bars must meet with no gap or overlap`);
      }
    });
  }

  // 10. The same for weekly bins, where the changeover falls on the day a week
  //     starts. 8 March, 29 March and 6 September 2026 are Sundays; the week
  //     before each began on a Sunday too, and the Monday before on the dates
  //     given. A Sunday case used to be drawn in the previous CDC week.
  {
    const sundays = [
      { onset: '2026-03-08', cdc: 'Mar 8', iso: 'Mar 2' },   // Havana
      { onset: '2026-03-29', cdc: 'Mar 29', iso: 'Mar 23' }, // Beirut
      { onset: '2026-09-06', cdc: 'Sep 6', iso: 'Aug 31' },  // Santiago
    ];
    for (const s of sundays) {
      // A Saturday a week earlier and a Monday after, so the chain of weekly
      // bins has to cross the changeover to reach the last case.
      const sat = `${s.onset.slice(0, 8)}${pad(Number(s.onset.slice(8)) - 1)}`;
      const recs = [{ id: 'a', onset: sat }, { id: 'b', onset: s.onset }];
      const cdc = processEpiCurveData(recs, 'onset', 'weekly-cdc');
      const sundayBin = cdc.bins.find(b => b.cases.some(c => c.id === 'b'));
      assert.equal(sundayBin.label, s.cdc,
        `${zone}: a case on Sunday ${s.onset} belongs to the CDC week starting that day, not "${sundayBin.label}"`);
      assert.equal(sundayBin.total, 1, `${zone}: and the Saturday before it belongs to the week before`);
      const isoWeeks = processEpiCurveData(recs, 'onset', 'weekly-iso');
      const both = withCases(isoWeeks);
      assert.equal(both.length, 1, `${zone}: Saturday and Sunday share an ISO week`);
      assert.equal(both[0].label, s.iso, `${zone}: which starts on the Monday before`);
    }
  }

  // 11. Weeks across a year boundary. 28 December 2025 is a Sunday and
  //     29 December a Monday.
  {
    const days = ['2025-12-27', '2025-12-28', '2025-12-29', '2026-01-03', '2026-01-04', '2026-01-05'];
    const recs = days.map((onset, i) => ({ id: String(i), onset }));
    const cdc = withCases(processEpiCurveData(recs, 'onset', 'weekly-cdc'));
    assert.deepEqual(cdc.map(b => [b.label, b.total]), [['Dec 21', 1], ['Dec 28', 3], ['Jan 4', 2]],
      `${zone}: CDC weeks run Sunday to Saturday`);
    const isoWeeks = withCases(processEpiCurveData(recs, 'onset', 'weekly-iso'));
    assert.deepEqual(isoWeeks.map(b => [b.label, b.total]), [['Dec 22', 2], ['Dec 29', 3], ['Jan 5', 1]],
      `${zone}: ISO weeks run Monday to Sunday`);
  }

  // 12. Hours. A time column places the case in its hour, in every spelling a
  //     line list uses. Only "14:30" and "2:30 PM" were read before; the rest
  //     went to the midnight bar without a word.
  {
    const spellings = ['14:30', '2:30 PM', '14:30:00', '2:30:00 pm', '1430', '2 PM', '2pm', '14h30', '14:30:00.000'];
    for (const time of spellings) {
      const d = processEpiCurveData([{ id: '1', onset: '2026-01-11', time }], 'onset', 'hourly', undefined, undefined, 'time');
      const filled = withCases(d);
      assert.equal(filled.length, 1, `${zone}: "${time}" must be plotted`);
      assert.equal(filled[0].label, 'Jan 11 14:00', `${zone}: "${time}" belongs in the 14:00 bar, not "${filled[0].label}"`);
    }
    const twelveHour = processEpiCurveData(
      [{ id: '1', onset: '2026-01-11', time: '11:59' }, { id: '2', onset: '2026-01-11', time: '12:00' }],
      'onset', '12hour', undefined, undefined, 'time');
    assert.deepEqual(withCases(twelveHour).map(b => [b.label, b.total]), [['Jan 11 0:00', 1], ['Jan 11 12:00', 1]],
      `${zone}: noon starts the second 12-hour bar`);
  }

  // 13. A case with a date but no usable time has no hourly bar to go in. It
  //     used to be stacked at 00:00, drawing a midnight peak that was not
  //     there. It is left out of hourly bins and counted; daily bins, which
  //     need no time, still plot it.
  {
    const recs = [
      { id: '1', onset: '2026-01-11', time: '14:30' },
      { id: '2', onset: '2026-01-11', time: '' },
      { id: '3', onset: '2026-01-11', time: null },
      { id: '4', onset: '2026-01-11', time: 'evening' },
      { id: '5', onset: '2026-01-11', time: '0.6041666667' },
      { id: '6', onset: '2026-01-11', time: '24:00' },
    ];
    const hourly = processEpiCurveData(recs, 'onset', 'hourly', undefined, undefined, 'time');
    assert.deepEqual(withCases(hourly).map(b => [b.label, b.total]), [['Jan 11 14:00', 1]],
      `${zone}: only the case with a readable time is drawn on hourly bins`);
    assert.equal(hourly.summary.missingTime, 2);
    assert.equal(hourly.summary.unrecognisedTime, 3);
    assert.deepEqual(hourly.summary.unrecognisedTimeExamples, ['evening', '0.6041666667', '24:00']);
    assert.equal(hourly.summary.plotted + hourly.summary.missingTime + hourly.summary.unrecognisedTime, recs.length);

    const daily = processEpiCurveData(recs, 'onset', 'daily', undefined, undefined, 'time');
    assert.equal(daily.summary.plotted, 6, 'daily bins do not need a time');
    assert.equal(daily.summary.missingTime + daily.summary.unrecognisedTime, 0);

    // With no time column chosen, every case sits at 00:00 by the user's own choice.
    const noColumn = processEpiCurveData(recs, 'onset', 'hourly');
    assert.deepEqual(withCases(noColumn).map(b => [b.label, b.total]), [['Jan 11 0:00', 6]]);
  }

  // 14. First and last onset, for the summary line.
  {
    const recs = [
      { id: '1', onset: '2026-01-10', time: '22:00' },
      { id: '2', onset: '2026-01-12', time: '03:15' },
      { id: '3', onset: '2026-01-11', time: '09:00' },
    ];
    const hourly = processEpiCurveData(recs, 'onset', 'hourly', undefined, undefined, 'time');
    const first = hourly.summary.firstOnset;
    const last = hourly.summary.lastOnset;
    assert.equal(`${iso(first)} ${first.getHours()}:${pad(first.getMinutes())}`, '2026-01-10 22:00', `${zone}: first onset`);
    assert.equal(`${iso(last)} ${last.getHours()}:${pad(last.getMinutes())}`, '2026-01-12 3:15', `${zone}: last onset`);
    assert.equal(hourly.summary.onsetHasTime, true);
    const daily = processEpiCurveData(recs, 'onset', 'daily');
    assert.equal(iso(daily.summary.firstOnset), '2026-01-10');
    assert.equal(iso(daily.summary.lastOnset), '2026-01-12');
    assert.equal(daily.summary.onsetHasTime, false);
  }

  // 15. One mistyped year must not freeze the tab. 300 cases in March 2026 and
  //     one dated 2016 asked for 88,024 hourly bars, each of which re-read
  //     every record: 41 seconds frozen in the browser. The request is now
  //     coarsened until it fits, the odd date is named, and binning is one
  //     pass over the records.
  {
    const march = Array.from({ length: 300 }, (_, i) => ({ id: String(i), onset: `2026-03-${pad(1 + (i % 21))}` }));
    const withTypo = [...march, { id: 'typo', onset: '2016-03-05' }];

    const started = Date.now();
    const d = processEpiCurveData(withTypo, 'onset', 'hourly');
    const elapsed = Date.now() - started;

    assert.ok(d.bins.length <= MAX_EPI_CURVE_BINS, `${d.bins.length} bars is over the limit`);
    assert.equal(d.requestedBinSize, 'hourly');
    assert.equal(d.binSize, 'weekly-cdc', 'ten years fits in weekly bars and nothing finer');
    assert.ok(d.requestedBinCount > 80000, 'and the chart can say how many bars were asked for');
    assert.equal(sum(d), 301, 'coarsening loses no case');
    assert.equal(d.summary.outlierCount, 1);
    assert.deepEqual(d.summary.outlierExamples, ['2016-03-05'], 'the mistyped date is named');
    assert.ok(elapsed < 2000, `binning took ${elapsed}ms`);

    // Without the typo nothing is coarsened and nothing is flagged.
    const clean = processEpiCurveData(march, 'onset', 'hourly');
    assert.equal(clean.binSize, 'hourly');
    assert.equal(clean.requestedBinCount, 0);
    assert.equal(clean.summary.outlierCount, 0);

    // A span no bin size can draw is refused rather than attempted.
    const refused = processEpiCurveData([...march, { id: 'typo', onset: '1026-03-05' }], 'onset', 'daily');
    assert.equal(refused.tooManyBins, true);
    assert.equal(refused.bins.length, 0);
    assert.deepEqual(refused.summary.outlierExamples, ['1026-03-05']);

    // A surveillance series that really runs for years is not full of "outliers".
    const years = Array.from({ length: 156 }, (_, i) => {
      const y = 2023 + Math.floor(i / 52);
      const dayOfYear = (i % 52) * 7;
      const month = Math.min(11, Math.floor(dayOfYear / 31));
      return { id: String(i), onset: `${y}-${pad(month + 1)}-${pad(1 + (dayOfYear % 28))}` };
    });
    assert.equal(processEpiCurveData(years, 'onset', 'weekly-cdc').summary.outlierCount, 0);
  }

  // 16. A custom date range is drawn exactly as given. It used to be applied by
  //     discarding bins afterwards, so it could narrow the axis but not widen it.
  {
    const days = { '2026-03-10': 2, '2026-03-11': 9, '2026-03-12': 14, '2026-03-13': 6, '2026-03-14': 2 };
    const recs = Object.entries(days).flatMap(([onset, n]) =>
      Array.from({ length: n }, (_, i) => ({ id: `${onset}-${i}`, onset })));
    const range = (from, to) => ({ range: { start: new Date(2026, 2, from), end: new Date(2026, 2, to, 23, 59, 59, 999) } });

    const wide = processEpiCurveData(recs, 'onset', 'daily', undefined, undefined, undefined, range(1, 31));
    assert.equal(wide.bins.length, 31, `${zone}: 1-31 March is 31 daily bars, got ${wide.bins.length}`);
    assert.equal(wide.bins[0].label, 'Mar 1');
    assert.equal(wide.bins[30].label, 'Mar 31');
    assert.equal(sum(wide), 33);

    const narrow = processEpiCurveData(recs, 'onset', 'daily', undefined, undefined, undefined, range(11, 12));
    assert.deepEqual(narrow.bins.map(b => [b.label, b.total]), [['Mar 11', 9], ['Mar 12', 14]]);
    assert.equal(narrow.summary.plotted, 23);
    assert.equal(narrow.summary.outsideRange, 10, 'the 10 cases outside the range are counted, not lost');
    assert.equal(narrow.maxCount, 14);
  }

  // 17. Axis labels when there are too many bars to label each. Every Nth bar
  //     from the first was labelled before: on the hourly axis of a dates-only
  //     outbreak that was 23:00, 3:00, 7:00..., and no bar holding a case got a
  //     label, since those are all at 0:00.
  {
    const recs = ['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14']
      .map((onset, i) => ({ id: String(i), onset }));
    const d = processEpiCurveData(recs, 'onset', 'hourly');
    assert.equal(d.bins[0].label, 'Mar 9 23:00');
    const labels = chooseAxisLabels(d.bins, d.binSize, 30);
    assert.ok(labels.length <= 30 && labels.length >= 10, `${labels.length} labels`);
    const labelled = new Set(labels.map(l => l.index));
    d.bins.forEach((bin, i) => {
      if (bin.total > 0) assert.ok(labelled.has(i), `${zone}: the bar holding cases at ${bin.label} must be labelled`);
    });
    assert.ok(labels.every(l => /:00$/.test(l.text)));
    assert.equal(labels[0].text, 'Mar 10 0:00', 'labels fall on round hours counted from midnight');

    // Few enough bars: every one is labelled, as before.
    const short = processEpiCurveData(recs, 'onset', 'daily');
    assert.deepEqual(chooseAxisLabels(short.bins, 'daily', short.bins.length).map(l => l.text),
      ['Mar 9', 'Mar 10', 'Mar 11', 'Mar 12', 'Mar 13', 'Mar 14', 'Mar 15']);

    // Across a year boundary the year is shown where it changes, and only there.
    const turn = processEpiCurveData(
      [{ id: '1', onset: '2025-12-29' }, { id: '2', onset: '2026-01-02' }], 'onset', 'daily');
    assert.deepEqual(chooseAxisLabels(turn.bins, 'daily', 99).map(l => l.text),
      ['Dec 28, 2025', 'Dec 29', 'Dec 30', 'Dec 31', 'Jan 1, 2026', 'Jan 2', 'Jan 3']);
  }

  // 18. Legend and stack order: numbers inside names sort as numbers, and the
  //     missing category goes last rather than into the middle of the alphabet.
  {
    const keys = ['D10', 'D2', '', 'Zone A', 'D1', 'confirmed'];
    const recs = keys.map((district, i) => ({ id: String(i), onset: '2026-01-11', district }));
    const d = processEpiCurveData(recs, 'onset', 'daily', 'district');
    assert.deepEqual(d.strataKeys, ['confirmed', 'D1', 'D2', 'D10', 'Zone A', 'Unknown']);

    const ages = ['10-14', '5-9', '<5', '15+'].map((age, i) => ({ id: String(i), onset: '2026-01-11', age }));
    assert.deepEqual(processEpiCurveData(ages, 'onset', 'daily', 'age').strataKeys, ['<5', '5-9', '10-14', '15+']);
  }

  console.log(`epiCurve bin regression: all checks passed (${zone})`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
