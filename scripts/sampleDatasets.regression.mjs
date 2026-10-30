/**
 * Sample datasets load on demand.
 *
 * A first visit used to receive all three samples, so the app home could never
 * show a newcomer an empty "Your data" list and the way in through the
 * tutorial. These checks pin down when samples are and are not added, and that
 * a browser which already holds samples keeps them.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-samples-test-'));
const bundled = path.join(tempDir, 'sampleDatasets.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/data/sampleDatasets.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    prepareStartingDatasets, createSampleDataset, sampleSize,
    OUTBREAK_SAMPLE_ID, NUTRITION_SAMPLE_ID, SURVEILLANCE_SAMPLE_ID,
  } = await import(pathToFileURL(bundled).href);

  const own = {
    id: 'mine', name: 'My line list', source: 'import',
    columns: [{ key: 'id', label: 'ID', type: 'text' }],
    records: [{ id: 'r1', id_: 'A' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const ids = (list) => list.map((d) => d.id);

  // A first visit starts with nothing.
  assert.deepEqual(prepareStartingDatasets(null, false), []);
  assert.deepEqual(prepareStartingDatasets(null, true), []);

  // A sample link on a first visit adds only that sample.
  assert.deepEqual(ids(prepareStartingDatasets(null, false, SURVEILLANCE_SAMPLE_ID)), [SURVEILLANCE_SAMPLE_ID]);

  // A browser with only its own data gets no samples, whatever the version.
  assert.deepEqual(ids(prepareStartingDatasets([own], false)), ['mine']);
  assert.deepEqual(ids(prepareStartingDatasets([own], true)), ['mine']);

  // A sample the browser already holds is kept, and its place in the list too.
  const oldOutbreak = { ...createSampleDataset(OUTBREAK_SAMPLE_ID), records: [], name: 'Old copy' };
  const kept = prepareStartingDatasets([own, oldOutbreak], true);
  assert.deepEqual(ids(kept), ['mine', OUTBREAK_SAMPLE_ID]);
  assert.equal(kept[1].name, 'Old copy', 'a current sample is left as it is');

  // An out-of-date sample is replaced in place by the current one; nothing
  // else is added, and the user's own data is untouched.
  const refreshed = prepareStartingDatasets([own, oldOutbreak], false);
  assert.deepEqual(ids(refreshed), ['mine', OUTBREAK_SAMPLE_ID]);
  assert.equal(refreshed[1].records.length, sampleSize(OUTBREAK_SAMPLE_ID).records);
  assert.equal(refreshed[0], own);

  // A link to a sample the browser already holds does not duplicate it.
  assert.deepEqual(ids(prepareStartingDatasets([oldOutbreak], true, OUTBREAK_SAMPLE_ID)), [OUTBREAK_SAMPLE_ID]);

  // Something that is not a sample is never invented.
  assert.equal(createSampleDataset('mine'), null);
  assert.deepEqual(ids(prepareStartingDatasets([own], true, 'not-a-sample')), ['mine']);

  // Every sample can be built, and its stated size matches what is built.
  for (const id of [OUTBREAK_SAMPLE_ID, NUTRITION_SAMPLE_ID, SURVEILLANCE_SAMPLE_ID]) {
    const sample = createSampleDataset(id);
    assert.equal(sample.id, id);
    assert.ok(sample.records.length > 0, `${id} has records`);
    assert.deepEqual(sampleSize(id), { records: sample.records.length, variables: sample.columns.length });
  }

  console.log('sample datasets regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
