/**
 * Which outcome values mean "case".
 *
 * The previous rule asked whether a value contained 'case', among other words,
 * so "Not a case" qualified. The default case definition therefore included the
 * people explicitly recorded as not cases, in the 2x2 panel and the forest plot
 * alike. Nothing looks wrong when that happens: every record becomes a case, the
 * well cells empty out, and the odds ratios are meaningless but still printed.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-case-test-'));
const bundled = path.join(tempDir, 'caseDefinition.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/caseDefinition.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const { detectCaseValues, readsAsNonCase } = await import(pathToFileURL(bundled).href);

  // 1. The bundled outbreak data, which is exactly where this was found.
  {
    const values = ['Confirmed', 'Probable', 'Suspected', 'Not a case'];
    assert.deepEqual(detectCaseValues(values), ['Confirmed', 'Probable', 'Suspected'],
      '"Not a case" must not be a case, despite containing the word "case"');
  }

  // 2. Every way a dataset spells "this person is not a case". A negation wins
  //    over any case word in the same value.
  {
    const nonCases = [
      'Not a case', 'Not a Case', 'non-case', 'Non case', 'No', 'no',
      'Negative', 'lab negative', 'Discarded', 'Ruled out', 'ruled-out',
      'Control', 'Excluded', 'Unlikely case', 'Never ill',
    ];
    for (const value of nonCases) {
      assert.equal(readsAsNonCase(value), true, `${value} must read as a non-case`);
      assert.deepEqual(detectCaseValues([value]), [], `${value} must not be selected`);
    }
  }

  // 3. Ordinary case values still qualify, in the spellings surveillance
  //    systems actually use.
  {
    const cases = [
      'Confirmed', 'confirmed', 'Lab-confirmed', 'Probable', 'Suspected',
      'Suspect', 'Positive', 'Yes', 'yes', 'Case', 'Ill', 'Epi-linked case',
    ];
    for (const value of cases) {
      assert.deepEqual(detectCaseValues([value]), [value], `${value} must be selected`);
    }
  }

  // 4. A word that merely contains a negation is not a negation. These are the
  //    false positives a looser pattern would produce.
  {
    for (const value of ['Nosocomial', 'Notified', 'Nonagenarian case', 'Contact']) {
      assert.equal(readsAsNonCase(value), false,
        `${value} must not be read as a negation on a substring`);
    }
    assert.deepEqual(detectCaseValues(['Notified case']), ['Notified case']);
  }

  // 5. Values that say nothing either way are left alone rather than guessed at.
  {
    assert.deepEqual(detectCaseValues(['Pending', 'Under investigation', 'Unknown']), [],
      'an ambiguous value is not selected');
    assert.deepEqual(detectCaseValues([]), []);
    assert.deepEqual(detectCaseValues(['', '   ']), [], 'blanks are never cases');
  }

  // 6. Mixed real-world column: only the affirmative values come back, and the
  //    order of the input is preserved so the interface stays predictable.
  {
    const values = ['Suspected', 'Not a case', 'Confirmed', 'Pending', 'Probable'];
    assert.deepEqual(detectCaseValues(values), ['Suspected', 'Confirmed', 'Probable']);
  }

  // 7. Returning nothing is a valid answer. The caller leaves the selection
  //    empty and asks the user, rather than inventing a case definition.
  {
    assert.deepEqual(detectCaseValues(['Group A', 'Group B']), [],
      'nothing recognisable yields no default selection');
  }

  console.log('case definition regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
