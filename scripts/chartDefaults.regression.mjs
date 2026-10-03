import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-chartdefaults-test-'));
const bundled = path.join(tempDir, 'chartDefaults.mjs');

const makeDataset = (columns, records) => ({
  id: 'test', name: 'test', source: 'form', columns, records,
  createdAt: '', updatedAt: '',
});

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/chartDefaults.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { pickCategoryColumn, pickNumericColumn, resolveColumnChoice, MAX_AUTO_CATEGORIES } =
    await import(pathToFileURL(bundled).href);

  // 1. A true grouping variable is preferred over a two-value column.
  {
    const ds = makeDataset(
      [
        { key: 'sex', label: 'Sex', type: 'categorical' },
        { key: 'status', label: 'Case Status', type: 'categorical' },
      ],
      Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        sex: i % 2 ? 'M' : 'F',
        status: ['Confirmed', 'Probable', 'Suspected'][i % 3],
      })),
    );
    assert.equal(pickCategoryColumn(ds), 'status',
      'a 3-value grouping column should win over a 2-value one');
  }

  // 2. The regression this guards: an ID-like text column must never be picked.
  //    Auto-selecting it draws one mark per record and hangs the tab.
  {
    const ds = makeDataset(
      [
        { key: 'caseId', label: 'Case ID', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'text' },
        { key: 'site', label: 'Site', type: 'text' },
      ],
      Array.from({ length: 400 }, (_, i) => ({
        id: String(i),
        caseId: `CASE-${i}`,
        notes: `note ${i}`,
        site: ['North', 'South', 'East', 'West'][i % 4],
      })),
    );
    assert.equal(pickCategoryColumn(ds), 'site',
      'must skip the 400-distinct ID columns and take the 4-value one');
  }

  // 3. Nothing suitable returns '', leaving the picker prompt rather than
  //    drawing thousands of marks.
  {
    const ds = makeDataset(
      [{ key: 'caseId', label: 'Case ID', type: 'text' }],
      Array.from({ length: 200 }, (_, i) => ({ id: String(i), caseId: `C-${i}` })),
    );
    assert.equal(pickCategoryColumn(ds), '', 'no suitable column should yield an empty pick');
  }

  // 4. The bound is applied at its stated edge.
  {
    const atLimit = makeDataset(
      [{ key: 'g', label: 'G', type: 'categorical' }],
      Array.from({ length: 500 }, (_, i) => ({ id: String(i), g: `g${i % MAX_AUTO_CATEGORIES}` })),
    );
    assert.equal(pickCategoryColumn(atLimit), 'g', `${MAX_AUTO_CATEGORIES} distinct values is allowed`);

    const overLimit = makeDataset(
      [{ key: 'g', label: 'G', type: 'categorical' }],
      Array.from({ length: 500 }, (_, i) => ({ id: String(i), g: `g${i % (MAX_AUTO_CATEGORIES + 1)}` })),
    );
    assert.equal(pickCategoryColumn(overLimit), '', `${MAX_AUTO_CATEGORIES + 1} distinct values is rejected`);
  }

  // 5. Numeric pick.
  {
    const ds = makeDataset(
      [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'age', label: 'Age', type: 'number' },
      ],
      [{ id: '1', name: 'a', age: 3 }],
    );
    assert.equal(pickNumericColumn(ds), 'age');
    assert.equal(pickNumericColumn(makeDataset([{ key: 'n', label: 'N', type: 'text' }], [])), '');
  }

  // 6. A user's choice wins while valid, and falls back once it is not, which is
  //    what makes switching datasets re-pick automatically.
  {
    const ds = makeDataset(
      [
        { key: 'status', label: 'Status', type: 'categorical' },
        { key: 'site', label: 'Site', type: 'categorical' },
        { key: 'age', label: 'Age', type: 'number' },
      ],
      [{ id: '1', status: 'a', site: 'x', age: 1 }],
    );
    assert.equal(resolveColumnChoice(ds, 'site', 'status'), 'site', 'a valid choice is kept');
    assert.equal(resolveColumnChoice(ds, 'gone', 'status'), 'status', 'a stale choice falls back');
    assert.equal(resolveColumnChoice(ds, '', 'status'), 'status', 'no choice uses the auto pick');
    assert.equal(resolveColumnChoice(ds, 'status', 'age', true), 'age',
      'a non-numeric choice falls back when a number is required');
    assert.equal(resolveColumnChoice(ds, 'age', '', true), 'age', 'a numeric choice is kept');
  }

  // 7. Distinct values are counted the way the charts draw them. Untrimmed, a
  //    two-value column with stray spaces looked like a true grouping variable
  //    and was preferred over one that really had three values.
  {
    const ds = makeDataset(
      [
        { key: 'sex', label: 'Sex', type: 'categorical' },
        { key: 'status', label: 'Status', type: 'categorical' },
      ],
      [
        { id: '1', sex: 'Female', status: 'Confirmed' },
        { id: '2', sex: ' Female', status: 'Probable' },
        { id: '3', sex: 'Male ', status: 'Suspected' },
        { id: '4', sex: 'Male', status: 'Confirmed' },
        { id: '5', sex: '  ', status: 'Probable' },
      ],
    );
    assert.equal(pickCategoryColumn(ds), 'status',
      'Sex has two values once trimmed, so the three-value column is the better default');
  }

  // 8. The first drawing of each multi-variable chart on the bundled samples.
  //    Nine of the twelve charts used to open blank and ask for two or three
  //    variables; each now opens on a sensible pair when the dataset has one,
  //    and stays blank (never absurd) when it has not.
  {
    const demoBundled = path.join(tempDir, 'demoData.mjs');
    await build({
      entryPoints: [path.join(root, 'src/data/demoData.ts')],
      bundle: true, format: 'esm', platform: 'node',
      outfile: demoBundled, logLevel: 'silent',
    });
    const demo = await import(pathToFileURL(demoBundled).href);
    const picks = await import(pathToFileURL(bundled).href);
    const outbreak = makeDataset(demo.demoColumns, demo.demoCaseRecords);
    const nutrition = makeDataset(demo.nutritionDemoColumns, demo.nutritionDemoRecords);
    const surveillance = makeDataset(demo.surveillanceDemoColumns, demo.surveillanceDemoRecords);

    assert.deepEqual(picks.pickGroupedPair(outbreak), { category: 'case_status', group: 'sex' }, 'outbreak grouped bar');
    assert.deepEqual(picks.pickGroupedPair(nutrition), { category: 'age_group', group: 'sex' }, 'nutrition grouped bar');
    assert.deepEqual(picks.pickGroupedPair(surveillance), { category: 'year', group: 'disease' },
      'with no two-value column the grouped bar splits by the column with the fewest values');

    assert.deepEqual(picks.pickPyramidPair(outbreak), { category: '', group: '' }, 'no age bands in the outbreak list: no pyramid');
    assert.deepEqual(picks.pickPyramidPair(nutrition), { category: 'age_group', group: 'sex' }, 'nutrition pyramid');
    assert.deepEqual(picks.pickPyramidPair(surveillance), { category: '', group: '' }, 'no pyramid of a surveillance extract');

    assert.deepEqual(picks.pickTargetPair(outbreak), { actual: '', target: '' }, 'the outbreak list has no target column');
    assert.deepEqual(picks.pickTargetPair(nutrition), { actual: 'vitamin_a_coverage_pct', target: 'target_vitamin_a' }, 'nutrition bullet');
    assert.deepEqual(picks.pickTargetPair(surveillance), { actual: 'reporting_completeness', target: 'target_completeness' }, 'surveillance bullet');

    assert.deepEqual(picks.pickHeatmapPair(surveillance), { row: 'district', col: 'month_name' }, 'a surveillance heatmap is place by season');
    assert.equal(picks.pickHeatmapPair(outbreak).row, 'case_status', 'outbreak heatmap rows');
    assert.equal(picks.pickHeatmapPair(nutrition).row, 'age_group', 'nutrition heatmap rows');

    assert.deepEqual(picks.pickPeriodColumn(outbreak), { column: '', start: '', end: '' }, 'no period column in a line list');
    assert.deepEqual(picks.pickPeriodColumn(nutrition), { column: 'survey_year', start: '2020', end: '2025' }, 'nutrition slope periods');
    assert.deepEqual(picks.pickPeriodColumn(surveillance), { column: 'year', start: '2022', end: '2025' }, 'surveillance slope periods');
    assert.equal(picks.pickSlopeCategory(surveillance, 'year'), 'district', 'surveillance slope category');

    assert.equal(picks.pickWaffleColumn(outbreak), 'sex', 'outbreak waffle');
    assert.equal(picks.pickDateColumn(outbreak), 'onset_date', 'outbreak line chart x-axis');
    assert.equal(picks.pickDateColumn(surveillance), 'report_date', 'surveillance line chart x-axis');
  }

  console.log('chartDefaults regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
