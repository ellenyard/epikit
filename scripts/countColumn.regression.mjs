/**
 * Recognising a column of case counts in aggregated data.
 *
 * The tools counted rows. On a surveillance extract that is the number of
 * reports, not cases, so the first chart a user saw was four identical bars.
 * The count column has to be found when it is there, and must not be invented
 * when the data are one row per case.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-count-column-test-'));
const bundled = path.join(tempDir, 'countColumn.mjs');
const demoBundled = path.join(tempDir, 'demoData.mjs');

const col = (key, label, type = 'number') => ({ key, label, type });
const rows = (key, values) => values.map((v, i) => ({ id: String(i), [key]: v }));

try {
  await build({ entryPoints: [path.join(root, 'src/utils/countColumn.ts')], bundle: true, format: 'esm', platform: 'node', outfile: bundled, logLevel: 'silent' });
  await build({ entryPoints: [path.join(root, 'src/data/demoData.ts')], bundle: true, format: 'esm', platform: 'node', outfile: demoBundled, logLevel: 'silent' });
  const { findCountColumn, countColumnCandidates } = await import(pathToFileURL(bundled).href);
  const demo = await import(pathToFileURL(demoBundled).href);

  const found = (columns, records) => findCountColumn(columns, records)?.key ?? null;

  // 1. The bundled samples. The surveillance extract has a count column among
  //    several numeric columns that are not counts of cases; the two record-
  //    level samples have none.
  assert.equal(found(demo.surveillanceDemoColumns, demo.surveillanceDemoRecords), 'cases',
    'the surveillance sample counts cases in "Cases Reported", not deaths, population or a rate');
  assert.equal(found(demo.demoColumns, demo.demoCaseRecords), null, 'the outbreak line list is one row per person');
  assert.equal(found(demo.nutritionDemoColumns, demo.nutritionDemoRecords), null, 'the nutrition survey is one row per child');

  // 2. Names a count column goes by, including outside English.
  for (const [key, label] of [
    ['cases', 'Cases'], ['n_cases', 'n_cases'], ['case_count', 'Case count'], ['new_cases', 'New cases'],
    ['total_cases', 'Total Cases'], ['cas', 'Cas'], ['nombre_de_cas', 'Nombre de cas'], ['casos', 'Casos'],
    ['count', 'Count'], ['n', 'n'],
  ]) {
    assert.equal(found([col(key, label)], rows(key, [3, 0, 12, 7])), key, `"${label}" holds counts`);
  }

  // 3. Numeric columns that mention cases but are not a count of them.
  for (const [key, label] of [
    ['case_rate', 'Case rate'], ['cases_per_100k', 'Cases per 100,000'], ['pct_cases', 'Percent of cases'],
    ['case_id', 'Case ID'], ['incidence', 'Incidence'], ['population', 'Population'], ['age', 'Age'],
    ['target_cases', 'Target cases'], ['deaths', 'Deaths'], ['case_fatality_rate', 'Case Fatality Rate (%)'],
    ['total_facilities', 'Total Facilities'], ['household_number', 'Household number'], ['num_doses', 'Number of doses'],
  ]) {
    assert.equal(found([col(key, label)], rows(key, [3, 0, 12, 7])), null, `"${label}" is not a count of cases`);
  }

  // 4. Content matters as much as the name.
  assert.equal(found([col('case', 'Case')], rows('case', [1, 0, 1, 1])), null,
    'a 0/1 indicator in a line list is not a count column');
  assert.equal(found([col('cases', 'Cases')], rows('cases', [1.5, 2, 3])), null, 'fractions are not counts');
  assert.equal(found([col('cases', 'Cases')], rows('cases', [-1, 2, 3])), null, 'negative values are not counts');
  assert.equal(found([col('cases', 'Cases', 'text')], rows('cases', ['3', '4'])), null, 'a text column is not used');
  assert.equal(found([col('cases', 'Cases')], rows('cases', [null, '', 4, 0])), 'cases', 'blanks do not disqualify a column');
  assert.equal(found([col('cases', 'Cases')], rows('cases', [null, null])), null, 'an empty column is not a count column');

  // 5. A column named for cases is preferred to one merely named "count".
  {
    const columns = [col('count', 'Count'), col('cases', 'Cases')];
    const records = [{ id: '1', count: 5, cases: 9 }, { id: '2', count: 2, cases: 4 }];
    assert.equal(found(columns, records), 'cases');
  }

  // 6. What the picker offers: whole-number columns that are not named for
  //    something else. Every numeric column used to be listed, so "Age" and
  //    "Latitude" were offered as counts of cases.
  {
    const offered = (columns, records) => countColumnCandidates(columns, records).map(c => c.key);
    assert.deepEqual(offered(demo.demoColumns, demo.demoCaseRecords), [],
      'the outbreak line list has no column that could be a count');
    assert.deepEqual(offered(demo.surveillanceDemoColumns, demo.surveillanceDemoRecords),
      ['cases', 'deaths', 'facilities_reporting', 'total_facilities'],
      'counts are offered; rates, population and targets are not');
    const nutrition = offered(demo.nutritionDemoColumns, demo.nutritionDemoRecords);
    assert.ok(!nutrition.includes('age_months') && !nutrition.includes('weight_kg') && !nutrition.includes('whz'),
      `ages and measurements are not offered: ${nutrition.join(', ')}`);
  }

  console.log('countColumn regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
