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

  // 6. Excel cells carrying a time. Built from serial numbers and number
  //    formats, which is what a spreadsheet stores, so the expected text is
  //    known without going through a Date. A date-time used to lose its time
  //    and a time-only cell (onset time) became the date 1899-12-31.
  {
    const serial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
    const cell = (v, z) => ({ t: 'n', v, z });
    const rows = [
      ['case_id', 'onset_time', 'admitted', 'dob', 'zip', 'flag', 'val'],
      // 22:00 is 22/24 of a day; 14:30 is 14.5/24.
      [{ t: 's', v: 'A1' }, cell(22 / 24, 'hh:mm'), cell(serial(2025, 3, 4) + 14.5 / 24, 'dd/mm/yyyy hh:mm'), cell(serial(1950, 1, 1), 'dd/mm/yyyy'), cell(123, '00000'), { t: 'b', v: true }, { t: 'e', v: 0x2a, w: '#N/A' }],
      [{ t: 's', v: 'A2' }, cell(6 / 24, 'hh:mm'), cell(serial(2025, 10, 26) + 23.75 / 24, 'dd/mm/yyyy hh:mm'), cell(serial(1900, 3, 1), 'dd/mm/yyyy'), cell(4567, '00000'), { t: 'b', v: false }, { t: 'n', v: 5 }],
      [{ t: 's', v: 'A3' }, cell(0.5, 'hh:mm'), cell(serial(2024, 2, 29) + 0.25 / 24, 'dd/mm/yyyy hh:mm'), cell(serial(1969, 12, 31), 'dd/mm/yyyy'), cell(89, '00000'), { t: 'b', v: true }, { t: 'n', v: 7 }],
    ];
    const ws = {};
    rows.forEach((row, r) => row.forEach((c, i) => {
      ws[XLSX.utils.encode_cell({ r, c: i })] = typeof c === 'string' ? { t: 's', v: c } : c;
    }));
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const r = await parseExcel(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    assert.deepEqual(r.records.map(x => x.onset_time), ['22:00', '06:00', '12:00'],
      `a time-of-day cell is a time, not a date in 1899 (TZ=${tz})`);
    assert.equal(col(r.columns, 'onset_time').type, 'text');
    assert.deepEqual(r.records.map(x => x.admitted), ['2025-03-04T14:30', '2025-10-26T23:45', '2024-02-29T00:15'],
      `a date-time cell keeps its time (TZ=${tz})`);
    assert.equal(col(r.columns, 'admitted').type, 'date');
    assert.deepEqual(r.records.map(x => x.dob), ['1950-01-01', '1900-03-01', '1969-12-31'],
      `old dates do not shift (TZ=${tz})`);
    // A number shown with a zero-padding format is a code: keep it as shown.
    assert.deepEqual(r.records.map(x => x.zip), ['00123', '04567', '00089']);
    assert.equal(col(r.columns, 'zip').type, 'text');
    // Spreadsheet booleans keep Excel's own words and are never true/false.
    assert.deepEqual(r.records.map(x => x.flag), ['TRUE', 'FALSE', 'TRUE']);
    // An error cell is empty, and reported.
    assert.deepEqual(r.records.map(x => x.val), [null, 5, 7]);
    assert.ok(r.warnings.some(w => /spreadsheet error/.test(w.message)));
  }

  // 7. Excel: the 1904 date system some Mac workbooks use.
  {
    const s1904 = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1904, 0, 1)) / 86400000);
    const ws = {
      A1: { t: 's', v: 'onset' },
      A2: { t: 'n', v: s1904(2025, 3, 4), z: 'dd/mm/yyyy' },
      A3: { t: 'n', v: s1904(2025, 10, 26), z: 'dd/mm/yyyy' },
      '!ref': 'A1:A3',
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    wb.Workbook = { WBProps: { date1904: true } };
    const r = await parseExcel(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    assert.deepEqual(r.records.map(x => x.onset), ['2025-03-04', '2025-10-26']);
  }

  // 8. Excel: typed from every row, text cells kept exactly, and a title row
  //    above the header skipped.
  {
    const body = Array.from({ length: 12 }, (_, i) => [
      i + 1,
      i === 10 ? 'NA' : i === 11 ? '<1' : 30 + i,
      i === 11 ? 'Unknown' : (i % 2 ? 'Yes' : 'No'),
      `12345678901234567${String(i).padStart(2, '0')}`,
      `${i + 1}E5`,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([
      ['Cholera line list - District X'],
      [],
      ['n', 'age', 'hosp', 'national_id', 'sample'],
      ...body,
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const r = await parseExcel(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    assert.deepEqual(r.columns.map(c => c.label), ['n', 'age', 'hosp', 'national_id', 'sample'],
      'the header is the row with the column names, not the title above it');
    assert.equal(r.records.length, 12);
    assert.ok(r.warnings.some(w => /treated as a title/.test(w.message)));

    assert.equal(col(r.columns, 'age').type, 'text', '"<1" in row 12 keeps the column text');
    assert.equal(r.records[11].age, '<1', 'the value must survive, not be emptied');
    assert.equal(r.records[0].age, '30');
    assert.equal(r.records[11].hosp, 'Unknown', '"Unknown" must not become false');
    assert.ok(r.records.every(x => typeof x.hosp === 'string'));
    assert.equal(col(r.columns, 'national_id').type, 'text');
    assert.equal(new Set(r.records.map(x => x.national_id)).size, 12, 'long IDs must stay distinct');
    assert.equal(r.records[3].national_id, '1234567890123456703');
    assert.equal(r.records[0].sample, '1E5');
  }

  // 9. An empty sheet and a sheet that is not there are reported, not thrown.
  {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Empty');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    assert.ok((await parseExcel(buffer)).errors.some(e => /empty/i.test(e)));
    assert.ok((await parseExcel(buffer, { sheetName: 'Nope' })).errors.some(e => /not found/.test(e)));
  }

  console.log('import type regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
