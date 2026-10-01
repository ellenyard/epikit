/**
 * Formatting of statistics that must not be rounded like estimates.
 *
 * The variable explorer showed every number to three significant figures. A
 * minimum birth weight of 1005 g appeared as 1010, a year of birth of 1987 as
 * 1990 and a sum of 35330 as 35300: values that are not in the data, shown as
 * though they were read from it.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-statformat-test-'));
const bundled = path.join(tempDir, 'statFormat.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/statFormat.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    formatExact, dataDecimals, formatSummary, formatPValue, formatPValueText,
  } = await import(pathToFileURL(bundled).href);

  // 1. Values read off the data are written in full.
  {
    assert.equal(formatExact(1005), '1005', 'a minimum of 1005 is 1005, not 1010');
    assert.equal(formatExact(1987), '1987');
    assert.equal(formatExact(35330), '35330', 'a sum is exact');
    assert.equal(formatExact(4120), '4120');
    assert.equal(formatExact(36.6), '36.6');
    assert.equal(formatExact(-12.75), '-12.75');
    assert.equal(formatExact(0), '0');
    assert.equal(formatExact(1234567), '1234567');
    // Binary noise from adding decimals is not a digit of the data.
    assert.equal(formatExact(0.1 + 0.2), '0.3');
    assert.equal(formatExact(36.6 + 36.8 + 37.1), '110.5');
    assert.equal(formatExact(NaN), '-');
    assert.equal(formatExact(Infinity), '-');
  }

  // 2. How finely the data were recorded.
  {
    assert.equal(dataDecimals([1005, 2450, 3245]), 0);
    assert.equal(dataDecimals([36.6, 37, 38.25]), 2);
    assert.equal(dataDecimals([0.5, 12]), 1);
    assert.equal(dataDecimals([]), 0);
    assert.equal(dataDecimals([NaN, 3]), 0);
    assert.equal(dataDecimals([0.123456789]), 6, 'capped, so a float artefact cannot ask for 15 places');
  }

  // 3. Derived summaries: one more decimal than the data, trailing zeros off.
  {
    // Twelve birth weights, mean 2944.1666...; integers, so one decimal.
    assert.equal(formatSummary(2944.1666666666665, 1), '2944.2', 'not "2940"');
    assert.equal(formatSummary(856.1378216718203, 1), '856.1');
    assert.equal(formatSummary(3060, 1), '3060', 'a whole median stays whole');
    assert.equal(formatSummary(40.5, 1), '40.5');
    assert.equal(formatSummary(27.75, 1), '27.8');
    assert.equal(formatSummary(0.45, 2), '0.45');
    assert.equal(formatSummary(NaN, 1), '-', 'an undefined SD is shown as missing');
  }

  // 4. p-values. Rounding never moves one across 0.05.
  {
    assert.equal(formatPValue(0.00004), '<0.001');
    assert.equal(formatPValue(0.0427), '0.043');
    assert.equal(formatPValue(0.0786), '0.079');
    assert.equal(formatPValue(0.18), '0.18');
    assert.equal(formatPValue(0.6123), '0.61');
    assert.equal(formatPValue(1), '1.00');
    // 0.0496 rounds to 0.050 at three places, which reads as "not below 0.05".
    assert.equal(formatPValue(0.0496), '0.0496');
    assert.equal(formatPValue(0.04996), '0.04996');
    // 0.0504 rounds to 0.050: still on the right side, so three places do.
    assert.equal(formatPValue(0.0504), '0.050');
    assert.equal(formatPValue(0.05), '0.050');
    assert.equal(formatPValue(NaN), '-');
    for (let p = 0.0005; p < 1; p += 0.00037) {
      const text = formatPValue(p);
      if (text.startsWith('<')) continue;
      assert.equal(Number(text) < 0.05, p < 0.05, `formatted ${text} must be on the same side of 0.05 as ${p}`);
    }

    assert.equal(formatPValueText(0.0427), 'p = 0.043');
    assert.equal(formatPValueText(0.00004), 'p < 0.001');
  }

  console.log('stat format regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
