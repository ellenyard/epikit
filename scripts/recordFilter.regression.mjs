/**
 * Filtering, grouping and sorting.
 *
 * A filter that keeps the wrong records is the quietest kind of wrong answer:
 * every downstream count, rate and curve is computed correctly on a population
 * that is not the one the user asked for. Nothing looks broken.
 *
 * Two faults are covered specifically. Grouping used `value ?? 'Unknown'`,
 * which only catches null, so an empty cell and a whitespace cell each became
 * their own category alongside "Unknown": three categories for one missing
 * value, two of which draw as blank. And the operator filter compared
 * String(null), the text "null", so "contains n" matched every missing value.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-filter-test-'));
const bundled = path.join(tempDir, 'recordFilter.mjs');

const ids = rs => rs.map(r => r.id);

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/recordFilter.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    categoryValue, collectCategoryValues, countInCategory, filterByCategoryValues,
    filterRecords, sortRecords, isMissingValue, MISSING_CATEGORY_LABEL, sortCategoryValues,
  } = await import(pathToFileURL(bundled).href);

  // Every way a cell can be empty, as they actually arrive from a spreadsheet.
  const missingForms = [
    { id: 'n', site: null },
    { id: 'u', site: undefined },
    { id: 'e', site: '' },
    { id: 'w', site: '   ' },
    { id: 't', site: '\t' },
  ];

  // 1. Missing is one category, however it is spelled. Three categories for one
  //    missing value put two indistinguishable blank options in a dropdown and
  //    two identical labels in an epi curve legend.
  {
    for (const record of missingForms) {
      assert.equal(categoryValue(record.site), MISSING_CATEGORY_LABEL,
        `${JSON.stringify(record.site)} must be one missing category`);
      assert.equal(isMissingValue(record.site), true);
    }
    const categories = collectCategoryValues(missingForms, 'site');
    assert.deepEqual(categories, [MISSING_CATEGORY_LABEL],
      `all missing forms are one category, got ${categories.join(' | ')}`);
    assert.equal(countInCategory(missingForms, 'site', MISSING_CATEGORY_LABEL), 5);
  }

  // 2. Real values are not disturbed, and surrounding whitespace does not make
  //    a value its own category.
  {
    const records = [
      { id: '1', site: 'North' },
      { id: '2', site: ' North ' },
      { id: '3', site: 'South' },
      { id: '4', site: null },
    ];
    assert.deepEqual(collectCategoryValues(records, 'site'),
      ['North', 'South', MISSING_CATEGORY_LABEL],
      'a padded value is the same category as the unpadded one');
    assert.equal(countInCategory(records, 'site', 'North'), 2);
    assert.notEqual(categoryValue('North'), MISSING_CATEGORY_LABEL);
    assert.equal(isMissingValue('North'), false);
    assert.equal(isMissingValue(0), false, 'zero is a value, not a gap');
    assert.equal(isMissingValue(false), false);
  }

  // 3. Selecting the missing category selects every form of missing, and an
  //    empty selection means no filter rather than no records.
  {
    const mixed = [...missingForms, { id: 'r', site: 'North' }];
    assert.deepEqual(
      ids(filterByCategoryValues(mixed, 'site', new Set([MISSING_CATEGORY_LABEL]))).sort(),
      ['e', 'n', 't', 'u', 'w'],
      'one selection must catch every form of missing');
    assert.equal(filterByCategoryValues(mixed, 'site', new Set()).length, mixed.length,
      'no selection shows everything');
    assert.equal(filterByCategoryValues(mixed, null, new Set(['North'])).length, mixed.length,
      'no column shows everything');
  }

  // 4. The operator filter must not read a missing value as the text "null".
  //    This is the fault: "contains n" matched every blank cell, so a filter
  //    that appeared to narrow the data quietly pulled the gaps back in.
  {
    const records = [
      { id: '1', name: 'Nairobi' },
      { id: '2', name: null },
      { id: '3', name: undefined },
      { id: '4', name: '   ' },
      { id: '5', name: 'Mombasa' },
    ];
    for (const needle of ['n', 'u', 'l', 'null', 'e', 'd', 'i', 'undefined']) {
      const kept = filterRecords(records, [{ column: 'name', operator: 'contains', value: needle }]);
      assert.ok(!ids(kept).some(id => ['2', '3', '4'].includes(id)),
        `"contains ${needle}" must not match a missing value, kept ${ids(kept).join(',')}`);
    }
    assert.deepEqual(ids(filterRecords(records,
      [{ column: 'name', operator: 'contains', value: 'nai' }])), ['1'],
      'a real substring still matches, case-insensitively');
  }

  // 5. equals and not_equals, with whitespace and missing behaving as one.
  {
    const records = [
      { id: '1', status: 'Confirmed' },
      { id: '2', status: ' confirmed ' },
      { id: '3', status: 'Probable' },
      { id: '4', status: null },
      { id: '5', status: '  ' },
    ];
    assert.deepEqual(ids(filterRecords(records,
      [{ column: 'status', operator: 'equals', value: 'Confirmed' }])), ['1', '2'],
      'equals ignores case and padding');
    assert.deepEqual(ids(filterRecords(records,
      [{ column: 'status', operator: 'equals', value: '' }])), ['4', '5'],
      'equals blank selects the missing, whitespace included');
    assert.deepEqual(ids(filterRecords(records,
      [{ column: 'status', operator: 'not_equals', value: 'Confirmed' }])), ['3', '4', '5'],
      'not_equals keeps the missing, which are indeed not Confirmed');
  }

  // 6. is_empty must agree with the rest of the app. A whitespace-only cell is
  //    empty to the 2x2 exposure grouping, so it must be empty here too, or
  //    "records missing exposure" and "the unexposed group" disagree.
  {
    const records = [
      { id: '1', exposure: 'Yes' },
      { id: '2', exposure: '' },
      { id: '3', exposure: '   ' },
      { id: '4', exposure: null },
    ];
    assert.deepEqual(ids(filterRecords(records,
      [{ column: 'exposure', operator: 'is_empty', value: '' }])), ['2', '3', '4'],
      'whitespace counts as empty');
    assert.deepEqual(ids(filterRecords(records,
      [{ column: 'exposure', operator: 'is_not_empty', value: '' }])), ['1']);
  }

  // 7. Numeric comparison excludes the missing rather than treating them as 0.
  {
    const records = [
      { id: '1', age: 10 }, { id: '2', age: 50 }, { id: '3', age: null },
      { id: '4', age: '' }, { id: '5', age: 'abc' },
    ];
    assert.deepEqual(ids(filterRecords(records,
      [{ column: 'age', operator: 'greater_than', value: 20 }])), ['2']);
    assert.deepEqual(ids(filterRecords(records,
      [{ column: 'age', operator: 'less_than', value: 20 }])), ['1'],
      'a blank age is not younger than 20');
    assert.equal(filterRecords(records,
      [{ column: 'age', operator: 'greater_than', value: 'abc' }]).length, 0,
      'an unparseable bound matches nothing rather than everything');
  }

  // 8. Date comparison is consistent for a column mixing plain dates with
  //    timestamps. A bare date is parsed as UTC midnight by the Date
  //    constructor and a timestamp as local, so the two disagreed by the
  //    timezone offset and sorted wrongly around midnight.
  {
    const columns = [{ key: 'onset', label: 'Onset', type: 'date' }];
    const records = [
      { id: 'early', onset: '2026-01-09' },
      { id: 'sameday', onset: '2026-01-10' },
      { id: 'late', onset: '2026-01-11' },
    ];
    const after = filterRecords(records,
      [{ column: 'onset', operator: 'greater_than', value: '2026-01-10' }], columns);
    assert.deepEqual(ids(after), ['late'],
      'the boundary date itself is not after itself');
    const before = filterRecords(records,
      [{ column: 'onset', operator: 'less_than', value: '2026-01-10' }], columns);
    assert.deepEqual(ids(before), ['early']);

    // The case that distinguishes the two parsings, which bare dates alone
    // cannot: a column holding both a plain date and a timestamp. An onset at
    // 02:00 on 10 January is after the start of 10 January. Read as UTC, the
    // bare bound lands 5.5 hours later in Asia/Kolkata and the record is
    // wrongly excluded; read as local, both sides mean local midnight.
    const mixed = [
      { id: 'small-hours', onset: '2026-01-10 02:00' },
      { id: 'evening-before', onset: '2026-01-09 22:00' },
    ];
    assert.deepEqual(
      ids(filterRecords(mixed,
        [{ column: 'onset', operator: 'greater_than', value: '2026-01-10' }], columns)),
      ['small-hours'],
      `an onset at 02:00 on the 10th is after the start of the 10th (TZ=${
        Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  }

  // 9. Several filters combine with AND, each narrowing the last.
  {
    const records = [
      { id: '1', site: 'North', age: 30 },
      { id: '2', site: 'North', age: 70 },
      { id: '3', site: 'South', age: 30 },
    ];
    assert.deepEqual(ids(filterRecords(records, [
      { column: 'site', operator: 'equals', value: 'North' },
      { column: 'age', operator: 'less_than', value: 50 },
    ])), ['1']);
    assert.equal(filterRecords(records, []).length, 3, 'no filters keeps everything');
  }

  // 10. An operator this build does not know matches nothing. Filters travel in
  //     project files, and silently dropping one leaves the user reading
  //     unfiltered data believing it was narrowed.
  {
    const records = [{ id: '1', site: 'North' }, { id: '2', site: 'South' }];
    const kept = filterRecords(records,
      [{ column: 'site', operator: 'regex_match', value: '.*' }]);
    assert.equal(kept.length, 0,
      'an unknown operator must not silently pass every record');
  }

  // 11. Sorting puts the missing at one end rather than among the values, and
  //     does not mutate the caller's array.
  {
    const records = [
      { id: '1', age: 30 }, { id: '2', age: null }, { id: '3', age: 10 }, { id: '4', age: '  ' },
    ];
    const original = [...records];
    const asc = sortRecords(records, { column: 'age', direction: 'asc' });
    assert.deepEqual(ids(asc).slice(0, 2), ['3', '1'], 'values sort numerically');
    assert.deepEqual(ids(asc).slice(2).sort(), ['2', '4'], 'the missing collect at the end');
    assert.deepEqual(records, original, 'the input array must not be reordered in place');

    const desc = sortRecords(records, { column: 'age', direction: 'desc' });
    assert.deepEqual(ids(desc).slice(0, 2), ['1', '3'], 'descending reverses the values');
    assert.deepEqual(ids(desc).slice(2).sort(), ['2', '4'],
      'and the missing stay at the end rather than moving to the top');
    assert.deepEqual(sortRecords(records, null), records, 'no sort is a no-op');
  }

  // 12. Category ordering for an axis or legend. A bare sort is lexicographic,
  //     which puts April before January and "10-14" before "5-9". A month by
  //     district heatmap exists to show seasonality, and alphabetical months
  //     scatter the season across the axis so the pattern cannot be read.
  {
    const months = ['Mar', 'Jan', 'Dec', 'Feb', 'Nov'];
    assert.deepEqual(sortCategoryValues(months), ['Jan', 'Feb', 'Mar', 'Nov', 'Dec'],
      'months sort chronologically, not alphabetically');
    assert.deepEqual(
      sortCategoryValues(['September', 'January', 'April']),
      ['January', 'April', 'September'],
      'full month names too');

    const bands = ['10-14', '5-9', '0-4', '15-19'];
    assert.deepEqual(sortCategoryValues(bands), ['0-4', '5-9', '10-14', '15-19'],
      'age bands sort by their leading number');
    assert.deepEqual(sortCategoryValues(['<5', '5-9', '10-14']), ['<5', '5-9', '10-14'],
      'a leading comparator does not break the numeric order');

    // A single value that is not a month must not half-order the axis.
    assert.deepEqual(
      sortCategoryValues(['Mar', 'Jan', 'Not recorded']),
      ['Jan', 'Mar', 'Not recorded'].sort((a, b) => a.localeCompare(b)),
      'one non-month value falls back to alphabetical for all');

    assert.deepEqual(sortCategoryValues(['South', 'North', 'East']), ['East', 'North', 'South'],
      'ordinary categories stay alphabetical');

    // Missing sorts last rather than alphabetically into the middle, which is
    // where a reader looks for it.
    const withMissing = sortCategoryValues(['South', MISSING_CATEGORY_LABEL, 'North']);
    assert.equal(withMissing[withMissing.length - 1], MISSING_CATEGORY_LABEL);
    const monthsWithMissing = sortCategoryValues(['Mar', MISSING_CATEGORY_LABEL, 'Jan']);
    assert.deepEqual(monthsWithMissing, ['Jan', 'Mar', MISSING_CATEGORY_LABEL],
      'and does not stop months ordering chronologically');

    // An explicit order wins, with anything unlisted following it.
    // Deliberately a case where the declared order differs from alphabetical,
    // or the assertion passes whether or not the order is honoured.
    assert.deepEqual(
      sortCategoryValues(['High', 'Low', 'Medium', 'Unlisted'], ['Low', 'Medium', 'High']),
      ['Low', 'Medium', 'High', 'Unlisted'],
      'a declared value order is respected over alphabetical');

    assert.deepEqual(sortCategoryValues([]), [], 'an empty axis is not an error');
  }

  // Filters match what the line list shows, not only what is stored.
  {
    const cols = [
      { key: 'cid', label: 'ID', type: 'text' },
      { key: 'hosp', label: 'Hospitalised', type: 'boolean' },
      { key: 'onset', label: 'Onset', type: 'date' },
    ];
    const records = [
      { id: 'A', cid: 'A', hosp: true, onset: '2025-03-04' },
      { id: 'B', cid: 'B', hosp: false, onset: '2025-03-15' },
      { id: 'C', cid: 'C', hosp: null, onset: '2025-04-03' },
      { id: 'D', cid: 'D', hosp: null, onset: '2025-03-04T22:15' },
      { id: 'E', cid: 'E', hosp: null, onset: '31/02/2025' },
    ];
    const run = (column, operator, value, dateFormat = 'DD/MM/YYYY') =>
      ids(filterRecords(records, [{ column, operator, value }], cols, { dateFormat }));
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // A stored true is displayed "Yes". Filtering on "Yes" found nothing.
    assert.deepEqual(run('hosp', 'equals', 'Yes'), ['A']);
    assert.deepEqual(run('hosp', 'equals', 'no'), ['B']);
    assert.deepEqual(run('hosp', 'contains', 'No'), ['B']);
    assert.deepEqual(run('hosp', 'equals', 'true'), ['A'], 'the stored form still matches');
    assert.deepEqual(run('hosp', 'not_equals', 'Yes'), ['B', 'C', 'D', 'E']);

    // A date typed the way it is displayed. Day-first: 04/03/2025 is 4 March.
    assert.deepEqual(run('onset', 'equals', '04/03/2025'), ['A', 'D'], `a time on the 4th is on the 4th (TZ=${tz})`);
    assert.deepEqual(run('onset', 'equals', '2025-03-04'), ['A', 'D']);
    assert.deepEqual(run('onset', 'equals', '2025-03-04T22:15'), ['D']);
    assert.deepEqual(run('onset', 'not_equals', '04/03/2025'), ['B', 'C', 'E']);
    assert.deepEqual(run('onset', 'contains', '03/2025'), ['A', 'B', 'D'], 'contains searches the date as displayed');
    assert.deepEqual(run('onset', 'contains', '2025-03'), ['A', 'B', 'D'], 'and as stored');
    // The same text under a month-first setting is 3 April.
    assert.deepEqual(run('onset', 'equals', '04/03/2025', 'MM/DD/YYYY'), ['C']);
    assert.deepEqual(run('onset', 'contains', '03/04/2025', 'MM/DD/YYYY'), ['A', 'D']);

    // Comparisons read the typed date in the user's order. 15/03/2025 used
    // to match nothing, and 05/03/2025 was read as 3 May.
    assert.deepEqual(run('onset', 'greater_than', '15/03/2025'), ['C']);
    assert.deepEqual(run('onset', 'greater_than', '05/03/2025'), ['B', 'C'], `5 March, not 3 May (TZ=${tz})`);
    assert.deepEqual(run('onset', 'less_than', '05/03/2025'), ['A', 'D']);
    assert.deepEqual(run('onset', 'greater_than', '2025-03-04'), ['B', 'C', 'D'], 'a time on the 4th is after the start of the 4th');
    // A bound that is not a date matches nothing; so does a cell that is not one.
    assert.deepEqual(run('onset', 'greater_than', 'soon'), []);
    assert.deepEqual(run('onset', 'less_than', '2099-01-01'), ['A', 'B', 'C', 'D'], 'an unreadable cell is neither before nor after');
    // The unreadable cell can still be found by its text.
    assert.deepEqual(run('onset', 'equals', '31/02/2025'), ['E']);
  }

  console.log('record filter regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
