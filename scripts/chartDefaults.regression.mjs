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

  console.log('chartDefaults regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
