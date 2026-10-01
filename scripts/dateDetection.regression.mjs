/**
 * Reading dates on import, and reading them back out of records.
 *
 * A date read wrongly is the quietest fault an epidemiology tool can have: the
 * line list still looks full, the curve still has a shape, and the outbreak is
 * a month out. These checks pin the three rules the importer follows: every
 * value is evidence, the whole value must be a date, and nothing falls back to
 * the Date constructor.
 *
 * Run under several TZ values; none of this may depend on the time zone.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-date-test-'));

const bundle = async (src, name) => {
  const out = path.join(tempDir, name);
  await build({
    entryPoints: [path.join(root, src)],
    bundle: true, format: 'esm', platform: 'node',
    outfile: out, logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
};

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

try {
  const { readDateValue, summarizeDateValues, convertDateValue, expandTwoDigitYear, describeIsoDate } =
    await bundle('src/utils/dateDetection.ts', 'dd.mjs');
  const { parseStoredDate, dayNumber, comparableTime, todayDayNumber, formatStoredDate, toStoredDate } =
    await bundle('src/utils/dateValue.ts', 'dv.mjs');

  const iso = (raw, order = null) => convertDateValue(raw, order)?.iso ?? null;

  // 1. Values with only one reading need no order.
  for (const [raw, expected] of [
    ['2025-03-04', '2025-03-04'],
    ['2025/03/04', '2025-03-04'],
    ['2025-3-4', '2025-03-04'],
    ['2025.03.04', '2025-03-04'],
    ['25/03/2025', '2025-03-25'],        // only day-first works
    ['03/25/2025', '2025-03-25'],        // only month-first works
    ['25.03.2025', '2025-03-25'],
    ['25-03-2025', '2025-03-25'],
    ['05/05/2025', '2025-05-05'],        // the same day either way
    ['4 March 2025', '2025-03-04'],
    ['04-Mar-2025', '2025-03-04'],
    ['04Mar2025', '2025-03-04'],
    ['March 4, 2025', '2025-03-04'],
    ['Mar 4 2025', '2025-03-04'],
    ['4 mars 2025', '2025-03-04'],       // French
    ['1 août 2025', '2025-08-01'],
    ['15 février 2025', '2025-02-15'],
    ['3 de marzo', null],                // not a supported form
    ['12 dic 2024', '2024-12-12'],       // Spanish
    ['7 fev 2025', '2025-02-07'],        // Portuguese
    ['29/02/2024', '2024-02-29'],        // leap day
  ]) {
    assert.equal(iso(raw), expected, `"${raw}" (TZ=${tz})`);
  }

  // 2. Values that depend on the order convert only when one is given.
  assert.equal(iso('03/04/2025'), null, 'ambiguous with no order is not guessed');
  assert.equal(iso('03/04/2025', 'DMY'), '2025-04-03');
  assert.equal(iso('03/04/2025', 'MDY'), '2025-03-04');
  assert.equal(iso('03.04.2025', 'DMY'), '2025-04-03');
  assert.equal(iso('3/4/2025', 'DMY'), '2025-04-03');
  // The value's own evidence beats the column's order.
  assert.equal(iso('25/03/2025', 'MDY'), '2025-03-25');

  // 3. Times are kept. Offsets are dropped, the written clock time kept.
  assert.equal(iso('15/04/2025 14:30'), '2025-04-15T14:30');
  assert.equal(iso('03/04/2025 09:00', 'DMY'), '2025-04-03T09:00');
  assert.equal(iso('2025-03-04 10:30:15'), '2025-03-04T10:30:15');
  assert.equal(iso('2025-03-04T10:30'), '2025-03-04T10:30');
  assert.equal(iso('04/15/2025 2:30 PM'), '2025-04-15T14:30');
  assert.equal(iso('04/15/2025 12:05 AM'), '2025-04-15T00:05');
  assert.equal(iso('04/15/2025 12:05 PM'), '2025-04-15T12:05');
  assert.equal(iso('2025-03-05T01:00:00+03:00'), '2025-03-05T01:00', `the day must not move with the viewer's zone (TZ=${tz})`);
  assert.equal(iso('2025-03-04T23:30:00Z'), '2025-03-04T23:30');
  assert.equal(iso('2025-03-04T23:30:00.000Z'), '2025-03-04T23:30');
  assert.equal(convertDateValue('2025-03-04T23:30:00Z', null).hadOffset, true);
  assert.equal(convertDateValue('2025-03-04T23:30', null).hadOffset, false);

  // 4. The whole value must be a date, and a real one.
  for (const raw of [
    '12/08/2024 (approx)', '12/08/2024?', '12/08/20245', '~12/08/2024', '12/08/2024 or 13/08',
    '31/02/2025', '2025-02-30', '2025-13-01', '32/01/2025', '00/01/2025', '2025-00-10',
    '12/08-2024',            // two different separators
    '03-12-05', '13-01-25',  // dashes with a two-digit year: as likely a code as a date
    '555-12-3456', '12/08', '2025', '120/80', '1.2', '12:30', '4 Marzipan 2025', '',
    '15/04/2025 25:00', '15/04/2025 13:00 PM',
  ]) {
    assert.equal(readDateValue(raw), null, `"${raw}" must not be read as a date`);
  }

  // 5. Two-digit years: the century that does not land in a future year.
  const now = new Date(2026, 9, 1);
  assert.equal(expandTwoDigitYear(26, now), 2026);
  assert.equal(expandTwoDigitYear(25, now), 2025);
  assert.equal(expandTwoDigitYear(0, now), 2000);
  assert.equal(expandTwoDigitYear(27, now), 1927, 'next year written as 27 is 1927: nothing recorded has happened in 2027');
  assert.equal(expandTwoDigitYear(29, now), 1929);
  assert.equal(expandTwoDigitYear(95, now), 1995);
  assert.equal(convertDateValue('15/06/29', 'DMY', now).iso, '1929-06-15');
  assert.equal(convertDateValue('15/06/29', 'DMY', now).twoDigitYear, true);
  assert.equal(convertDateValue('13.01.25', null, now).iso, '2025-01-13');
  assert.equal(convertDateValue('04-Mar-25', null, now).iso, '2025-03-04');

  // 6. A column's order comes from all of its values.
  const days1to12 = Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/03/2025`);
  let s = summarizeDateValues(days1to12);
  assert.equal(s.order, 'ambiguous');
  assert.equal(s.ambiguousCount, 11, '03/03 is the same day either way, the other eleven are not');
  assert.equal(s.dateCount, 12);
  assert.equal(s.separator, '/');
  s = summarizeDateValues([...days1to12, '13/03/2025']);
  assert.equal(s.order, 'DMY', 'one day above 12, anywhere in the column, settles it');
  s = summarizeDateValues([...days1to12, '03/13/2025']);
  assert.equal(s.order, 'MDY');
  s = summarizeDateValues(['13/03/2025', '03/25/2025', '05/04/2025']);
  assert.equal(s.order, 'mixed');
  assert.equal(s.ambiguousCount, 1);
  assert.deepEqual(s.ambiguousExamples, ['05/04/2025']);
  s = summarizeDateValues(['2025-03-04', '4 March 2025', 'not a date', '']);
  assert.equal(s.order, 'none');
  assert.equal(s.dateCount, 2);
  assert.equal(summarizeDateValues(['03-04-2025', '05/04/2025']).separator, null);

  assert.equal(describeIsoDate('2025-04-03'), '3 April 2025');
  assert.equal(describeIsoDate('2025-04-03T09:00'), '3 April 2025');

  // 7. Reading stored dates back. Never through the Date constructor: a bare
  //    date must be the same calendar day in every zone, and anything not in
  //    the stored form is unreadable rather than read month-first.
  const p = parseStoredDate('2025-03-04');
  assert.deepEqual([p.year, p.month, p.day, p.hasTime], [2025, 3, 4, false], `TZ=${tz}`);
  const pt = parseStoredDate('2025-03-04T22:15');
  assert.deepEqual([pt.year, pt.month, pt.day, pt.hour, pt.minute, pt.hasTime], [2025, 3, 4, 22, 15, true]);
  assert.deepEqual(parseStoredDate('2025-03-04 22:15:30').second, 30, 'the space form saved by earlier versions still reads');
  for (const raw of ['03/04/2025', '15/03/2025', '4 March 2025', '2025-02-30', '2025-13-01', 'unknown', '', null, undefined, '2025-03-04T25:00']) {
    assert.equal(parseStoredDate(raw), null, `${JSON.stringify(raw)} is not a stored date`);
  }

  // Day arithmetic is on the calendar, so it is the same everywhere,
  // including across a daylight-saving change (30 March 2025 in Europe,
  // 9 March in the US, 6 April in New Zealand).
  const days = (a, b) => dayNumber(parseStoredDate(b)) - dayNumber(parseStoredDate(a));
  assert.equal(days('2025-03-01', '2025-03-10'), 9, `TZ=${tz}`);
  assert.equal(days('2025-03-08', '2025-03-10'), 2, `TZ=${tz}`);
  assert.equal(days('2025-03-29', '2025-03-31'), 2, `TZ=${tz}`);
  assert.equal(days('2025-04-05', '2025-04-07'), 2, `TZ=${tz}`);
  assert.equal(days('2024-02-28', '2024-03-01'), 2);
  assert.equal(days('2024-12-31', '2025-01-01'), 1);
  assert.ok(comparableTime(parseStoredDate('2025-03-04T00:30')) > comparableTime(parseStoredDate('2025-03-04')));
  assert.ok(comparableTime(parseStoredDate('2025-03-04T23:59')) < comparableTime(parseStoredDate('2025-03-05')));

  // Today is the local calendar day.
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.equal(dayNumber(parseStoredDate(todayIso)), todayDayNumber(), `today is today (TZ=${tz})`);

  // 8. Display follows the user's setting, not the browser's locale, and an
  //    unreadable value is shown as it is stored.
  assert.equal(formatStoredDate('2025-03-04', 'DD/MM/YYYY'), '04/03/2025', `TZ=${tz}`);
  assert.equal(formatStoredDate('2025-03-04', 'MM/DD/YYYY'), '03/04/2025');
  assert.equal(formatStoredDate('2025-03-04', 'YYYY-MM-DD'), '2025-03-04');
  assert.equal(formatStoredDate('2025-03-04T14:30', 'DD/MM/YYYY'), '04/03/2025 14:30');
  assert.equal(formatStoredDate('2025-03-04T14:30:05', 'YYYY-MM-DD'), '2025-03-04 14:30:05');
  assert.equal(formatStoredDate('15/03/2025', 'DD/MM/YYYY'), '15/03/2025', 'never "Invalid Date"');
  assert.equal(formatStoredDate('03/04/2025', 'DD/MM/YYYY'), '03/04/2025', 'never re-read month-first');
  assert.equal(formatStoredDate(null, 'DD/MM/YYYY'), '');
  assert.equal(toStoredDate(parseStoredDate('2025-03-04T14:30')), '2025-03-04T14:30');
  assert.equal(toStoredDate(parseStoredDate('2025-03-04')), '2025-03-04');

  console.log(`dateDetection regression: all checks passed (TZ=${tz})`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
