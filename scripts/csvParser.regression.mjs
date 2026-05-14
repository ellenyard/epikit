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

  const { detectDelimiter, parseCSV } = await import(pathToFileURL(bundledParser).href);

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

  console.log('CSV parser regression checks passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
