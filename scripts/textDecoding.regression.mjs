/**
 * Decoding the bytes of an imported text file.
 *
 * Excel's plain "CSV" on Windows is not UTF-8. Read as UTF-8, every accented
 * letter became the replacement character and the name was gone for good.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-decode-test-'));
const bundled = path.join(tempDir, 'textDecoding.mjs');

const bytes = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const text = 'id;nom;village\n1;Aïcha Koné;Thiès\n2;Élodie N\'Diaye;Kédougou\n';

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/textDecoding.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });
  const { decodeText } = await import(pathToFileURL(bundled).href);

  // UTF-8, with and without a byte-order mark; the mark is not part of the text.
  let d = decodeText(bytes(Buffer.from(text, 'utf8')));
  assert.deepEqual([d.text, d.encoding, d.assumed], [text, 'utf-8', false]);
  d = decodeText(bytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')])));
  assert.deepEqual([d.text, d.encoding, d.assumed], [text, 'utf-8', false]);

  // Windows-1252, as Excel's plain CSV writes it. The accents must survive,
  // and the caller is told the encoding was assumed so it can say so.
  d = decodeText(bytes(Buffer.from(text, 'latin1')));
  assert.equal(d.text, text, 'accented letters must not become replacement characters');
  assert.ok(!d.text.includes('�'));
  assert.deepEqual([d.encoding, d.assumed], ['windows-1252', true]);
  // Characters Windows-1252 has and Latin-1 does not: the euro and curly quotes.
  d = decodeText(bytes(Buffer.from([0x80, 0x20, 0x93, 0x61, 0x94, 0x20, 0xe9])));
  assert.equal(d.text, '€ “a” é');

  // Another single-byte encoding when the caller names one: Cyrillic.
  d = decodeText(bytes(Buffer.from([0xc8, 0xe2, 0xe0, 0xed])), 'windows-1251');
  assert.equal(d.text, 'Иван');
  assert.equal(d.assumed, true);

  // UTF-16, which Excel's "Unicode Text" writes, with and without a mark.
  d = decodeText(bytes(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])));
  assert.deepEqual([d.text, d.encoding, d.assumed], [text, 'utf-16le', false]);
  d = decodeText(bytes(Buffer.from('id\tage\n1\t34\n2\t28\n', 'utf16le')));
  assert.deepEqual([d.text, d.encoding], ['id\tage\n1\t34\n2\t28\n', 'utf-16le']);
  const be = Buffer.from('id\tage\n1\t34\n', 'utf16le').swap16();
  d = decodeText(bytes(Buffer.concat([Buffer.from([0xfe, 0xff]), be])));
  assert.deepEqual([d.text, d.encoding], ['id\tage\n1\t34\n', 'utf-16be']);

  // Plain ASCII and an empty file.
  assert.deepEqual(decodeText(bytes(Buffer.from('a,b\n1,2\n'))).encoding, 'utf-8');
  assert.equal(decodeText(new ArrayBuffer(0)).text, '');

  console.log('textDecoding regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
