import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-csv-test-'));
const bundledParser = path.join(tempDir, 'csvParser.mjs');

function makeTable(rowCount, columnCount, delimiter) {
  const headers = Array.from({ length: columnCount }, (_, index) => `field_${index + 1}`);
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => (
    Array.from({ length: columnCount }, (_, columnIndex) => `${rowIndex + 1}-${columnIndex + 1}`).join(delimiter)
  ));

  return [headers.join(delimiter), ...rows].join('\n');
}

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/csvParser.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundledParser,
    logLevel: 'silent',
  });

  const { detectDelimiter, parseCSV, exportToCSV } = await import(pathToFileURL(bundledParser).href);

  assert.equal(detectDelimiter('a,b,c'), ',');
  assert.equal(detectDelimiter('a;b;c'), ';');
  assert.equal(detectDelimiter('a\tb\tc'), '\t');
  assert.equal(detectDelimiter('a|b|c'), '|');

  const commaRti = parseCSV(makeTable(67, 17, ','));
  assert.equal(commaRti.records.length, 67);
  assert.equal(commaRti.columns.length, 17);

  const semicolonSummary = parseCSV(makeTable(67, 13, ';'));
  assert.equal(semicolonSummary.records.length, 67);
  assert.equal(semicolonSummary.columns.length, 13);

  const tabDelimited = parseCSV(makeTable(2, 4, '\t'));
  assert.equal(tabDelimited.columns.length, 4);

  const pipeDelimited = parseCSV(makeTable(2, 4, '|'));
  assert.equal(pipeDelimited.columns.length, 4);

  const oneColumnWarning = parseCSV('a,b,c\n1,2,3', { delimiter: '|' });
  assert.equal(oneColumnWarning.columns.length, 1);
  assert.ok(oneColumnWarning.errors.some(error => error.includes('Only one column was detected')));

  // 'id' is reserved for record UUIDs; duplicate and empty headers get unique keys
  const reserved = parseCSV('id,name\n1,alice');
  assert.equal(reserved.columns[0].key, 'id_');
  assert.equal(reserved.records[0].id_, 1);
  assert.notEqual(reserved.records[0].id, 1); // record UUID preserved
  const dupes = parseCSV('name,name,name\n1,2,3');
  assert.deepEqual(dupes.columns.map(c => c.key), ['name', 'name_2', 'name_3']);
  assert.equal(dupes.records[0].name, 1);
  assert.equal(dupes.records[0].name_2, 2);
  assert.equal(dupes.records[0].name_3, 3);
  const emptyHeader = parseCSV('a,,b\n1,2,3');
  assert.equal(emptyHeader.columns[1].key, 'column_2');
  assert.equal(emptyHeader.records[0].column_2, 2);

  // Quoted field with an embedded newline stays one record (RFC 4180)
  const multiline = parseCSV('case,notes\n1,"hello\nworld"\n2,ok');
  assert.equal(multiline.records.length, 2);
  assert.equal(multiline.records[0].notes, 'hello\nworld');
  assert.equal(multiline.records[1].notes, 'ok');

  // Export -> re-import round-trip preserves multi-line text
  const rtColumns = [
    { key: 'case_id', label: 'case_id', type: 'text' },
    { key: 'notes', label: 'notes', type: 'text' },
  ];
  const roundTrip = parseCSV(exportToCSV(rtColumns, [{ id: 'x', case_id: 'C-1', notes: 'line1\nline2' }]));
  assert.equal(roundTrip.records.length, 1);
  assert.equal(roundTrip.records[0].notes, 'line1\nline2');
  assert.equal(roundTrip.records[0].case_id, 'C-1');

  // CR-only and mixed line endings
  const crOnly = parseCSV('a,b\r1,2\r3,4');
  assert.equal(crOnly.columns.length, 2);
  assert.equal(crOnly.records.length, 2);
  const mixed = parseCSV('a,b\r\n1,2\n3,4\r5,6');
  assert.equal(mixed.records.length, 3);

  // DD/MM/YYYY dates are typed as dates and normalized to ISO (no US bias)
  const euDates = parseCSV('onset\n13/01/2024\n14/01/2024\n15/01/2024');
  assert.equal(euDates.columns[0].type, 'date');
  assert.equal(euDates.records[0].onset, '2024-01-13');
  assert.equal(euDates.records[2].onset, '2024-01-15');

  // Genuinely ambiguous dates are left raw for the import wizard
  const ambiguous = parseCSV('onset\n01/02/2024\n03/04/2024');
  assert.equal(ambiguous.columns[0].type, 'date');
  assert.equal(ambiguous.records[0].onset, '01/02/2024');

  // 2-digit years use the Excel pivot rule (00-29 -> 2000s, 30-99 -> 1900s)
  const twoDigit = parseCSV('onset\n13/01/24\n14/01/24');
  assert.equal(twoDigit.columns[0].type, 'date');
  assert.equal(twoDigit.records[0].onset, '2024-01-13');
  const pivot = parseCSV('onset\n13/01/95');
  assert.equal(pivot.records[0].onset, '1995-01-13');

  // Values failing numeric parsing become null with a warning, not silent NaN
  const badNumber = parseCSV('n\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\nabc');
  assert.equal(badNumber.columns[0].type, 'number');
  assert.equal(badNumber.records[10].n, null);
  assert.ok(badNumber.errors.some(e => e.includes('could not be parsed')));

  // Period decimals survive comma-decimal locales (export -> import round-trip)
  const germanCfg = { decimalSeparator: ',', thousandsSeparator: '.', csvDelimiter: ';' };
  const germanCsv = parseCSV('n\n1.5\n2.75', { delimiter: ';', localeConfig: germanCfg });
  assert.equal(germanCsv.records[0].n, 1.5);
  assert.equal(germanCsv.records[1].n, 2.75);
  const groupedCsv = parseCSV('n\n1.234.567,89', { delimiter: ';', localeConfig: germanCfg });
  assert.equal(groupedCsv.records[0].n, 1234567.89);

  console.log('CSV parser regression checks passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
