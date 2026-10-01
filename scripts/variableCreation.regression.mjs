/**
 * Derived variables.
 *
 * These feed straight into the epi curves, tables and 2x2 analyses that are
 * already validated, so an error here propagates exactly the way an import
 * error does: everything downstream stays correct and the answer is still
 * wrong.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-var-test-'));
const bundled = path.join(tempDir, 'variableCreation.mjs');

const cfg = (over = {}) => ({
  name: 'age_group', label: 'Age group', method: 'categorize',
  sourceColumn: 'age', categories: [], ...over,
});

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/variableCreation.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { categorizeVariable, evaluateFormula, validateVariableConfig, toVariableName } =
    await import(pathToFileURL(bundled).href);

  // 1. Binning assigns each value to the band it belongs in, and the endpoints
  //    behave as the labels imply for non-overlapping ranges.
  {
    const records = [0, 4, 5, 17, 18, 64, 65, 99].map((age, i) => ({ id: String(i), age }));
    const categories = [
      { label: '0-4', min: 0, max: 4 },
      { label: '5-17', min: 5, max: 17 },
      { label: '18-64', min: 18, max: 64 },
      { label: '65+', min: 65, max: null },
    ];
    assert.deepEqual(
      categorizeVariable(records, 'age', categories, 'number'),
      ['0-4', '0-4', '5-17', '5-17', '18-64', '18-64', '65+', '65+'],
      'each age must land in its own band'
    );
  }

  // 2. Missing values stay missing rather than becoming a category. Counting a
  //    blank age as "0-4" would inflate the youngest band.
  {
    const records = [{ id: '1', age: '' }, { id: '2', age: null }, { id: '3', age: 'abc' }];
    const categories = [{ label: '0-4', min: 0, max: 4 }];
    assert.deepEqual(
      categorizeVariable(records, 'age', categories, 'number'),
      ['', '', ''],
      'blank, null and unparseable values must not be binned'
    );
  }

  // 3. A value outside every band is reported rather than silently dropped.
  {
    const out = categorizeVariable([{ id: '1', age: 200 }], 'age',
      [{ label: '0-4', min: 0, max: 4 }], 'number');
    assert.deepEqual(out, ['Other'], 'an out-of-range value becomes Other');
  }

  // 4. Overlapping ranges are refused. They are resolved by first match, so
  //    "0-18" and "18-65" put every 18-year-old in the first band while the
  //    resulting distribution still looks plausible.
  {
    const err = validateVariableConfig(cfg({
      categories: [
        { label: '0-18', min: 0, max: 18 },
        { label: '18-65', min: 18, max: 65 },
      ],
    }), []);
    assert.ok(err && /overlap/i.test(err), `overlapping ranges should be reported, got ${err}`);

    const ok = validateVariableConfig(cfg({
      categories: [
        { label: '0-17', min: 0, max: 17 },
        { label: '18-65', min: 18, max: 65 },
      ],
    }), []);
    assert.equal(ok, null, 'adjacent, non-overlapping ranges are fine');
  }

  // 5. A reversed range can never match, so it is refused rather than silently
  //    producing an empty category.
  {
    const err = validateVariableConfig(cfg({
      categories: [{ label: 'bad', min: 50, max: 10 }],
    }), []);
    assert.ok(err && /never match|minimum above/i.test(err), `a reversed range should be reported, got ${err}`);
  }

  // 6. Formula results keep their magnitude. Rounding to two decimal places
  //    turned a small rate into zero, so a derived rate column read as 0 for
  //    every sparse area.
  {
    const rate = evaluateFormula({ cases: 3, population: 12000 }, '{cases} / {population}');
    assert.ok(Math.abs(rate - 0.00025) < 1e-12, `expected 0.00025, got ${rate}`);

    const bmi = evaluateFormula({ weight: 70, height: 1.75 }, '{weight} / ({height} * {height})');
    assert.ok(Math.abs(bmi - 22.857142857) < 1e-6, `expected about 22.857, got ${bmi}`);

    // Binary floating-point noise is still cleaned up.
    assert.equal(evaluateFormula({ a: 0.1, b: 0.2 }, '{a} + {b}'), 0.3);
  }

  // 7. A missing input yields no result rather than a number derived from a gap.
  for (const rec of [{ a: null, b: 5 }, { a: '', b: 5 }, { a: undefined, b: 5 }]) {
    assert.equal(evaluateFormula(rec, '{a} + {b}'), '',
      'a formula over a missing value must not produce a number');
  }

  // 8. Division by zero produces no value rather than Infinity.
  assert.equal(evaluateFormula({ a: 5, b: 0 }, '{a} / {b}'), '');

  // 9. Anything that is not arithmetic is rejected. Values are substituted into
  //    the expression before it is checked, so a hostile cell must not slip
  //    through into evaluation.
  for (const rec of [{ a: 'alert(1)' }, { a: 'process.exit' }, { a: '1;DROP' }]) {
    assert.equal(evaluateFormula(rec, '{a} + 1'), '',
      'a non-arithmetic substituted value must be refused');
  }

  // 10. Reserved and malformed names are refused, since a variable called id
  //     would overwrite the record identifier.
  {
    assert.ok(validateVariableConfig(cfg({ name: 'id', method: 'copy' }), []),
      '"id" must be reserved');
    assert.ok(validateVariableConfig(cfg({ name: '2bad', method: 'copy' }), []),
      'a name starting with a digit must be refused');
    assert.ok(validateVariableConfig(cfg({ name: 'age', method: 'copy' }),
      [{ key: 'age', label: 'Age', type: 'number' }]), 'a duplicate name must be refused');
  }

  // 11. Label to variable name conversion is stable and safe to use as a key.
  {
    assert.equal(toVariableName('Age Group (years)'), 'age_group_years');
    assert.ok(/^[a-z][a-z0-9_]*$/.test(toVariableName('  Weird!! Name 42 ')),
      'generated names must be valid keys');
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // 12. Whole-unit groups take the values between them. "0-4" then "5-17"
  //     left 4.5 belonging to neither, and it became "Other".
  {
    const ages = [
      { label: '0-4 years', min: 0, max: 4 },
      { label: '5-17 years', min: 5, max: 17 },
      { label: '18-49 years', min: 18, max: 49 },
      { label: '50+ years', min: 50, max: 999 },
    ];
    const values = [0, 4, 4.5, 4.99, 5, 17.5, 49.9, 50, 999, 1000, -1];
    assert.deepEqual(
      categorizeVariable(values.map((age, i) => ({ id: String(i), age })), 'age', ages, 'number'),
      ['0-4 years', '0-4 years', '0-4 years', '0-4 years', '5-17 years', '5-17 years', '18-49 years',
        '50+ years', '50+ years', 'Other', 'Other'],
      'a child of four and a half is in the 0-4 group; beyond the last group and below the first is Other'
    );

    const fever = [{ label: 'Normal', min: 0, max: 37.4 }, { label: 'Fever', min: 37.5, max: 50 }];
    assert.deepEqual(
      categorizeVariable([36.6, 37.4, 37.45, 37.5, 98.6].map((t, i) => ({ id: String(i), t })), 't', fever, 'number'),
      ['Normal', 'Normal', 'Normal', 'Fever', 'Other'],
      '37.45 is below the fever threshold; a Fahrenheit reading is in no group'
    );

    // A gap wider than one unit is a range the user left out, and stays out.
    const gappy = [{ label: '0-4', min: 0, max: 4 }, { label: '18-49', min: 18, max: 49 }];
    assert.deepEqual(
      categorizeVariable([{ id: '1', age: 10 }, { id: '2', age: 4.5 }], 'age', gappy, 'number'),
      ['Other', 'Other']
    );
  }

  // 13. Recoding by value: a category lists the values it takes. Without a
  //     way to list them, every text value became "Other".
  {
    const records = ['Confirmed', 'probable ', 'Suspected', 'Not a case', '', null, 'Discarded']
      .map((status, i) => ({ id: String(i), status }));
    const categories = [
      { label: 'Case', values: ['Confirmed', 'Probable', 'Suspected'] },
      { label: 'Non-case', values: ['Not a case'] },
    ];
    assert.deepEqual(
      categorizeVariable(records, 'status', categories, 'categorical'),
      ['Case', 'Case', 'Case', 'Non-case', '', '', 'Other'],
      'matching ignores case and stray spaces; blank stays blank; an unlisted value is Other'
    );
    assert.ok(/no range and no values/.test(validateVariableConfig(cfg({
      sourceColumn: 'status', categories: [{ label: 'Case' }, { label: 'Non-case', values: ['Not a case'] }],
    }), [])), 'a category nothing can fall into is refused');
    assert.equal(validateVariableConfig(cfg({ sourceColumn: 'status', categories }), []), null);
  }

  // 14. An age column imported as text because of "<1": the numbers are
  //     still ranged, the odd values placed by listing them, and "6 months"
  //     is not read as 6.
  {
    const records = ['34', '4', '<1', '6 months', '17.5', 'unknown'].map((age, i) => ({ id: String(i), age }));
    const categories = [
      { label: '0-4', min: 0, max: 4, values: ['<1', '6 months'] },
      { label: '5-17', min: 5, max: 17 },
      { label: '18+', min: 18, max: 150 },
    ];
    assert.deepEqual(
      categorizeVariable(records, 'age', categories, 'text'),
      ['18+', '0-4', '0-4', '0-4', '5-17', 'Other']
    );
    assert.deepEqual(
      categorizeVariable([{ id: '1', age: '6 months' }], 'age', [{ label: '5-17', min: 5, max: 17 }], 'text'),
      ['Other'], '"6 months" must not be read as the number 6');
  }

  // 15. Dates in formulas. Subtracting two dates gives the days between
  //     them. They used to be pasted in as text, where 2025-03-10 minus
  //     2025-03-01 is the sum 2025 - 3 - 10 - 2025 - 3 - 1 = -17.
  {
    const delay = (onset, report) => evaluateFormula({ onset, report }, '{report} - {onset}');
    assert.equal(delay('2025-03-01', '2025-03-10'), 9, `TZ=${tz}`);
    assert.equal(delay('2025-03-28', '2025-04-02'), 5, `TZ=${tz}`);
    assert.equal(delay('2025-03-10', '2025-03-01'), -9, 'the sign says which came first');
    assert.equal(delay('2024-02-28', '2024-03-01'), 2, 'leap day');
    // Across the daylight-saving changes of Europe, the US and New Zealand.
    assert.equal(delay('2025-03-29', '2025-03-31'), 2, `TZ=${tz}`);
    assert.equal(delay('2025-03-08', '2025-03-10'), 2, `TZ=${tz}`);
    assert.equal(delay('2025-04-05', '2025-04-07'), 2, `TZ=${tz}`);
    assert.equal(delay('2024-12-31', '2025-01-01'), 1);
    // Times count as fractions of a day.
    assert.equal(delay('2025-03-01T06:00', '2025-03-01T18:00'), 0.5);
    assert.equal(delay('2025-03-01', '2025-03-02T12:00'), 1.5);
    // The difference is a number and can be used as one.
    assert.equal(evaluateFormula({ a: '2025-03-01', b: '2025-03-15' }, '({b} - {a}) / 7'), 2);
    assert.equal(evaluateFormula({ a: '2025-03-01', b: '2025-03-15' }, '{b} - {a} + 1'), 15);

    // A missing date gives no result, as any missing input does.
    assert.equal(delay('', '2025-03-10'), '');
    assert.equal(delay(null, '2025-03-10'), '');
    // A value that is not a readable date gives no result. It must not be
    // divided through as 15 / 3 / 2025.
    assert.equal(delay('15/03/2025', '2025-03-20'), '');
    assert.equal(evaluateFormula({ a: '15/03/2025' }, '{a} + 1'), '');
    // A date on its own, or with a number added, is still a date; this
    // makes numbers, so it gives nothing rather than a day count from 1970.
    assert.equal(evaluateFormula({ a: '2025-03-01' }, '{a}'), '');
    assert.equal(evaluateFormula({ a: '2025-03-01' }, '{a} + 5'), '');
    assert.equal(evaluateFormula({ a: '2025-03-01', b: '2025-03-05' }, '{a} + {b}'), '');
    assert.equal(evaluateFormula({ a: '2025-03-01', b: 2 }, '{a} * {b}'), '');
    assert.equal(evaluateFormula({ a: '22:00' }, '{a} + 1'), '', 'a clock time is not a number');
    assert.equal(evaluateFormula({ a: true }, '{a} + 1'), '');
  }

  // 16. Arithmetic that already worked still does, with operands in place.
  {
    assert.equal(evaluateFormula({ a: 3, b: -5 }, '{a} - {b}'), 8);
    assert.equal(evaluateFormula({ a: 3, b: -5 }, '{a} * {b}'), -15);
    assert.equal(evaluateFormula({ a: 3, b: 4 }, '-({a} + {b}) * 2'), -14);
    assert.equal(evaluateFormula({ a: '12,5', b: 2 }, '{a} * {b}'), 25, 'a number stored as text with a decimal comma');
    assert.equal(evaluateFormula({ a: 4 }, '{a} * 2,5', { decimalSeparator: ',', thousandsSeparator: '.' }), 10);
    assert.equal(evaluateFormula({ a: 1e-7, b: 2 }, '{a} * {b}'), 2e-7, 'very small numbers are numbers');
    assert.equal(evaluateFormula({ '2nd_dose': 3 }, '{2nd_dose} + 1'), 4, 'a column key may start with a digit');
    assert.equal(evaluateFormula({ a: 1 }, '{a} +'), '');
    assert.equal(evaluateFormula({ a: 1 }, '({a} + 1'), '');
    assert.equal(evaluateFormula({ a: 1 }, '{a b} + 1'), '');
    assert.equal(evaluateFormula({ a: 1 }, '{zzz} + 1'), '', 'an unknown variable is a missing input');
  }

  console.log('variableCreation regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
