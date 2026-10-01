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

  const {
    detectCaseValues, readsAsNonCase, looksLikeOutcomeColumn, pickOutcomeColumn,
  } = await import(pathToFileURL(bundled).href);

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

  // 8. A case word inside a longer word is not a case word. "Unconfirmed"
  //    contains "confirmed" and "Improbable" contains "probable"; both were
  //    ticked, so a Confirmed/Unconfirmed column made every record a case.
  {
    for (const value of [
      'Unconfirmed', 'Improbable', 'Still well', 'Illness absent', 'Hillside',
      'Greenville', 'Brazzaville', 'Libreville', 'Unconfirmed case', 'Killed',
    ]) {
      assert.deepEqual(detectCaseValues([value]), [], `${value} must not be selected`);
    }
    assert.deepEqual(detectCaseValues(['Confirmed', 'Unconfirmed']), ['Confirmed']);
  }

  // 9. Bare affirmatives, including a 1/0 or true/false coded outcome.
  {
    assert.deepEqual(detectCaseValues(['1', '0']), ['1']);
    assert.deepEqual(detectCaseValues(['true', 'false']), ['true']);
    assert.deepEqual(detectCaseValues(['Y', 'N']), ['Y']);
    // "y" and "si" are only trusted as the whole value: "Fiebre y tos" is not a yes.
    assert.deepEqual(detectCaseValues(['Fiebre y tos']), []);
  }

  // 10. French, Spanish and Portuguese, with and without accents. Negations in
  //     each language win, as in English.
  {
    for (const value of [
      'Confirmé', 'Confirmée', 'Cas confirmé', 'Cas probable', 'Suspect', 'Positif',
      'Malade', 'Oui', 'Confirmado', 'Caso confirmado', 'Caso sospechoso', 'Positivo',
      'Enfermo', 'Sí', 'Si', 'Caso suspeito', 'Provável', 'Doente', 'Sim',
    ]) {
      assert.deepEqual(detectCaseValues([value]), [value], `${value} must be selected`);
    }
    for (const value of [
      'Non', 'Non-cas', 'Pas un cas', 'Cas non confirmé', 'Négatif', 'Écarté', 'Témoin',
      'No', 'No es caso', 'Negativo', 'Descartado', 'Caso descartado', 'Não', 'Sem caso',
      'Sain', 'Sano',
    ]) {
      assert.deepEqual(detectCaseValues([value]), [], `${value} must not be selected`);
    }
  }

  // 11. Which column is the outcome. The name is matched on whole words: the
  //     previous substring test chose "ville" and "village" (both contain
  //     "ill") and "vaccination_status" (contains "status").
  {
    for (const name of ['ill', 'Ill', 'case_status', 'Case Status', 'caseStatus', 'is_case',
      'sick', 'malade', 'cas', 'caso', 'enfermo', 'status', 'outcome', 'illness']) {
      assert.equal(looksLikeOutcomeColumn(name), true, `${name} names an outcome`);
    }
    for (const name of ['ville', 'village', 'grilled_chicken', 'chilli', 'still_birth',
      'vaccination_status', 'marital_status', 'pregnancy_outcome', 'skilled_birth_attendant',
      'contact_with_case', 'case_id', 'illness_onset', 'ill_family_member', 'milk']) {
      assert.equal(looksLikeOutcomeColumn(name), false, `${name} is not the outcome`);
    }
  }

  // 12. Pre-selection needs both the name and values that split into cases and
  //     non-cases. Otherwise nothing is chosen and the interface asks.
  {
    // The French file that exposed this: "ville" was chosen and two cities ticked.
    assert.deepEqual(
      pickOutcomeColumn([
        { key: 'ville', label: 'ville', values: ['Brazzaville', 'Pointe-Noire', 'Dolisie', 'Libreville'] },
        { key: 'riz', label: 'riz', values: ['Oui', 'Non'] },
        { key: 'malade', label: 'malade', values: ['Oui', 'Non'] },
      ]),
      { key: 'malade', caseValues: ['Oui'] },
      'the outcome is "malade", not "ville"'
    );
    assert.equal(
      pickOutcomeColumn([
        { key: 'village', label: 'village', values: ['Greenville', 'Hillside', 'Oak Park'] },
        { key: 'grilled_chicken', label: 'Grilled chicken', values: ['Yes', 'No', 'Unknown'] },
        { key: 'vaccination_status', label: 'Vaccination status', values: ['Yes', 'No'] },
      ]),
      null,
      'no column here names the outcome, so none is chosen'
    );
    assert.deepEqual(
      pickOutcomeColumn([{ key: 'ill', label: 'Ill', values: ['1', '0'] }]),
      { key: 'ill', caseValues: ['1'] },
      'a 1/0 outcome is recognised'
    );
    assert.deepEqual(
      pickOutcomeColumn([
        { key: 'case_status', label: 'Case Status', values: ['Confirmed', 'Probable', 'Suspected', 'Not a case'] },
      ]),
      { key: 'case_status', caseValues: ['Confirmed', 'Probable', 'Suspected'] }
    );
    // Every value a case, or none: no usable split, so nothing is pre-selected.
    assert.equal(pickOutcomeColumn([{ key: 'case_status', label: 'Case status', values: ['Confirmed', 'Probable'] }]), null);
    assert.equal(pickOutcomeColumn([{ key: 'status', label: 'Status', values: ['Recovered', 'Died'] }]), null);
  }

  console.log('case definition regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
