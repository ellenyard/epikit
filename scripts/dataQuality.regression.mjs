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
const iso = d => d.toISOString().slice(0, 10);

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/dataQuality.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { runDataQualityChecks, getDefaultConfig, getCheckName } =
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

  console.log('dataQuality regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
