/**
 * Data quality checks.
 *
 * These are what users rely on to find the kind of problems this review has
 * been fixing, so a check that quietly misses something is worse than no check
 * at all: the panel reports a clean bill of health and the analyst believes it.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-dq-test-'));
const bundled = path.join(tempDir, 'dataQuality.mjs');

const columns = [
  { key: 'id', label: 'ID', type: 'text' },
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'onset', label: 'Onset', type: 'date' },
  { key: 'hosp', label: 'Hospitalised', type: 'date' },
  { key: 'age', label: 'Age', type: 'number' },
];
const of = (issues, type) => issues.filter(i => i.checkType === type);
// The local calendar day, as a user would type it. toISOString() gives the UTC
// day, which is already tomorrow during the evening in the Americas, and the
// "today is not the future" check then failed for a few hours every day.
const iso = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/dataQuality.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { runDataQualityChecks, getDefaultConfig, getCheckName, suggestQualityRules } =
    await import(pathToFileURL(bundled).href);

  const base = getDefaultConfig();

  // 1. Date order: a hospitalisation before onset is flagged, and the record is
  //    named so it can be found.
  {
    const records = [
      { id: '1', onset: '2026-01-10', hosp: '2026-01-05', age: 34 },
      { id: '2', onset: '2026-01-11', hosp: '2026-01-12', age: 40 },
    ];
    const issues = runDataQualityChecks(records, columns, {
      ...base,
      dateOrderRules: [{
        id: 'r1', firstDateField: 'onset', secondDateField: 'hosp',
        firstDateLabel: 'Onset', secondDateLabel: 'Hospitalised',
      }],
    });
    const found = of(issues, 'date_order');
    assert.equal(found.length, 1, 'exactly the out-of-order record should be flagged');
    assert.deepEqual(found[0].recordIds, ['1']);
  }

  // 2. A record missing one of the two dates is not flagged: an absent date is
  //    a completeness problem, not an ordering one.
  {
    const records = [{ id: '1', onset: '2026-01-10', hosp: '' }];
    const issues = runDataQualityChecks(records, columns, {
      ...base,
      dateOrderRules: [{
        id: 'r1', firstDateField: 'onset', secondDateField: 'hosp',
        firstDateLabel: 'Onset', secondDateLabel: 'Hospitalised',
      }],
    });
    assert.equal(of(issues, 'date_order').length, 0, 'a missing date is not an ordering violation');
  }

  // 3. Numeric range: both bounds, and the boundary values themselves are in
  //    range rather than flagged.
  {
    const records = [
      { id: '1', age: 999 }, { id: '2', age: -5 },
      { id: '3', age: 0 }, { id: '4', age: 120 }, { id: '5', age: 45 },
    ];
    const issues = runDataQualityChecks(records, columns, {
      ...base,
      numericRangeRules: [{ id: 'r', field: 'age', fieldLabel: 'Age', min: 0, max: 120 }],
    });
    const flagged = of(issues, 'numeric_range').flatMap(i => i.recordIds).sort();
    assert.deepEqual(flagged, ['1', '2'], 'only out-of-range ages should be flagged');
    assert.ok(of(issues, 'numeric_range').every(i => /Age/.test(i.message)),
      'the message should name the field rather than say undefined');
  }

  // 4. Future dates. This is the check that needs no configuration, so it is
  //    what the default settings actually catch.
  {
    const future = new Date(); future.setFullYear(future.getFullYear() + 1);
    const records = [
      { id: '1', onset: iso(future) },
      { id: '2', onset: '2026-01-10' },
    ];
    const issues = runDataQualityChecks(records, columns, base);
    const found = of(issues, 'future_date');
    assert.equal(found.length, 1, 'a future onset date must be flagged by default');
    assert.deepEqual(found[0].recordIds, ['1']);
    assert.equal(getCheckName('future_date'), 'Future Dates');
  }

  // 5. Today is not the future, including a timestamp later today. Comparing
  //    against the start of today rather than its end would flag a record
  //    entered this afternoon as impossible.
  {
    const laterToday = new Date();
    laterToday.setHours(23, 0, 0, 0);
    for (const [label, value] of [
      ['a date entered today', iso(new Date())],
      ['a timestamp later today', laterToday.toISOString()],
    ]) {
      const issues = runDataQualityChecks([{ id: '1', onset: value }], columns, base);
      assert.equal(of(issues, 'future_date').length, 0, `${label} is not in the future`);
    }
  }

  // 6. Missing values are counted per field, against the right denominator.
  {
    const records = [
      { id: '1', name: 'A', age: 30 },
      { id: '2', name: '', age: 31 },
      { id: '3', name: null, age: 32 },
      { id: '4', name: 'D', age: 33 },
    ];
    const issues = runDataQualityChecks(records, columns, { ...base, missingValueFields: ['name'] });
    const found = of(issues, 'missing_values');
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].recordIds.sort(), ['2', '3'], 'blank and null both count as missing');
    assert.ok(/50%/.test(found[0].details), `expected 50% of 4 records, got ${found[0].details}`);
  }

  // 7. Duplicates: identical records are grouped, distinct ones are not.
  {
    const records = [
      { id: '1', name: 'Jane Smith', age: 30 },
      { id: '2', name: 'Jane Smith', age: 30 },
      { id: '3', name: 'Quite Different', age: 71 },
    ];
    const issues = runDataQualityChecks(records, columns, { ...base, duplicateFields: ['name', 'age'] });
    const dup = of(issues, 'duplicate');
    assert.equal(dup.length, 1, 'the identical pair should raise one grouped issue');
    assert.deepEqual(dup[0].recordIds.sort(), ['1', '2']);
  }

  // 8. Disabling a check silences it.
  {
    const future = new Date(); future.setFullYear(future.getFullYear() + 1);
    const records = [{ id: '1', onset: iso(future) }];
    const issues = runDataQualityChecks(records, columns,
      { ...base, enabledChecks: ['duplicate'] });
    assert.equal(of(issues, 'future_date').length, 0, 'a disabled check must not run');
  }

  // 9. The shape every issue must have, since the panel navigates by it.
  {
    const records = [{ id: '1', onset: '2026-01-10', hosp: '2026-01-05' }];
    const issues = runDataQualityChecks(records, columns, {
      ...base,
      dateOrderRules: [{
        id: 'r1', firstDateField: 'onset', secondDateField: 'hosp',
        firstDateLabel: 'Onset', secondDateLabel: 'Hospitalised',
      }],
    });
    for (const i of issues) {
      assert.ok(i.id && i.checkType && i.category && i.severity, 'issues need identity and severity');
      assert.ok(Array.isArray(i.recordIds) && i.recordIds.length > 0,
        'an issue must point at the records it concerns');
      assert.ok(typeof i.message === 'string' && i.message.length > 0 && !/undefined/.test(i.message),
        `issue messages must be readable, got "${i.message}"`);
    }
  }

  // 10. Suggested rules turn the two configurable checks on for a fresh
  //     import, using column names. They must be conservative: a rule that
  //     cries wolf trains people to ignore the panel.
  {
    const realWorld = [
      { key: 'exposure_date', label: 'Exposure Date', type: 'date' },
      { key: 'onset_date', label: 'Onset Date', type: 'date' },
      { key: 'hospitalization_date', label: 'Hospitalization Date', type: 'date' },
      { key: 'interview_date', label: 'Interview Date', type: 'date' },
      { key: 'report_date', label: 'Report Date', type: 'date' },
      { key: 'age', label: 'Age', type: 'number' },
      { key: 'dietary_diversity_score', label: 'Dietary Diversity Score', type: 'number' },
    ];
    const s = suggestQualityRules(realWorld);

    const pairs = s.dateOrderRules.map(r => `${r.firstDateField}->${r.secondDateField}`);
    assert.ok(pairs.includes('exposure_date->onset_date'),
      'onset follows exposure, which is true of any transmitted illness');
    assert.ok(pairs.includes('onset_date->interview_date'), 'an interview follows onset');
    assert.ok(pairs.includes('onset_date->report_date'), 'a report follows onset');
    assert.ok(!pairs.some(p => p.includes('hospitalization')),
      'onset before hospitalisation must not be suggested: a hospital-acquired infection reverses it');

    assert.deepEqual(s.numericRangeRules.map(r => r.field), ['age'],
      'only ranges that hold regardless of setting should be suggested');
    const age = s.numericRangeRules[0];
    assert.equal(age.min, 0); assert.equal(age.max, 120);
    assert.ok(age.fieldLabel, 'a suggested range must carry a label so its message reads properly');
  }

  // 11. Suggested rules actually work when applied, and find real problems.
  {
    const cols = [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'onset_date', label: 'Onset', type: 'date' },
      { key: 'interview_date', label: 'Interview', type: 'date' },
      { key: 'age', label: 'Age', type: 'number' },
    ];
    const records = [
      { id: '1', onset_date: '2026-01-10', interview_date: '2026-01-05', age: 34 },
      { id: '2', onset_date: '2026-01-10', interview_date: '2026-01-12', age: 999 },
    ];
    const suggested = suggestQualityRules(cols);
    const before = runDataQualityChecks(records, cols, base);
    const after = runDataQualityChecks(records, cols, { ...base, ...suggested });

    assert.equal(of(before, 'date_order').length + of(before, 'numeric_range').length, 0,
      'without rules these checks find nothing, which is the gap');
    assert.equal(of(after, 'date_order').length, 1, 'the interview before onset is found');
    assert.equal(of(after, 'numeric_range').length, 1, 'the impossible age is found');
  }

  // 12. Age in months is not held to the same bounds as age in years.
  {
    const s = suggestQualityRules([{ key: 'age_months', label: 'Age (months)', type: 'number' }]);
    assert.equal(s.numericRangeRules.length, 1);
    assert.ok(s.numericRangeRules[0].max > 120,
      'age in months must not be capped at 120, which would flag every child over ten');
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dupOnly = { ...base, enabledChecks: ['duplicate'] };
  const dups = (records, cols, config = dupOnly) => of(runDataQualityChecks(records, cols, config), 'duplicate');

  // 13. The bundled sample datasets hold no duplicates, and the default
  //     check must say so. It used to raise 3 false pairs on the outbreak
  //     sample and 55 on the surveillance sample.
  {
    const demoBundle = path.join(tempDir, 'demoData.mjs');
    await build({
      entryPoints: [path.join(root, 'src/data/demoData.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: demoBundle, logLevel: 'silent',
    });
    const demo = await import(pathToFileURL(demoBundle).href);
    for (const [name, cols, records] of [
      ['outbreak', demo.demoColumns, demo.demoCaseRecords],
      ['nutrition', demo.nutritionDemoColumns, demo.nutritionDemoRecords],
      ['surveillance', demo.surveillanceDemoColumns, demo.surveillanceDemoRecords],
    ]) {
      assert.equal(dups(records, cols).length, 0, `the ${name} sample has no duplicates`);
    }
  }

  const lineList = [
    { key: 'case_id', label: 'Case ID', type: 'text' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'sex', label: 'Sex', type: 'categorical' },
    { key: 'village', label: 'Village', type: 'categorical' },
    { key: 'onset', label: 'Onset', type: 'date' },
    { key: 'hosp', label: 'Hospitalised', type: 'date' },
  ];
  // Enough distinct people that names and IDs read as the varied columns they are.
  const people = ['Amina Yusuf', 'John Otieno', 'Mary Wanjiru', 'Peter Mwangi', 'Ali Hassan', 'Grace Achieng', 'Musa Kamara', 'Fatou Diop'];
  const background = people.map((name, i) => ({
    id: `b${i}`, case_id: `C1${String(i).padStart(2, '0')}`, name, age: 20 + i * 7, sex: i % 2 ? 'M' : 'F',
    village: i % 3 ? 'Kibera' : 'Mathare', onset: `2025-03-${String(i + 2).padStart(2, '0')}`, hosp: '',
  }));

  // 14. Blanks are not evidence. Two people who were not cases, with the
  //     same sex and village, blank dates and different ages, are two people.
  {
    const records = [
      ...background,
      { id: 'x', case_id: 'C020', name: 'Zainab Bello', age: 25, sex: 'F', village: 'Kibera', onset: '', hosp: '' },
      { id: 'y', case_id: 'C088', name: 'Zainab Okoro', age: 31, sex: 'F', village: 'Kibera', onset: '', hosp: '' },
    ];
    assert.equal(dups(records, lineList).length, 0, 'shared blanks must not make two records similar');
  }

  // 15. What is a duplicate, in decreasing certainty.
  {
    const original = { case_id: 'C001', name: 'Halima Abdi', age: 34, sex: 'F', village: 'Kibera', onset: '2025-03-01', hosp: '2025-03-03' };
    const records = [
      ...background,
      { id: 'a', ...original },
      { id: 'a2', ...original },                                           // entered twice, same ID
      { id: 'c', ...original, case_id: 'C047' },                           // same person, second ID
      { id: 'd', ...original, case_id: 'C050', name: 'Halima Abdii' },     // and a slipped key
      { id: 'e', ...original, case_id: 'C051', hosp: '' },                 // and one incomplete
      { id: 'f', ...original, case_id: 'C052', age: 35 },                  // a different age: someone else
      { id: 'g', ...original, case_id: 'C053', name: 'Hussein Abdi' },     // a different name: someone else
      { id: 'h', case_id: 'C100', name: 'Entirely Different', age: 60, sex: 'M', village: 'Mathare', onset: '2025-03-20', hosp: '' }, // an ID used twice
    ];
    const found = dups(records, lineList);
    const group = (pred) => found.filter(pred).map(i => [...i.recordIds].sort());

    assert.deepEqual(group(i => i.severity === 'error'), [['a', 'a2']], 'identical records are an error');
    assert.deepEqual(group(i => /share Case ID/.test(i.message)), [['b0', 'h']], 'a repeated ID on different records is reported');
    const similar = found.filter(i => i.severity === 'warning' && !/share/.test(i.message));
    assert.equal(similar.length, 1);
    assert.deepEqual([...similar[0].recordIds].sort(), ['c', 'd', 'e'],
      'same person under another ID, a near-miss name, or an incomplete copy; not a different age or name');
    assert.ok(/Name/.test(similar[0].details), 'the issue says which field was only close');

    // With fuzzy matching off, records must be the same in every field.
    const exact = dups(records, lineList, { ...dupOnly, fuzzyMatching: { enabled: false, textThreshold: 0.85, dateTolerance: 0 } });
    assert.ok(!exact.some(i => i.recordIds.includes('d')), 'a near-miss name is not a match when fuzzy matching is off');
    assert.ok(!exact.some(i => i.recordIds.includes('e')), 'nor is a record with a field left blank');
    assert.ok(exact.some(i => i.severity === 'error' && i.recordIds.includes('a2')));

    // A date tolerance lets onset differ by that many days.
    const shifted = [...background, { id: 'a', ...original }, { id: 'z', ...original, case_id: 'C060', onset: '2025-03-02' }];
    assert.equal(dups(shifted, lineList).length, 0, 'one day apart is a different record by default');
    const tolerant = dups(shifted, lineList, { ...dupOnly, fuzzyMatching: { enabled: true, textThreshold: 0.85, dateTolerance: 1 } });
    assert.equal(tolerant.length, 1);
    assert.deepEqual([...tolerant[0].recordIds].sort(), ['a', 'z']);
  }

  // 16. A different house number is a different address, not a typo.
  {
    const cols = [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'address', label: 'Address', type: 'text' },
      { key: 'age', label: 'Age', type: 'number' },
    ];
    const records = [
      { id: '1', name: 'Halima Abdi', address: 'House 12 Kibera', age: 34 },
      { id: '2', name: 'Halima Abdi', address: 'House 47 Kibera', age: 34 },
      { id: '3', name: 'John Otieno', address: 'Plot 9 Mathare', age: 50 },
      { id: '4', name: 'Mary Wanjiru', address: 'Flat 3 Kawangware', age: 41 },
    ];
    assert.equal(dups(records, cols).length, 0);
  }

  // 17. Large datasets: rows are only called duplicates on every field apart
  //     from the ID. Comparing a subset of columns reported 1,200 distinct
  //     people as two blocks of 600 duplicates.
  {
    const cols = ['district', 'facility', 'sex', 'age_group', 'status', 'outcome', 'week', 'year', 'source', 'lab']
      .map(key => ({ key, label: key, type: 'categorical' }))
      .concat([{ key: 'patient_name', label: 'Patient name', type: 'text' }, { key: 'case_id', label: 'Case ID', type: 'text' }]);
    const row = (i) => ({
      id: String(i), district: 'North', facility: 'HC1', sex: i % 2 ? 'F' : 'M', age_group: '15-49', status: 'Confirmed',
      outcome: 'Alive', week: 'W12', year: '2025', source: 'IDSR', lab: 'Pos', patient_name: `Person ${i}`, case_id: `C${i}`,
    });
    const records = Array.from({ length: 2500 }, (_, i) => row(i));
    assert.equal(dups(records, cols).length, 0, 'distinct people in a large file are not duplicates');

    // The same person twice under two IDs is still found.
    const withCopy = [...records, { ...row(7), id: 'copy', case_id: 'C9999' }];
    const found = dups(withCopy, cols);
    assert.equal(found.length, 1);
    assert.deepEqual([...found[0].recordIds].sort(), ['7', 'copy']);
    assert.equal(found[0].severity, 'warning');
  }

  // 18. Date checks do not depend on the time zone. Details used to print a
  //     day early west of UTC; tomorrow was not "future" there; and east of
  //     UTC a date was "before" a time on the same day.
  {
    const rule = { id: 'r1', firstDateField: 'onset', secondDateField: 'hosp', firstDateLabel: 'Onset', secondDateLabel: 'Hospitalised' };
    const config = { ...base, enabledChecks: ['date_order'], dateOrderRules: [rule] };
    const records = [
      { id: 'order', onset: '2025-03-05', hosp: '2025-03-04' },
      { id: 'sameday-time', onset: '2025-03-04', hosp: '2025-03-04T00:30' },
      { id: 'sameday-time-2', onset: '2025-03-04T23:30', hosp: '2025-03-04' },
      { id: 'times', onset: '2025-03-04T10:00', hosp: '2025-03-04T09:00' },
      { id: 'fine', onset: '2025-03-04', hosp: '2025-03-05' },
    ];
    const order = of(runDataQualityChecks(records, columns, config, { dateFormat: 'DD/MM/YYYY' }), 'date_order');
    assert.deepEqual(order.map(i => i.recordIds[0]).sort(), ['order', 'times'],
      `a date and a time on that date are the same day (TZ=${tz})`);
    assert.equal(order.find(i => i.recordIds[0] === 'order').details, 'Onset: 05/03/2025, Hospitalised: 04/03/2025',
      `details show the stored days, in the user's format (TZ=${tz})`);
    const usDetails = of(runDataQualityChecks(records.slice(0, 1), columns, config, { dateFormat: 'MM/DD/YYYY' }), 'date_order');
    assert.equal(usDetails[0].details, 'Onset: 03/05/2025, Hospitalised: 03/04/2025');

    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const future = of(runDataQualityChecks(
      [{ id: 'today', onset: localIso(today) }, { id: 'tomorrow', onset: localIso(tomorrow) },
       { id: 'tonight', onset: `${localIso(today)}T23:59` }],
      columns, base), 'future_date');
    assert.equal(future.length, 1, `TZ=${tz}`);
    assert.deepEqual(future[0].recordIds, ['tomorrow'], `tomorrow is the future and today is not, in every zone (TZ=${tz})`);
  }

  // 19. A value in a date column that is not a date is reported. It is not
  //     read month-first, and so cannot raise a false order or future issue.
  {
    const rule = { id: 'r1', firstDateField: 'onset', secondDateField: 'hosp', firstDateLabel: 'Onset', secondDateLabel: 'Hospitalised' };
    const records = [
      { id: 'ok', onset: '2025-04-01', hosp: '2025-04-20' },
      { id: 'dmy', onset: '05/04/2025', hosp: '2025-04-20' },   // 5 April; month-first it is 4 May, "after" the 20th
      { id: 'far', onset: '15/03/2099', hosp: '' },
      { id: 'note', onset: 'see notes', hosp: '' },
      { id: 'blank', onset: '', hosp: '' },
    ];
    const issues = runDataQualityChecks(records, columns, { ...base, enabledChecks: ['date_order'], dateOrderRules: [rule] });
    const unreadable = issues.filter(i => /cannot be read as a date/.test(i.message));
    assert.equal(unreadable.length, 1);
    assert.deepEqual(unreadable[0].recordIds.sort(), ['dmy', 'far', 'note']);
    assert.equal(unreadable[0].field, 'onset');
    assert.ok(/05\/04\/2025/.test(unreadable[0].details));
    assert.equal(issues.filter(i => /before/.test(i.message)).length, 0, 'an unreadable date is not guessed at');
    assert.equal(of(issues, 'future_date').length, 0);
  }

  console.log('dataQuality regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
