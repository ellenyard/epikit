/**
 * How the epi curve reads dates and times, saves annotation dates, places
 * things along the axis and estimates the exposure period.
 *
 * Each of these had a fault that changed with where the browser was, or with
 * how a date happened to be spelled:
 *
 *  - Dates were handed to `new Date(text)`, which reads anything that is not
 *    ISO by US rules. "05/01/2026 10:00" in a day-first line list was drawn on
 *    May 1 and "13/01/2026 08:00" was dropped, both silently.
 *  - Annotation dates were saved as UTC instants, so a project file opened
 *    west of where it was saved drew every annotation a day early.
 *  - A dated annotation was drawn at the centre of whichever bar held midnight,
 *    and a period started in the middle of its first bar.
 *  - The exposure estimate ignored onset times and worked in whole days.
 *
 * Run under several timezones (see package.json). Expected values are written
 * out by hand, so the same assertions must hold in every one of them.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-epidates-test-'));
const bundled = path.join(tempDir, 'epiCurve.mjs');
const zone = process.env.TZ || 'system timezone';

const pad = (n) => String(n).padStart(2, '0');
/** A Date's local clock reading, which is what the chart shows. */
const clock = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 0.05, `${zone}: ${what}: expected ${expected}, got ${actual}`);

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/epiCurve.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    parseWallClock, parseLocalDate, parseTimeString, processEpiCurveData,
    serializeAnnotation, reviveAnnotation, annotationSpan, spanInBins, positionInBins,
    estimateExposureWindow, formatIncubationRange, incubationHours, getColorForStrata,
    PATHOGEN_INCUBATION,
  } = await import(pathToFileURL(bundled).href);

  // 1. Dates that can be read only one way are read, as the clock values written.
  {
    const readable = {
      '2026-01-15': '2026-01-15 00:00',
      '2026-1-5': '2026-01-05 00:00',
      '2026/01/15': '2026-01-15 00:00',
      '2026-01-15 14:30': '2026-01-15 14:30',
      '2026-01-15T14:30:00': '2026-01-15 14:30',
      '2026-01-15 2:30 PM': '2026-01-15 14:30',
      '15 Jan 2026': '2026-01-15 00:00',
      '15-Jan-2026': '2026-01-15 00:00',
      '15 January 2026 08:05': '2026-01-15 08:05',
      'Jan 15, 2026': '2026-01-15 00:00',
      'January 5 2026': '2026-01-05 00:00',
      '2024-02-29': '2024-02-29 00:00',
      // A timezone suffix is dropped and the clock time kept: a 14:30 onset is
      // drawn at 14:30 wherever the chart is opened. These were shifted into
      // the browser's zone before, moving a midnight UTC value to the previous
      // day anywhere west of Greenwich.
      '2026-01-11T00:00:00.000Z': '2026-01-11 00:00',
      '2026-01-11T23:30:00Z': '2026-01-11 23:30',
      '2026-01-11T02:00:00+05:30': '2026-01-11 02:00',
      '2026-01-11T14:30:00.000-0500': '2026-01-11 14:30',
    };
    for (const [text, expected] of Object.entries(readable)) {
      const d = parseLocalDate(text);
      assert.equal(clock(d), expected, `${zone}: "${text}" should read as ${expected}`);
    }
    assert.equal(parseWallClock('2026-01-15').hasTime, false);
    assert.equal(parseWallClock('2026-01-15 00:00').hasTime, true, 'a written midnight is a time');
  }

  // 2. Everything else is refused, never guessed at. The first five are what
  //    `new Date()` got wrong: the first two it drew on May 1 and Jan 5 of the
  //    wrong month order, the third it dropped, the fourth it drew in the year
  //    46033 and the fifth in 2034.
  {
    const unreadable = [
      '05/01/2026 10:00', '05/01/2026', '13/01/2026 08:00', '46033', '34',
      '13-01-2026', '01-13-2026', '1/5/26', '20260115', '2026-13-01', '2026-02-30',
      '2025-02-29', '31 Apr 2026', '15 Foo 2026', '2026-01-15 25:00', '2026-01-15 morning',
      'not a date', '', '   ',
    ];
    for (const text of unreadable) {
      assert.equal(parseWallClock(text), null, `${zone}: "${text}" must not be read as a date`);
      assert.ok(isNaN(parseLocalDate(text).getTime()), `${zone}: "${text}" must give an invalid Date`);
    }
    assert.equal(parseWallClock(46033), null, 'a number is not a date');
    assert.equal(parseWallClock(null), null);
  }

  // 3. End to end: a day-first column with times is counted as unreadable and
  //    shown to the user, instead of 3 of 8 cases vanishing and the other 5
  //    being drawn in March, April and May.
  {
    const values = ['04/01/2026 18:00', '05/01/2026 08:00', '05/01/2026 10:00', '05/01/2026 14:00',
      '06/01/2026 09:00', '13/01/2026 08:00', '14/01/2026 09:30', '15/01/2026 12:00'];
    const d = processEpiCurveData(values.map((onset, i) => ({ id: String(i), onset })), 'onset', 'daily');
    assert.equal(d.summary.plotted, 0, `${zone}: none of these may be plotted on a guess`);
    assert.equal(d.bins.length, 0);
    assert.equal(d.summary.unrecognisedDate, 8);
    assert.equal(d.summary.unrecognisedDateExamples[0], '04/01/2026 18:00');

    // The same dates once the importer has converted them.
    const fixed = ['2026-01-04 18:00', '2026-01-05 08:00', '2026-01-13 08:00'];
    const good = processEpiCurveData(fixed.map((onset, i) => ({ id: String(i), onset })), 'onset', 'daily');
    assert.deepEqual(good.bins.filter(b => b.total).map(b => b.label), ['Jan 4', 'Jan 5', 'Jan 13']);
  }

  // 4. Times of day.
  {
    const times = {
      '14:30': [14, 30], '9:05': [9, 5], '00:00': [0, 0], '23:59': [23, 59],
      '14:30:00': [14, 30], '14:30:59.250': [14, 30],
      '2:30 PM': [14, 30], '2:30PM': [14, 30], '2:30:15 pm': [14, 30], '12:00 AM': [0, 0], '12:15 PM': [12, 15],
      '2 PM': [14, 0], '2pm': [14, 0], '11 a.m.': [11, 0],
      '1430': [14, 30], '0905': [9, 5], '14h30': [14, 30], '9h': [9, 0], ' 14:30 ': [14, 30],
    };
    for (const [text, [hours, minutes]] of Object.entries(times)) {
      assert.deepEqual(parseTimeString(text), { hours, minutes }, `"${text}"`);
    }
    // A decimal could be a clock time or a fraction of a day, so it is refused.
    for (const text of ['24:00', '14:60', '13 PM', '0 AM', '0.6041666667', '14.30', '930', '2460', 'noon', '']) {
      assert.equal(parseTimeString(text), null, `"${text}" is not a time this can place`);
    }
  }

  // 5. Annotation dates are saved as the date typed, and mean the same day in
  //    every timezone.
  {
    const dated = { id: 'a', type: 'exposure', category: 'exposure', label: 'Picnic', color: '#000', source: 'manual',
      date: new Date(2026, 0, 10) };
    assert.equal(serializeAnnotation(dated).date, '2026-01-10', `${zone}: a date is saved as a date`);

    const timed = { ...dated, date: new Date(2026, 0, 10, 12, 0), hasTime: true,
      endDate: new Date(2026, 0, 10, 14, 0), endHasTime: true };
    assert.deepEqual(
      [serializeAnnotation(timed).date, serializeAnnotation(timed).endDate],
      ['2026-01-10T12:00', '2026-01-10T14:00']);

    const period = { ...dated, endDate: new Date(2026, 0, 12, 23, 59, 59, 999) };
    assert.equal(serializeAnnotation(period).endDate, '2026-01-12', 'a whole-day end is saved as its date');

    // Round trip through JSON, as localStorage and project files do.
    for (const original of [dated, timed, period]) {
      const back = reviveAnnotation(JSON.parse(JSON.stringify(serializeAnnotation(original))));
      assert.equal(back.date.getTime(), original.date.getTime(), `${zone}: start survives a round trip`);
      assert.equal(back.endDate?.getTime(), original.endDate?.getTime(), `${zone}: end survives a round trip`);
      assert.equal(Boolean(back.hasTime), Boolean(original.hasTime));
      assert.equal(back.label, 'Picnic');
    }
    assert.equal(reviveAnnotation({ ...dated, date: 'garbage' }), null, 'an unreadable date drops the annotation, not the page');
  }

  // 6. State saved by earlier versions still loads. Those dates are UTC
  //    instants of local midnight where they were saved: 10 January in Nairobi
  //    (UTC+3) is 21:00 UTC on the 9th, and used to be drawn on the 9th when
  //    the file was opened in London or New York.
  {
    const legacy = (date, endDate) => reviveAnnotation({ id: 'x', type: 'exposure', category: 'exposure',
      label: 'L', color: '#000', source: 'manual', date, ...(endDate ? { endDate } : {}) });

    const savedAt = {
      'Nairobi (UTC+3)': ['2026-01-09T21:00:00.000Z', '2026-01-11T20:59:59.999Z'],
      'New York (UTC-5)': ['2026-01-10T05:00:00.000Z', '2026-01-12T04:59:59.999Z'],
      'Kolkata (UTC+5:30)': ['2026-01-09T18:30:00.000Z', '2026-01-11T18:29:59.999Z'],
      'London (UTC)': ['2026-01-10T00:00:00.000Z', '2026-01-11T23:59:59.999Z'],
      'Honolulu (UTC-10)': ['2026-01-10T10:00:00.000Z', '2026-01-12T09:59:59.999Z'],
    };
    for (const [where, [start, end]] of Object.entries(savedAt)) {
      const a = legacy(start, end);
      assert.equal(clock(a.date), '2026-01-10 00:00', `${zone}: 10 January saved in ${where} is still 10 January`);
      assert.equal(clock(a.endDate), '2026-01-11 23:59', `${zone}: and its end is still the end of 11 January`);
      assert.equal(a.hasTime, false);
      assert.equal(serializeAnnotation(a).date, '2026-01-10', 'and it is re-saved in the new form');
      assert.equal(serializeAnnotation(a).endDate, '2026-01-11');
    }
  }

  // 7. Where annotations are drawn, in bar widths from the left of the axis.
  {
    const days = ['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14'];
    const daily = processEpiCurveData(days.map((onset, i) => ({ id: String(i), onset })), 'onset', 'daily');
    assert.deepEqual(daily.bins.map(b => b.label), ['Mar 9', 'Mar 10', 'Mar 11', 'Mar 12', 'Mar 13', 'Mar 14', 'Mar 15']);
    const base = { id: 'a', type: 'exposure', category: 'exposure', label: 'x', color: '#000', source: 'manual' };

    // A date with no time sits at the middle of its day's bar.
    near(annotationSpan({ ...base, date: new Date(2026, 2, 12) }, daily.bins).start, 3.5, 'a date on daily bars');

    // A period starts at the edge of its first day and ends at the end of its
    // last. It used to start half-way through the first bar.
    const period = annotationSpan({ ...base, date: new Date(2026, 2, 10), endDate: new Date(2026, 2, 11, 23, 59, 59, 999) }, daily.bins);
    near(period.start, 1, 'a period starts at the left edge of its first day');
    near(period.end, 3, 'and ends at the right edge of its last');
    assert.equal(period.clippedStart || period.clippedEnd, false);

    // Off the axis: not drawn. It used to be drawn on the nearest edge, where
    // an event on 20 March read as having happened on the 15th.
    assert.equal(annotationSpan({ ...base, date: new Date(2026, 2, 20) }, daily.bins), null);
    assert.equal(annotationSpan({ ...base, date: new Date(2026, 2, 1) }, daily.bins), null);
    assert.equal(positionInBins(daily.bins, new Date(2026, 2, 20).getTime()), null);

    // A period running past the axis is drawn up to the edge and says so.
    const running = annotationSpan({ ...base, date: new Date(2026, 2, 14), endDate: new Date(2026, 2, 25, 23, 59, 59, 999) }, daily.bins);
    near(running.start, 5, 'start of a period that overruns');
    near(running.end, 7, 'clipped to the last bar');
    assert.equal(running.clippedEnd, true);
    assert.equal(running.clippedStart, false);
    assert.equal(spanInBins(daily.bins, new Date(2026, 2, 20).getTime(), new Date(2026, 2, 22).getTime()), null);

    // On 12-hour bars a timed annotation sits at its time. The sample
    // outbreak's "Exposure: 12-2 PM" was a bare date, drawn at the centre of
    // the 0:00-12:00 bar, which is 6 AM.
    const timedRecords = [{ id: '1', onset: '2026-01-10', time: '22:00' }, { id: '2', onset: '2026-01-12', time: '11:00' }];
    const twelve = processEpiCurveData(timedRecords, 'onset', '12hour', undefined, undefined, 'time');
    assert.deepEqual(twelve.bins.slice(0, 3).map(b => b.label), ['Jan 10 0:00', 'Jan 10 12:00', 'Jan 11 0:00']);
    const picnic = annotationSpan({ ...base, date: new Date(2026, 0, 10, 12, 0), hasTime: true,
      endDate: new Date(2026, 0, 10, 14, 0), endHasTime: true }, twelve.bins);
    near(picnic.start, 1, 'noon is the boundary between the first two 12-hour bars');
    near(picnic.end, 1 + 2 / 12, 'and 2 PM is a sixth of a bar further on');
    // With no time given, the middle of the day, which on these bars is noon.
    near(annotationSpan({ ...base, date: new Date(2026, 0, 11) }, twelve.bins).start, 3, 'a bare date on 12-hour bars');

    // On weekly bars a dated event sits within its week, by its day.
    const weekly = processEpiCurveData(days.map((onset, i) => ({ id: String(i), onset })), 'onset', 'weekly-iso');
    assert.equal(weekly.bins[1].label, 'Mar 9');
    near(annotationSpan({ ...base, date: new Date(2026, 2, 9) }, weekly.bins).start, 1 + 0.5 / 7, 'Monday of an ISO week');
    near(annotationSpan({ ...base, date: new Date(2026, 2, 15) }, weekly.bins).start, 1 + 6.5 / 7, 'Sunday of an ISO week');
  }

  // 8. The exposure estimate: first onset less the longest incubation period,
  //    to first onset less the shortest.
  {
    // Incubation limits under a day are whole hours, not 57.6 minutes.
    assert.equal(incubationHours(0.04), 1);
    assert.equal(incubationHours(0.25), 6);
    assert.equal(incubationHours(0.33), 8);
    assert.equal(incubationHours(0.67), 16);
    assert.equal(incubationHours(0.5), 12);
    assert.equal(incubationHours(3), 72);
    assert.equal(formatIncubationRange({ min: 0.04, max: 0.25 }), '1–6 h');
    assert.equal(formatIncubationRange({ min: 0.5, max: 3 }), '12 h–3 d');
    assert.equal(formatIncubationRange({ min: 2, max: 5 }), '2–5 d');

    // With an onset time, in hours. For a first onset at 22:00 on 10 January
    // and a 1-6 hour toxin the old arithmetic shaded 9 January, midnight to
    // midnight: a window that ended 22 hours before the first case.
    const onset = new Date(2026, 0, 10, 22, 0);
    const staph = estimateExposureWindow(onset, true, { min: 0.04, max: 0.25 });
    assert.deepEqual([clock(staph.start), clock(staph.end)], ['2026-01-10 16:00', '2026-01-10 21:00'], `${zone}: 1-6 h before 22:00`);
    assert.equal(staph.wholeDays, false);
    const noro = estimateExposureWindow(onset, true, { min: 0.5, max: 2 });
    assert.deepEqual([clock(noro.start), clock(noro.end)], ['2026-01-08 22:00', '2026-01-10 10:00'], `${zone}: 12-48 h before 22:00`);

    // With only an onset date the estimate is whole days, and has to hold for
    // an onset at any hour of that date: 72 h before 00:10 on the 10th is the
    // 7th, and 12 h before 23:50 on the 10th is still the 10th.
    const dateOnly = estimateExposureWindow(new Date(2026, 0, 10), false, { min: 0.5, max: 3 });
    assert.deepEqual([clock(dateOnly.start), clock(dateOnly.end)], ['2026-01-07 00:00', '2026-01-10 23:59']);
    assert.equal(dateOnly.wholeDays, true);
    const hepA = estimateExposureWindow(new Date(2026, 2, 1), false, { min: 15, max: 50 });
    assert.deepEqual([clock(hepA.start), clock(hepA.end)], ['2026-01-10 00:00', '2026-02-14 23:59']);

    // Measles was listed as 10-14 days; exposure to rash is 7-21.
    assert.deepEqual([PATHOGEN_INCUBATION.Measles.min, PATHOGEN_INCUBATION.Measles.max], [7, 21]);
    for (const [name, p] of Object.entries(PATHOGEN_INCUBATION)) {
      assert.ok(p.min > 0 && p.min < p.max, `${name}: minimum below maximum`);
      assert.ok(p.typical >= p.min && p.typical <= p.max, `${name}: typical within the range`);
    }
  }

  // 9. Classification colours. Only the exact strings "Confirmed", "Probable"
  //    and "Suspected" were matched, so "Suspect" took the default palette by
  //    position and came out the same amber as Probable.
  {
    const color = (key, index = 0) => getColorForStrata(key, index, 'classification');
    const [red, amber, blue] = ['#DC2626', '#F59E0B', '#3B82F6'];
    for (const key of ['Confirmed', 'confirmed', 'CONFIRMED', 'Lab-confirmed', ' Confirmed ']) assert.equal(color(key), red, key);
    for (const key of ['Probable', 'probable', 'Probable case']) assert.equal(color(key), amber, key);
    for (const key of ['Suspected', 'Suspect', 'suspect', 'SUSPECTED', 'Suspect case']) assert.equal(color(key), blue, key);

    // The reported collision, at the positions the legend gives them.
    const legend = ['Confirmed', 'Probable', 'Suspect'].map((key, i) => color(key, i));
    assert.equal(new Set(legend).size, 3, `three classifications need three colours, got ${legend.join(', ')}`);

    // A non-case is not coloured as the class it negates.
    for (const key of ['Not a case', 'Not confirmed', 'Discarded']) {
      assert.ok(![red, amber, blue].includes(color(key)), `"${key}" must not look like a case`);
    }
    assert.equal(color('Unknown'), '#9CA3AF');
    // Values the scheme does not name never borrow a colour it has given a meaning.
    for (let i = 0; i < 12; i++) {
      assert.ok(![red, amber, blue].includes(color('Epi-linked', i)), `position ${i}`);
    }
    // The other schemes are positional and unchanged.
    assert.equal(getColorForStrata('Confirmed', 0, 'default'), '#3B82F6');
    assert.equal(getColorForStrata('Suspected', 2, 'default'), '#F59E0B');
  }

  // 8. How far an annotation may pull the axis beyond the data. The picnic
  //    the day before the first onset and the closure a week after the last
  //    case are reached; a mistyped year is not, since it stretched a two-week
  //    curve into 577 days of empty bars.
  {
    const days = ['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14'];
    const records = days.map((onset, i) => ({ id: String(i), onset }));
    const base = { id: 'a', type: 'exposure', category: 'exposure', label: 'x', color: '#000', source: 'manual' };
    const labels = (annotations) => processEpiCurveData(records, 'onset', 'daily', undefined, annotations).bins.map(b => b.label);
    assert.equal(labels([{ ...base, date: new Date(2026, 2, 8) }])[0], 'Mar 6', 'an event two days before the first case is reached');
    assert.equal(labels([{ ...base, date: new Date(2026, 2, 20) }]).at(-1), 'Mar 22', 'and one six days after the last');
    assert.deepEqual(labels([{ ...base, date: new Date(2024, 5, 15) }]), labels([]), 'an event two years earlier does not stretch the axis');
    assert.deepEqual(labels([{ ...base, date: new Date(2026, 2, 12), endDate: new Date(2026, 8, 1) }]), labels([]),
      'nor does a period that runs months past the data');
    assert.deepEqual(labels([{ ...base, date: new Date(NaN) }]), labels([]), 'an unreadable date is ignored');
  }

  console.log(`epiCurve dates regression: all checks passed (${zone})`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
