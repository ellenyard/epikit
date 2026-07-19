import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-locale-test-'));
const bundledModule = path.join(tempDir, 'localeNumbers.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/localeNumbers.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundledModule,
    logLevel: 'silent',
  });

  const { parseLocaleNumber, formatCsvNumber } = await import(pathToFileURL(bundledModule).href);

  const german = { decimalSeparator: ',', thousandsSeparator: '.' };
  const us = { decimalSeparator: '.', thousandsSeparator: ',' };

  // Comma-decimal locale: period decimals must survive (exportToCSV output)
  assert.equal(parseLocaleNumber('1.5', german), 1.5);
  assert.equal(parseLocaleNumber('2.75', german), 2.75);
  assert.equal(parseLocaleNumber(formatCsvNumber(1.5), german), 1.5);

  // Comma-decimal locale: genuine locale grouping still works
  assert.equal(parseLocaleNumber('1.234.567,89', german), 1234567.89);
  assert.equal(parseLocaleNumber('1.234', german), 1234);
  assert.equal(parseLocaleNumber('1,5', german), 1.5);
  assert.equal(parseLocaleNumber('-1.234,5', german), -1234.5);

  // US locale: grouping and plain decimals
  assert.equal(parseLocaleNumber('1,234.5', us), 1234.5);
  assert.equal(parseLocaleNumber('1,234,567', us), 1234567);
  assert.equal(parseLocaleNumber('1.5', us), 1.5);
  assert.equal(parseLocaleNumber('1234', us), 1234);

  // Non-numeric input stays NaN
  assert.ok(Number.isNaN(parseLocaleNumber('abc', us)));

  console.log('Locale number regression checks passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
