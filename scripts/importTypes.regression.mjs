/**
 * Import type inference, for both the CSV and Excel paths.
 *
 * Import sits upstream of everything else: a value corrupted here quietly
 * invalidates a correct epi curve and a correct 2x2 table alike. The Excel
 * path had no coverage at all.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-import-test-'));

const bundle = async (src, name) => {
  const out = path.join(tempDir, name);
  await build({
    entryPoints: [path.join(root, src)],
    bundle: true, format: 'esm', platform: 'node',
    outfile: out, logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
};

const col = (cols, key) => cols.find(c => new RegExp(key).test(c.key));

try {
  const { looksLikeIdentifier, isNumericColumn } = await bundle('src/utils/typeInference.ts', 'ti.mjs');
  const { parseCSV } = await bundle('src/utils/csvParser.ts', 'csv.mjs');
  const { parseExcel } = await bundle('src/utils/excelParser.ts', 'xl.mjs');
  const XLSX = await import('xlsx');

  // 1. The identifier heuristic: a leading zero before another digit.
  for (const v of ['007', '012', '0450', '-007']) {
    assert.ok(looksLikeIdentifier(v), `${v} should read as an identifier`);
  }
  for (const v of ['0', '0.5', '1', '34', '1.25', '', 'abc', '10']) {
    assert.ok(!looksLikeIdentifier(v), `${v} should not read as an identifier`);
  }

  // 2. One zero-padded value is enough to disqualify the whole column: the
  //    column is a code list even if most entries happen to parse as numbers.
  assert.ok(!isNumericColumn(['1', '2', '007']), 'a single padded value makes the column non-numeric');
  assert.ok(isNumericColumn(['1', '2', '3']), 'plain integers are numeric');
  assert.ok(isNumericColumn(['0', '0.5', '1.25']), 'zero and decimals are numeric');
  assert.ok(!isNumericColumn(['1', 'abc']), 'non-numeric text is not numeric');
  assert.ok(!isNumericColumn([]), 'an empty column is not numeric');

  // 3. CSV: identifiers survive, real numbers still parse.
  {
    const r = parseCSV('participant_id,age,rate\n007,34,0.5\n012,28,1.25\n045,67,0.75\n');
    const id = col(r.columns, 'participant');
    assert.equal(id.type, 'text', 'a zero-padded ID column must stay text');
    assert.equal(r.records[0][id.key], '007', 'the leading zeros must survive import');
    assert.equal(col(r.columns, 'age').type, 'number');
    assert.equal(col(r.columns, 'rate').type, 'number', 'decimals below 1 are still numbers');
    assert.equal(r.records[0][col(r.columns, 'rate').key], 0.5);
  }

  // 4. Excel: the same, plus real date cells.
  {
    const ws = XLSX.utils.aoa_to_sheet([
      ['participant_id', 'age', 'rate', 'onset_date'],
      // 1 January is deliberate: east of UTC its local midnight falls on the
      // previous day, month and year in UTC, so reading UTC components would
      // shift all three. 4 July covers a DST boundary.
      ['007', 34, 0.5, new Date(2026, 0, 1)],
      ['012', 28, 1.25, new Date(2026, 0, 11)],
      ['045', 67, 0.75, new Date(2026, 6, 4)],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const r = await parseExcel(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    const id = col(r.columns, 'participant');
    assert.equal(id.type, 'text', 'a zero-padded ID column must stay text');
    assert.equal(r.records[0][id.key], '007', 'the leading zeros must survive import');
    assert.equal(col(r.columns, 'age').type, 'number');
    assert.equal(col(r.columns, 'rate').type, 'number');

    // Date cells must land on the day the spreadsheet shows, not shift by one.
    // Reading a Date's local components rather than via toISOString is what
    // keeps this stable for anyone west of UTC.
    const d = col(r.columns, 'onset');
    assert.equal(d.type, 'date');
    assert.deepEqual(
      r.records.map(rec => rec[d.key]),
      ['2026-01-01', '2026-01-11', '2026-07-04'],
      'Excel date cells must not shift by a day, month or year in any timezone'
    );
  }

  // 5. Headers: duplicates get distinct keys, 'id' is reserved for record UUIDs,
  //    and blank headers still produce a usable column.
  {
    const r = parseCSV('id,Site,Site,,Age\n1,North,South,x,30\n');
    const keys = r.columns.map(c => c.key);
    assert.equal(new Set(keys).size, keys.length, `column keys must be unique, got ${keys.join(',')}`);
    assert.ok(!keys.includes('id') || keys.filter(k => k === 'id').length === 1,
      'the reserved id key must not collide');
  }

  console.log('import type regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
