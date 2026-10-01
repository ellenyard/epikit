/**
 * Decoding the bytes of a text file.
 *
 * File.text() decodes as UTF-8 and nothing else. Excel's plain "CSV" on
 * Windows writes the system code page instead, so every accented letter in a
 * file saved that way arrived as the replacement character: "Aïcha Koné" as
 * "A?cha Kon?", with no warning, and with the original letter unrecoverable
 * once the dataset was saved.
 *
 * UTF-8 is strict enough that text in another encoding almost never decodes
 * as valid UTF-8 by accident, so a failed strict decode is a reliable signal
 * to try something else.
 */

/** Single-byte encodings offered when a file is not Unicode. */
export const FALLBACK_ENCODINGS = [
  { value: 'windows-1252', label: 'Western European (Windows-1252)' },
  { value: 'windows-1250', label: 'Central European (Windows-1250)' },
  { value: 'windows-1251', label: 'Cyrillic (Windows-1251)' },
  { value: 'windows-1256', label: 'Arabic (Windows-1256)' },
] as const;

export interface DecodedText {
  text: string;
  /** The encoding the text was read as. */
  encoding: string;
  /** True when the file was not Unicode and the encoding had to be assumed. */
  assumed: boolean;
}

/**
 * Decode a text file's bytes.
 *
 * Tries, in order: a byte-order mark, UTF-16 without a mark (Excel's
 * "Unicode Text"), strict UTF-8, and finally `fallback`, which is
 * Windows-1252 unless the caller names another single-byte encoding.
 */
export function decodeText(buffer: ArrayBuffer, fallback: string = 'windows-1252'): DecodedText {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le', assumed: false };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be', assumed: false };
  }

  // UTF-16 without a mark: plain text has a zero in every other byte. Checked
  // before UTF-8 because those zero bytes are valid UTF-8 too.
  const sample = bytes.subarray(0, Math.min(bytes.length, 2000));
  let evenZeros = 0, oddZeros = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) { if (i % 2 === 0) evenZeros++; else oddZeros++; }
  }
  if (oddZeros > sample.length / 4 && evenZeros < sample.length / 40) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le', assumed: false };
  }
  if (evenZeros > sample.length / 4 && oddZeros < sample.length / 40) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be', assumed: false };
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', assumed: false };
  } catch {
    // Not UTF-8; fall through.
  }

  const text = fallback === 'windows-1252'
    ? decodeWindows1252(bytes)
    : new TextDecoder(fallback).decode(bytes);
  return { text, encoding: fallback, assumed: true };
}

/**
 * The characters Windows-1252 puts at 0x80-0x9F, where Latin-1 has control
 * codes: the euro sign, curly quotes, dashes and a few letters. The five
 * unassigned bytes map to the control code of the same value, as browsers do.
 */
const WINDOWS_1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

/**
 * Decode Windows-1252 without relying on the runtime's own table. Some
 * runtimes treat the label as Latin-1 and return control codes for the euro
 * sign and curly quotes; this is the default fallback, so it has to be right
 * everywhere. Every other byte is the code point of the same value.
 */
function decodeWindows1252(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let text = '';
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const codes = Array.from(bytes.subarray(start, start + CHUNK), byte =>
      byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_HIGH[byte - 0x80] : byte
    );
    text += String.fromCharCode(...codes);
  }
  return text;
}
