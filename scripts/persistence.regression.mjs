/**
 * Project export and import round-trip.
 *
 * The homepage offers project files for "backup, transfer, or a clean handoff
 * to a colleague". They previously carried the datasets and edit log but none
 * of the analysis: epi-curve annotations, map configuration, table and 2x2
 * setups all lived under per-module storage keys that the export never read.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-persist-test-'));
const bundled = path.join(tempDir, 'persistence.mjs');

// Minimal localStorage, since the module reads and writes it directly.
class MemoryStorage {
  #map = new Map();
  get length() { return this.#map.size; }
  key(i) { return [...this.#map.keys()][i] ?? null; }
  getItem(k) { return this.#map.has(k) ? this.#map.get(k) : null; }
  setItem(k, v) { this.#map.set(k, String(v)); }
  removeItem(k) { this.#map.delete(k); }
  clear() { this.#map.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const dataset = (id, name) => ({
  id, name, source: 'form',
  columns: [{ key: 'id', label: 'ID', type: 'text' }],
  records: [{ id: '1' }],
  createdAt: '', updatedAt: '',
});

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/persistence.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    exportProject, parseProjectFile, collectModuleState, restoreModuleState,
  } = await import(pathToFileURL(bundled).href);

  // A user's work: an annotated epi curve, a configured spot map, a 2x2 setup.
  const epiCurveState = {
    annotations: [{ id: 'a1', label: 'Restaurant closed', date: '2026-01-11T00:00:00.000Z', color: '#6B7280' }],
    binSize: 'daily',
    chartTitle: 'Onset by day',
  };
  const spotMapState = { latColumn: 'latitude', lngColumn: 'longitude', obfuscateLocations: true, jitterDistance: 500 };
  const twoByTwoState = { studyDesign: 'cohort', outcomeVar: 'ill', caseValues: ['Yes'] };
  // A hand-drawn sketch is often the only record of a village layout, so it has
  // to travel in the project file like every other piece of analysis.
  const sketchState = {
    elements: [{
      id: 'm1', type: 'marker', start: { x: 100, y: 200 }, color: '#B91C1C',
      strokeWidth: 4, size: 40, fillPattern: 'solid', lineStyle: 'solid',
      filled: true, opacity: 1, markerId: 'case', markerShape: 'circle',
    }],
    background: 'grid', showTitle: true, title: 'Village sketch',
    subtitle: 'Not to scale', showLegend: true, legendPosition: 'side',
  };

  localStorage.setItem('epikit_epicurve_ds1', JSON.stringify(epiCurveState));
  localStorage.setItem('epikit_spotmap_ds1', JSON.stringify(spotMapState));
  localStorage.setItem('epikit_twobytwo_ds1', JSON.stringify(twoByTwoState));
  localStorage.setItem('epikit_sketchmap_ds1', JSON.stringify(sketchState));
  localStorage.setItem('epikit_datasets', JSON.stringify([dataset('ds1', 'A')]));

  // 1. Export carries the analysis, not just the data.
  const project = exportProject([dataset('ds1', 'A')], 'ds1', []);
  assert.ok(project.moduleState, 'the export must include per-module state');
  assert.deepEqual(project.moduleState['epikit_epicurve_ds1'], epiCurveState,
    'epi-curve annotations and settings must be exported');
  assert.deepEqual(project.moduleState['epikit_spotmap_ds1'], spotMapState,
    'spot-map configuration must be exported');
  assert.deepEqual(project.moduleState['epikit_twobytwo_ds1'], twoByTwoState,
    '2x2 setup must be exported');
  assert.deepEqual(project.moduleState['epikit_sketchmap_ds1'], sketchState,
    'a hand-drawn sketch map must be exported');

  // 2. It survives serialisation, which is how the file actually travels.
  const parsed = parseProjectFile(JSON.stringify(project));
  assert.ok(parsed, 'a project written by this app must parse');
  assert.deepEqual(parsed.moduleState, project.moduleState, 'module state must survive the file round-trip');

  // 3. Importing restores the work into a clean profile.
  localStorage.clear();
  restoreModuleState(parsed.moduleState);
  assert.deepEqual(JSON.parse(localStorage.getItem('epikit_epicurve_ds1')), epiCurveState,
    'the annotated epi curve must come back');
  assert.deepEqual(JSON.parse(localStorage.getItem('epikit_spotmap_ds1')), spotMapState,
    'the spot map configuration must come back');
  assert.deepEqual(JSON.parse(localStorage.getItem('epikit_sketchmap_ds1')), sketchState,
    'the sketch map must come back');

  // 4. Files written before this change still import, without module state.
  {
    const old = {
      version: '1.0', exportedAt: new Date().toISOString(),
      datasets: [dataset('ds1', 'A')], activeDatasetId: 'ds1', editLog: [], analysisState: {},
    };
    const p = parseProjectFile(JSON.stringify(old));
    assert.ok(p, 'a project file without module state must still import');
    assert.equal(p.moduleState, undefined, 'and simply carry no module state');
  }

  // 5. A project file must not be able to write arbitrary storage keys.
  //    Restoring is limited to the known module prefixes, so a crafted file
  //    cannot overwrite the dataset store or anything outside the app.
  {
    localStorage.clear();
    localStorage.setItem('epikit_datasets', JSON.stringify([dataset('real', 'Real')]));
    restoreModuleState({
      'epikit_datasets': [dataset('evil', 'Injected')],
      'epikit_activeDatasetId': 'evil',
      'unrelated_key': 'x',
      'epikit_epicurve_ds1': epiCurveState,
    });
    assert.deepEqual(
      JSON.parse(localStorage.getItem('epikit_datasets')),
      [dataset('real', 'Real')],
      'the dataset store must not be writable through module state'
    );
    assert.equal(localStorage.getItem('unrelated_key'), null,
      'keys outside the app must not be written');
    assert.ok(localStorage.getItem('epikit_epicurve_ds1'),
      'legitimate module keys are still restored');
  }

  // 6. Collection is limited to module keys. Sweeping every epikit_ key would
  //    fold the dataset store into module state, duplicating the bulk of the
  //    file, which is already the largest part of an export.
  {
    localStorage.clear();
    localStorage.setItem('epikit_datasets', JSON.stringify([dataset('ds1', 'A')]));
    localStorage.setItem('epikit_editLog', JSON.stringify([{ id: 'e1' }]));
    localStorage.setItem('epikit_activeDatasetId', 'ds1');
    localStorage.setItem('epikit_onboarding_completed', 'true');
    localStorage.setItem('epikit_epicurve_ds1', JSON.stringify(epiCurveState));
    const collected = collectModuleState();
    assert.deepEqual(Object.keys(collected), ['epikit_epicurve_ds1'],
      `module state should hold only module keys, got ${Object.keys(collected).join(', ')}`);
  }

  // 7. A corrupt entry must not lose the rest of the export.
  {
    localStorage.clear();
    localStorage.setItem('epikit_epicurve_ds1', '{not valid json');
    localStorage.setItem('epikit_spotmap_ds1', JSON.stringify(spotMapState));
    const collected = collectModuleState();
    assert.deepEqual(collected['epikit_spotmap_ds1'], spotMapState,
      'a corrupt entry must not abort collection of the others');
    assert.ok(!('epikit_epicurve_ds1' in collected), 'the corrupt entry is skipped');
  }

  // 8. Incompatible major versions are still rejected.
  {
    const future = { version: '2.0', exportedAt: '', datasets: [dataset('ds1', 'A')], activeDatasetId: 'ds1', editLog: [], analysisState: {} };
    assert.equal(parseProjectFile(JSON.stringify(future)), null, 'a future major version must be refused');
  }

  // 9. A hand-edited or damaged file must not hand the app shapes it cannot
  //    render. These each crashed Review/Clean after an apparently
  //    successful load.
  {
    const { sanitizeDataset, sanitizeEditLog } = await import(pathToFileURL(bundled).href);
    const damaged = {
      version: '1.0', exportedAt: '', activeDatasetId: 'ds1', analysisState: {},
      datasets: [{
        id: 'ds1', name: 'A', source: 'import', createdAt: '', updatedAt: '',
        columns: [null, { key: 'age', label: 5, type: 'integer' }, { label: 'no key' }, { key: 'sex', label: 'Sex', type: 'categorical' }],
        records: [null, { age: 3 }, { id: 'r1', age: 4 }, { id: 'r1', age: 5 }, 'text'],
      }],
      editLog: [null, { id: 'e1', datasetId: 'ds1' }, { id: 7 }],
    };
    const p = parseProjectFile(JSON.stringify(damaged));
    assert.ok(p, 'a damaged but recognisable project still loads');
    const [d] = p.datasets;
    assert.deepEqual(d.columns.map(c => [c.key, c.label, c.type]),
      [['age', 'age', 'text'], ['sex', 'Sex', 'categorical']],
      'unusable columns are dropped; a bad label falls back to the key and an unknown type to text');
    assert.equal(d.records.length, 3, 'null and non-object records are dropped');
    assert.deepEqual(d.records.map(r => r.age), [3, 4, 5], 'the usable records keep their values');
    assert.equal(new Set(d.records.map(r => r.id)).size, 3,
      'every record ends up with its own id, or selecting one row selects them all');
    assert.equal(d.records[1].id, 'r1', 'an existing unique id is kept');
    assert.deepEqual(p.editLog, [{ id: 'e1', datasetId: 'ds1' }], 'unusable edit log entries are dropped');

    assert.equal(sanitizeDataset(null), null);
    assert.equal(sanitizeDataset({ id: 'x', name: 'y', columns: [] }), null, 'no records array: not a dataset');
    assert.deepEqual(sanitizeEditLog('nope'), []);

    // A well-formed dataset passes through unchanged, so re-saving it writes
    // the same bytes (two open tabs rely on that to settle).
    const clean = dataset('ds1', 'A');
    assert.deepEqual(sanitizeDataset(clean), clean, 'a valid dataset is returned as it was');
    assert.equal(JSON.stringify(sanitizeDataset(clean)), JSON.stringify(clean),
      'and serialises identically, key order included');

    const nullDataset = { ...damaged, datasets: [null] };
    assert.equal(parseProjectFile(JSON.stringify(nullDataset)), null, 'a file whose dataset is not an object is refused');
  }

  console.log('persistence regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
