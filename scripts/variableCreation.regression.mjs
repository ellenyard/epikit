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

  console.log('variableCreation regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
