/**
 * Categories, their order, and the x-axis of a line chart.
 *
 * Reviewed before launch, the chart gallery turned the age bands "0-4", "5-9"
 * and "10-14" into the dates "Apr 1", "May 9" and "Oct 14" on a line chart,
 * labelled every real date one day early west of Greenwich, hid the days on
 * which nothing happened, drew a Before/After slope chart with After on the
 * left, and refused to plot a Yes/No column at all. The helpers behind those
 * fixes are exercised here. The date cases must hold in every time zone, so
 * this script is meant to be run under several TZ values.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-chartcategories-test-'));
const bundled = path.join(tempDir, 'chartCategories.mjs');

const rec = (rows) => rows.map((row, i) => ({ id: String(i), ...row }));

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/chartCategories.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    categoryOf, numberOf, isCategoryColumn, categoryColumns, orderCategories, orderPeriods,
    categoriesInColumn, hasNaturalOrder, byCategoryOrder, isoDateOf, buildDateAxis,
    formatDateLabels, buildLineAxis, MAX_DATE_AXIS_POINTS,
  } = await import(pathToFileURL(bundled).href);

  // 1. One category per value, however it was typed. Missing is null, and a
  //    cell of spaces is missing.
  {
    assert.equal(categoryOf(' Female '), 'Female');
    assert.equal(categoryOf('   '), null);
    assert.equal(categoryOf(''), null);
    assert.equal(categoryOf(null), null);
    assert.equal(categoryOf(undefined), null);
    assert.equal(categoryOf(true), 'Yes', 'a stored boolean is labelled Yes, not "true"');
    assert.equal(categoryOf(false), 'No');
    assert.equal(categoryOf(0), '0', 'zero is a value, not a blank');
    assert.equal(categoryOf(31), '31');
  }

  // 2. Numbers: blanks and booleans are not zero.
  {
    assert.equal(numberOf(''), null);
    assert.equal(numberOf('  '), null);
    assert.equal(numberOf(null), null);
    assert.equal(numberOf(true), null);
    assert.equal(numberOf('abc'), null);
    assert.equal(numberOf('12.5'), 12.5);
    assert.equal(numberOf(0), 0);
  }

  // 3. Which columns a category picker offers. Boolean columns and a numeric
  //    epi week were both impossible to select in most charts.
  {
    const records = rec([
      { hosp: true, week: 30, age: 34.5, id_no: 'A1', onset: '2026-08-01', year: 2025 },
      { hosp: false, week: 31, age: 2, id_no: 'A2', onset: '2026-08-02', year: 2026 },
    ]);
    const col = (key, type) => ({ key, label: key, type });
    assert.equal(isCategoryColumn(col('hosp', 'boolean'), records), true);
    assert.equal(isCategoryColumn(col('week', 'number'), records), true, 'whole-number epi weeks are categories');
    assert.equal(isCategoryColumn(col('year', 'number'), records), true);
    assert.equal(isCategoryColumn(col('age', 'number'), records), false, 'a measurement with decimals is not');
    assert.equal(isCategoryColumn(col('onset', 'date'), records), false);

    const many = rec(Array.from({ length: 200 }, (_, i) => ({ n: i })));
    assert.equal(isCategoryColumn(col('n', 'number'), many), false, 'too many distinct values to be a category');
    assert.equal(isCategoryColumn(col('n', 'number'), []), false);

    const offered = categoryColumns({
      columns: [col('week', 'number'), col('hosp', 'boolean'), col('age', 'number'), col('id_no', 'text')],
      records,
    }).map(c => c.key);
    assert.deepEqual(offered, ['hosp', 'id_no', 'week'], 'numeric categories are listed after the others');
  }

  // 4. Reading order. A bare sort put 10-14 before 5-9 and April before January.
  {
    assert.deepEqual(orderCategories(['10-14', '5-9', '0-4', '50+', '15-19']), ['0-4', '5-9', '10-14', '15-19', '50+']);
    assert.deepEqual(orderCategories(['March', 'January', 'February']), ['January', 'February', 'March']);
    assert.deepEqual(orderCategories(['31', '4', '30']), ['4', '30', '31'], 'epi weeks sort as numbers');
    assert.deepEqual(orderCategories(['b', 'Unknown', 'a']), ['a', 'b', 'Unknown'], 'Unknown goes last');
    assert.deepEqual(orderCategories(['a', 'a', 'b']), ['a', 'b'], 'duplicates collapse');
  }

  // 5. A declared order wins, and a boolean reads Yes then No.
  {
    const education = { type: 'categorical', valueOrder: ['None', 'Primary', 'Secondary', 'Higher'] };
    assert.deepEqual(orderCategories(['Higher', 'Secondary', 'None', 'Primary'], education),
      ['None', 'Primary', 'Secondary', 'Higher']);
    assert.deepEqual(orderCategories(['No', 'Yes'], { type: 'boolean' }), ['Yes', 'No']);
    assert.deepEqual(
      categoriesInColumn(rec([{ h: false }, { h: true }, { h: null }]), { key: 'h', label: 'H', type: 'boolean' }),
      ['Yes', 'No']
    );
  }

  // 6. A slope chart reads then-to-now. Alphabetically, After precedes Before.
  {
    assert.deepEqual(orderPeriods(['After', 'Before']), ['Before', 'After']);
    assert.deepEqual(orderPeriods(['Post-campaign', 'Pre-campaign']), ['Pre-campaign', 'Post-campaign']);
    assert.deepEqual(orderPeriods(['Endline', 'Baseline']), ['Baseline', 'Endline']);
    assert.deepEqual(orderPeriods(['2025', '2024']), ['2024', '2025'], 'years keep numeric order');
    assert.deepEqual(orderPeriods(['Urban', 'Rural']), ['Rural', 'Urban'], 'unrelated words keep the shared order');
    assert.deepEqual(orderPeriods(['After', 'Before'], { type: 'categorical', valueOrder: ['After', 'Before'] }),
      ['After', 'Before'], 'a declared order is not second-guessed');
  }

  // 7. Categories with an order of their own are detected, so a chart does not
  //    rank an age distribution by count.
  {
    assert.equal(hasNaturalOrder(['0-4', '5-9', '10-14']), true);
    assert.equal(hasNaturalOrder(['Jan', 'Feb', 'Mar']), true);
    assert.equal(hasNaturalOrder(['<5', '5-14', '15+', 'Unknown']), true);
    assert.equal(hasNaturalOrder(['Confirmed', 'Probable', 'Suspected']), false);
    assert.equal(hasNaturalOrder(['a', 'b'], { type: 'categorical', valueOrder: ['b', 'a'] }), true);
    assert.equal(hasNaturalOrder(['only']), false);

    const rows = [{ c: 'b' }, { c: 'zz' }, { c: 'a' }];
    assert.deepEqual(rows.sort(byCategoryOrder(['a', 'b'], r => r.c)).map(r => r.c), ['a', 'b', 'zz'],
      'rows follow the order given; anything it omits goes last');
  }

  // 8. Only a real ISO date is a date. A timestamp keeps its day.
  {
    assert.equal(isoDateOf('2026-09-01'), '2026-09-01');
    assert.equal(isoDateOf('2026-09-01T14:30:00'), '2026-09-01');
    assert.equal(isoDateOf('2026-09-01 08:00'), '2026-09-01');
    for (const notADate of ['5-9', '0-4', '10-14', 'Ward-3', '2026-01', '2026-W05', 'May-2026', '2026-02-30', '2026-13-01', '', null, 20260901]) {
      assert.equal(isoDateOf(notADate), null, `${notADate} is not an ISO date`);
    }
  }

  // 9. The regression at the centre of this file: a category on a line chart's
  //    x-axis is printed as written. These were rewritten as "Apr 1", "May 9",
  //    "Oct 14" and "Mar 1".
  {
    const ages = buildLineAxis(
      rec([{ a: '10-14' }, { a: '0-4' }, { a: '5-9' }, { a: '15-19' }, { a: '' }]),
      { key: 'a', label: 'Age group', type: 'text' }
    );
    assert.equal(ages.kind, 'category');
    assert.deepEqual(ages.values, ['0-4', '5-9', '10-14', '15-19']);
    assert.deepEqual(ages.labels, ages.values, 'labels are the values, untouched');

    const wards = buildLineAxis(rec([{ w: 'Ward-3' }, { w: 'Ward-1' }]), { key: 'w', label: 'Ward', type: 'text' });
    assert.deepEqual(wards.labels, ['Ward-1', 'Ward-3']);

    const months = buildLineAxis(rec([{ m: '2026-02' }, { m: '2026-01' }]), { key: 'm', label: 'Month', type: 'text' });
    assert.deepEqual(months.labels, ['2026-01', '2026-02'], 'a year-month is not turned into a day');

    const weeks = buildLineAxis(rec([{ w: 31 }, { w: 4 }, { w: 30 }]), { key: 'w', label: 'Epi week', type: 'number' });
    assert.deepEqual(weeks.values, ['4', '30', '31'], 'a numeric epi week is usable, in numeric order');
    assert.equal(weeks.keyOf(30), '30');
  }

  // 10. Date labels come from the text of the date. Through the Date
  //     constructor, 2026-09-01 is 31 August anywhere west of Greenwich.
  {
    assert.deepEqual(formatDateLabels(['2026-09-01', '2026-09-02', '2026-09-20']), ['1 Sep', '2 Sep', '20 Sep']);
    assert.deepEqual(formatDateLabels(['2025-12-30', '2026-01-02']), ['30 Dec 2025', '2 Jan 2026'],
      'the year appears once the dates span more than one');
    assert.deepEqual(formatDateLabels(['2026-01-01', '2026-02-01'], 'month'), ['Jan 2026', 'Feb 2026']);
  }

  // 11. Gaps in a run of dates are filled, so a fortnight with no onsets is a
  //     fortnight on the axis. Onsets on 1, 2, 3, 20 and 21 September used to
  //     be five equally spaced points.
  {
    const axis = buildDateAxis(['2026-09-20', '2026-09-01', '2026-09-03', '2026-09-02', '2026-09-21', '2026-09-01']);
    assert.equal(axis.step, 'day');
    assert.equal(axis.values.length, 21, 'every day from the 1st to the 21st');
    assert.equal(axis.values[0], '2026-09-01');
    assert.equal(axis.values[20], '2026-09-21');
    assert.equal(axis.filled, 16);
    assert.ok(axis.values.includes('2026-09-10'), 'a day with no records is on the axis');

    // Across a month end and a daylight-saving change, with no day lost or doubled.
    const dst = buildDateAxis(['2026-03-27', '2026-04-02']);
    assert.deepEqual(dst.values, ['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02']);
  }

  // 12. The spacing follows the data. Monthly reports are not filled with
  //     thirty zero days between each, nor weekly ones with six.
  {
    const monthly = buildDateAxis(['2026-01-01', '2026-02-01', '2026-05-01']);
    assert.equal(monthly.step, 'month');
    assert.deepEqual(monthly.values, ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01']);

    const acrossYears = buildDateAxis(['2025-11-15', '2026-02-15']);
    assert.deepEqual(acrossYears.values, ['2025-11-15', '2025-12-15', '2026-01-15', '2026-02-15']);

    const weekly = buildDateAxis(['2026-01-05', '2026-01-12', '2026-02-02']);
    assert.equal(weekly.step, 'week');
    assert.deepEqual(weekly.values, ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02']);

    assert.deepEqual(buildDateAxis(['2026-01-05']).values, ['2026-01-05']);
    assert.deepEqual(buildDateAxis([]).values, []);
    assert.equal(buildDateAxis(['1990-01-01', '2026-01-02']), null,
      `a run longer than ${MAX_DATE_AXIS_POINTS} points is not filled`);
  }

  // 13. A date column becomes a date axis, with records matched by calendar day.
  {
    const records = rec([
      { onset: '2026-09-01' }, { onset: '2026-09-01T23:30:00' }, { onset: '2026-09-03' }, { onset: '' },
    ]);
    const axis = buildLineAxis(records, { key: 'onset', label: 'Onset', type: 'date' });
    assert.equal(axis.kind, 'date');
    assert.deepEqual(axis.values, ['2026-09-01', '2026-09-02', '2026-09-03']);
    assert.deepEqual(axis.labels, ['1 Sep', '2 Sep', '3 Sep']);
    assert.equal(axis.filled, 1);
    assert.equal(axis.keyOf('2026-09-01T23:30:00'), '2026-09-01', 'a late-evening timestamp stays on its own day');
    assert.equal(axis.keyOf(''), null);

    // Dates the importer could not normalise are shown as stored, in time order.
    const raw = buildLineAxis(rec([{ d: '03/15/2026' }, { d: '01/20/2026' }]), { key: 'd', label: 'D', type: 'date' });
    assert.equal(raw.kind, 'category');
    assert.deepEqual(raw.labels, ['01/20/2026', '03/15/2026']);
  }

  console.log(`chartCategories regression: all checks passed (TZ=${process.env.TZ ?? 'system'})`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
