/**
 * Edit-log entries for added and deleted records.
 *
 * A deletion is the one edit that removes data outright, and it used to leave
 * no trace. The entry has to carry the whole record, in the existing entry
 * shape, so that it survives a save and reload as JSON and can be undone.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-editlog-test-'));
const bundled = path.join(tempDir, 'editLog.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/editLog.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });
  const {
    recordDeletedEntry, recordAddedEntry, deletedRecordOf, isRecordDeletion, isRecordAddition, recordIdentifierOf,
  } = await import(pathToFileURL(bundled).href);

  const columns = [
    { key: 'case_id', label: 'Case ID', type: 'text' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'name', label: 'Name', type: 'text' },
  ];
  const record = { id: 'r-1', case_id: 'C007', age: 34, name: 'Aïcha "AK" Koné', onset: null };

  const deleted = recordDeletedEntry('ds-1', record, columns);
  assert.equal(deleted.datasetId, 'ds-1');
  assert.equal(deleted.recordId, 'r-1');
  assert.equal(deleted.recordIdentifier, 'C007', 'the record is named by its first column');
  assert.equal(deleted.columnLabel, 'Record deleted');
  assert.equal(typeof deleted.oldValue, 'string', 'the record travels as text, which a CSV export can hold');
  assert.equal(deleted.newValue, null);
  assert.ok(isRecordDeletion(deleted) && !isRecordAddition(deleted));
  assert.ok(!Number.isNaN(Date.parse(deleted.timestamp)));

  // Through storage and back: the record that comes out is the one deleted,
  // types and all.
  const reloaded = JSON.parse(JSON.stringify(deleted));
  assert.deepEqual(deletedRecordOf(reloaded), record);

  const added = recordAddedEntry('ds-1', record, columns);
  assert.ok(isRecordAddition(added) && !isRecordDeletion(added));
  assert.equal(added.oldValue, null);
  assert.deepEqual(JSON.parse(added.newValue), record);

  // An ordinary cell edit is neither, and holds no record to restore.
  const cellEdit = { ...deleted, columnKey: 'age', columnLabel: 'Age', oldValue: 34, newValue: 35 };
  assert.ok(!isRecordDeletion(cellEdit) && !isRecordAddition(cellEdit));
  assert.equal(deletedRecordOf(cellEdit), null);
  // Nor does a deletion entry whose value has been damaged.
  assert.equal(deletedRecordOf({ ...deleted, oldValue: '{not json' }), null);
  assert.equal(deletedRecordOf({ ...deleted, oldValue: '"just text"' }), null);
  assert.equal(deletedRecordOf({ ...deleted, oldValue: '{"case_id":"no id"}' }), null);

  // A record whose first column is blank is named by its internal id.
  assert.equal(recordIdentifierOf({ id: 'r-2', case_id: '' }, columns), 'r-2');
  assert.equal(recordIdentifierOf({ id: 'r-3', case_id: 0 }, columns), '0');

  console.log('editLog regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
