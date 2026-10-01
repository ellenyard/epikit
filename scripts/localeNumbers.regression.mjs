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

  const { parseLocaleNumber, formatCsvNumber, classifyNumber, analyzeNumberColumn, numberFromShape } =
    await import(pathToFileURL(bundledModule).href);

  const german = { decimalSeparator: ',', thousandsSeparator: '.' };
  const french = { decimalSeparator: ',', thousandsSeparator: ' ' };
  const us = { decimalSeparator: '.', thousandsSeparator: ',' };
  const locales = { german, french, us };

  // Values whose text settles what the marks mean read the same under every
  // locale setting. That is the point: the locale is the reader's, not the
  // file's.
  const settled = [
    ['1.5', 1.5], ['2.75', 2.75], ['1,5', 1.5], ['0,125', 0.125], ['0.125', 0.125],
    ['1.234.567,89', 1234567.89], ['-1.234,5', -1234.5],
    ['1,234.5', 1234.5], ['1,234,567', 1234567], ['1.234.567', 1234567],
    ['1234', 1234], ['1234.567', 1234.567], ['1234,567', 1234.567],
    ['12.3456', 12.3456], ['-0,5', -0.5], ['.5', 0.5], ['+5', 5],
    ['1 234,5', 1234.5], ['12\u00a0345', 12345], ['1\u202f234\u202f567,8', 1234567.8],
    [formatCsvNumber(1.5), 1.5], [formatCsvNumber(23.125), 23.125],
  ];
  for (const [name, config] of Object.entries(locales)) {
    for (const [text, expected] of settled) {
      assert.equal(parseLocaleNumber(text, config), expected, `"${text}" under ${name}`);
    }
  }

  // The open shape: one to three digits, one mark, exactly three digits. With
  // nothing else to go on it is a decimal under every locale. Reading it as
  // thousands under a comma-decimal locale turned a latitude of 9.082 into
  // 9082, and this app's own export of 23.125 into 23125.
  for (const [name, config] of Object.entries(locales)) {
    assert.equal(parseLocaleNumber('1.234', config), 1.234, `"1.234" under ${name}`);
    assert.equal(parseLocaleNumber('9.082', config), 9.082, `"9.082" under ${name}`);
    assert.equal(parseLocaleNumber('3,250', config), 3.25, `"3,250" under ${name}`);
    assert.equal(parseLocaleNumber('-12,345', config), -12.345, `"-12,345" under ${name}`);
  }

  // What each shape proves.
  assert.deepEqual(classifyNumber('9.082'), { kind: 'open', mark: '.', asDecimal: 9.082, asThousands: 9082 });
  assert.deepEqual(classifyNumber('3,250'), { kind: 'open', mark: ',', asDecimal: 3.25, asThousands: 3250 });
  assert.deepEqual(classifyNumber('70,5'), { kind: 'decimal', mark: ',', value: 70.5 });
  assert.deepEqual(classifyNumber('1,234.5'), { kind: 'decimal', mark: '.', groupMark: ',', value: 1234.5 });
  assert.deepEqual(classifyNumber('1.234.567'), { kind: 'grouped', mark: '.', value: 1234567 });
  assert.deepEqual(classifyNumber('42'), { kind: 'plain', value: 42 });
  assert.equal(numberFromShape(classifyNumber('9.082'), { '.': 'thousands' }), 9082);
  assert.equal(numberFromShape(classifyNumber('9.082')), 9.082);

  // Non-numeric input stays NaN
  for (const text of ['abc', '', '12abc', '6 months', '<1', '45%', '1.2.3', '1,23,456', '1.234,5.6', '--5']) {
    assert.ok(Number.isNaN(parseLocaleNumber(text, us)), `"${text}" is not a number`);
  }

  // ISO date strings must not parse as numbers (parseFloat prefix behavior)
  assert.ok(Number.isNaN(parseLocaleNumber('2026-07-01', us)));
  assert.ok(Number.isNaN(parseLocaleNumber('2026-07-01', german)));
  assert.ok(Number.isNaN(parseLocaleNumber('2026-07-01T10:30:00', us)));
  assert.ok(Number.isNaN(parseLocaleNumber('13/01/2024', us)));

  // Scientific notation parses when it is written as a number is: with a
  // signed exponent or a decimal point. "1E5" and "12E10" are sample codes,
  // and "0x1A" is not ten plus sixteen.
  assert.equal(parseLocaleNumber('1e+3', us), 1000);
  assert.equal(parseLocaleNumber('1.5e3', us), 1500);
  assert.equal(parseLocaleNumber('2E-04', us), 0.0002);
  for (const code of ['1e3', '1E5', '12E10', '0x1A', 'Infinity', 'NaN']) {
    assert.ok(Number.isNaN(parseLocaleNumber(code, us)), `"${code}" is a code, not a number`);
  }

  // Arabic-Indic digits and marks, which are never ambiguous.
  assert.equal(parseLocaleNumber('١\u066c٢٣٤\u066b٥', us), 1234.5);

  // ---- A column decides what its open-shaped values mean.
  // Another value in the column proves the mark is a decimal mark.
  let a = analyzeNumberColumn(['9.082', '9.1', '12.345']);
  assert.equal(a.consistent, true);
  assert.equal(a.readings['.'], 'decimal');
  assert.equal(a.openMark, null, 'nothing to ask: 9.1 settles it');
  // Another value proves it groups thousands.
  a = analyzeNumberColumn(['1.234', '1.234.567', '12.345,5']);
  assert.equal(a.readings['.'], 'thousands');
  assert.equal(a.openMark, null);
  // The file's delimiter settles it: semicolon files use decimal commas, and
  // in a comma file a period is the decimal mark.
  a = analyzeNumberColumn(['3,250', '2,900'], ';');
  assert.equal(a.readings[','], 'decimal');
  assert.equal(a.openMark, null);
  a = analyzeNumberColumn(['9.082', '12.345'], ',');
  assert.equal(a.readings['.'], 'decimal');
  assert.equal(a.openMark, null);
  // Nothing settles it: read as a decimal, and asked about.
  a = analyzeNumberColumn(['9.082', '12.345'], ';');
  assert.equal(a.readings['.'], 'decimal');
  assert.equal(a.openMark, '.');
  assert.equal(a.openCount, 2);
  assert.deepEqual(a.openExamples, ['9.082', '12.345']);
  a = analyzeNumberColumn(['1,234', '856'], ',');
  assert.equal(a.readings[','], 'decimal');
  assert.equal(a.openMark, ',');
  a = analyzeNumberColumn(['1,234', '2,001']);
  assert.equal(a.openMark, ',', 'with no delimiter to go on (Excel, pasted text) it is asked');
  // The other mark is the column's decimal mark, so this one probably
  // groups; suggested, but still asked.
  a = analyzeNumberColumn(['70,5', '1.234']);
  assert.equal(a.readings['.'], 'thousands');
  assert.equal(a.openMark, '.');
  // Both marks used as decimals by different typists: both are decimals.
  a = analyzeNumberColumn(['37.5', '37,5', '38']);
  assert.equal(a.consistent, true);
  assert.equal(a.openMark, null);
  // Contradictions make the column not a number column at all.
  assert.equal(analyzeNumberColumn(['1.234,5', '1,234.5']).consistent, false);
  assert.equal(analyzeNumberColumn(['1.234', '5,678']).consistent, false);
  assert.equal(analyzeNumberColumn(['1.5', '1.234.567']).consistent, false);

  console.log('Locale number regression checks passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
