/**
 * Shared chart aggregation.
 *
 * Counting records while requiring a value in an unrelated column has now been
 * found three times in this codebase: in the dot plot, in the 2x2 exposure
 * loop, and latently here. Each time it undercounts silently and the resulting
 * chart looks entirely plausible.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-agg-test-'));
const bundled = path.join(tempDir, 'chartAggregation.mjs');

const by = (rows, cat) => rows.find(r => r.category === cat);

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/chartAggregation.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { aggregateByCategory, aggregatePairByCategory, countByCategoryAndGroup } =
    await import(pathToFileURL(bundled).href);

  // North: values 10, 20, 30 plus two records with no value at all.
  // South: values 5, 15.
  const records = [
    { id: '1', site: 'North', score: 10 },
    { id: '2', site: 'North', score: 20 },
    { id: '3', site: 'North', score: 30 },
    { id: '4', site: 'North', score: '' },
    { id: '5', site: 'North', score: null },
    { id: '6', site: 'South', score: 5 },
    { id: '7', site: 'South', score: 15 },
    { id: '8', site: '', score: 99 },      // no category: excluded entirely
  ];

  // 1. Counting counts records, including those missing the value column,
  //    which the count does not read.
  {
    const rows = aggregateByCategory(records, 'site', 'score', 'count');
    assert.equal(by(rows, 'North').value, 5, 'all five North records should be counted');
    assert.equal(by(rows, 'South').value, 2);
    assert.equal(rows.length, 2, 'a record with no category is not its own group');
  }

  // 2. Mean, sum, min and max read only the values that exist. A blank is not
  //    a zero: counting it would drag the mean down.
  {
    const mean = aggregateByCategory(records, 'site', 'score', 'mean');
    assert.equal(by(mean, 'North').value, 20, 'mean of 10, 20, 30 ignoring blanks');
    assert.equal(by(mean, 'South').value, 10);

    assert.equal(by(aggregateByCategory(records, 'site', 'score', 'sum'), 'North').value, 60);
    assert.equal(by(aggregateByCategory(records, 'site', 'score', 'min'), 'North').value, 10);
    assert.equal(by(aggregateByCategory(records, 'site', 'score', 'max'), 'North').value, 30);
  }

  // 3. A category whose values are all missing still reports its record count,
  //    and reports zero rather than Infinity for min and max.
  {
    const allBlank = [
      { id: '1', site: 'East', score: '' },
      { id: '2', site: 'East', score: null },
    ];
    assert.equal(by(aggregateByCategory(allBlank, 'site', 'score', 'count'), 'East').value, 2);
    for (const mode of ['mean', 'sum', 'min', 'max']) {
      const v = by(aggregateByCategory(allBlank, 'site', 'score', mode), 'East').value;
      assert.ok(Number.isFinite(v), `${mode} should be finite with no values, got ${v}`);
    }
  }

  // 4. The paired form tracks each column separately, so a record missing one
  //    endpoint still contributes to the other.
  {
    const paired = [
      { id: '1', site: 'North', before: 10, after: 20 },
      { id: '2', site: 'North', before: 30, after: '' },
      { id: '3', site: 'South', before: 5, after: 7 },
    ];
    const rows = aggregatePairByCategory(paired, 'site', 'before', 'after', 'mean');
    assert.equal(by(rows, 'North').valueA, 20, 'before averages 10 and 30');
    assert.equal(by(rows, 'North').valueB, 20, 'after averages only the value present');
    assert.equal(by(rows, 'South').valueA, 5);
  }

  // 5. A category with no usable value on one side is dropped, since a slope
  //    or bullet needs both ends. Documented here because it happens silently.
  {
    const oneSided = [
      { id: '1', site: 'North', before: 10, after: 20 },
      { id: '2', site: 'Ghost', before: 5, after: '' },
    ];
    const rows = aggregatePairByCategory(oneSided, 'site', 'before', 'after', 'mean');
    assert.deepEqual(rows.map(r => r.category), ['North'],
      'a category lacking one endpoint is omitted from a paired chart');
  }

  // 6. Cross-tabulated counting covers every observed combination and counts
  //    each record exactly once.
  {
    const rows = countByCategoryAndGroup(
      [
        { id: '1', site: 'North', sex: 'F' },
        { id: '2', site: 'North', sex: 'F' },
        { id: '3', site: 'North', sex: 'M' },
        { id: '4', site: 'South', sex: 'M' },
      ],
      'site', 'sex'
    );
    const total = rows.reduce((s, r) =>
      s + Object.values(r).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0), 0);
    assert.equal(total, 4, 'every record counted exactly once, none twice');
  }

  console.log('chartAggregation regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
