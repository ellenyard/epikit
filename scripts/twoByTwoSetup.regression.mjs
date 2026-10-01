/**
 * Who is exposed, who they are compared with, and how the four cells are
 * counted.
 *
 * When no value was literally "yes", "true" or "1", the alphabetically first
 * value was taken as "exposed". For Y/N, Oui/Non, Si/No and Sim/Não that is the
 * unexposed group: a risk ratio of 4.5 was reported as 0.22 and described as
 * protective. The comparison group for a multi-level exposure was whichever
 * other level was most common, which made "Unknown" the "Not Exposed" column
 * whenever it outnumbered the real unexposed. And the forest plot counted the
 * table by different rules from the 2x2 panel, so the two disagreed.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-2x2setup-test-'));
const bundled = path.join(tempDir, 'twoByTwoSetup.mjs');

/** Records for one column from a { value: count } map. */
const column = (key, counts) =>
  Object.entries(counts).flatMap(([value, n]) =>
    Array.from({ length: n }, (_, i) => ({ id: `${value}-${i}`, [key]: value })));

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/twoByTwoSetup.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    levelKey, collectLevels, detectExposedLevel, detectReferenceLevel,
    resolveExposureSetup, isMissingLikeLevel, caseKeySet, tabulateTwoByTwo,
    outcomeCandidateColumns, suggestOutcome,
  } = await import(pathToFileURL(bundled).href);

  const exposedOf = counts => detectExposedLevel(collectLevels(column('x', counts), 'x'))?.label ?? null;

  // 1. Positive and negative codings across languages. In every pair the
  //    affirmative value is exposed, whichever sorts first alphabetically.
  {
    for (const [yes, no] of [
      ['Yes', 'No'], ['Y', 'N'], ['yes', 'no'], ['YES', 'NO'],
      ['Oui', 'Non'], ['O', 'N'], ['Si', 'No'], ['Sí', 'No'], ['S', 'N'],
      ['Sim', 'Não'], ['Sim', 'Nao'], ['True', 'False'], ['TRUE', 'FALSE'], ['T', 'F'],
      ['1', '0'], ['Exposed', 'Unexposed'], ['Exposed', 'Not exposed'],
      ['Ate', 'Did not eat'], ['Positive', 'Negative'], ['Vaccinated', 'Unvaccinated'],
      ['Vacciné', 'Non vacciné'], ['Swam', 'No'], ['Present', 'Absent'], ['Ja', 'Nein'],
    ]) {
      assert.equal(exposedOf({ [yes]: 7, [no]: 9 }), yes, `${yes} / ${no}: ${yes} is the exposed value`);
    }
    // Stored booleans, as older saved datasets hold them.
    const booleans = [{ id: '1', x: true }, { id: '2', x: false }, { id: '3', x: true }];
    assert.equal(detectExposedLevel(collectLevels(booleans, 'x')).label, 'true');
  }

  // 2. When nothing is recognised, nothing is chosen. Guessing is what turned
  //    results upside down.
  {
    assert.equal(exposedOf({ Chicken: 5, Fish: 6 }), null, 'two unrelated values: no guess');
    assert.equal(exposedOf({ M: 5, F: 6 }), null, '"F" is not "false" beside "M"');
    assert.equal(exposedOf({ 1: 5, 2: 6 }), null, '1/2 coding is ambiguous and is not guessed');
    assert.equal(exposedOf({ 1: 5, 2: 6, 3: 4, 4: 2 }), null, 'a count variable has no exposed value');
    assert.equal(exposedOf({ None: 5, Primary: 6, Secondary: 4 }), null, 'an ordinal variable is not guessed');
  }

  // 2b. Uncleaned data with two spellings of yes and of no, as in the bundled
  //     outbreak sample (Yes 34, y 6, No 48, n 8). Both spellings point the
  //     same way, so the commoner is used and the direction cannot invert; the
  //     records under the other spelling are counted as excluded (test 6).
  {
    const records = column('x', { Yes: 34, y: 6, No: 48, n: 8 });
    const setup = resolveExposureSetup(records, 'x');
    assert.equal(setup.exposed.label, 'Yes');
    assert.equal(setup.reference.label, 'No');
  }

  // 3. Levels are compared trimmed and case-folded, so one value typed three
  //    ways is one level. Untrimmed, "Yes " became a third level and its
  //    records dropped out of the table.
  {
    const records = column('x', { Oui: 30, oui: 10, 'Oui ': 2, Non: 30 });
    const levels = collectLevels(records, 'x');
    assert.equal(levels.length, 2, 'Oui / oui / "Oui " are one level');
    const oui = levels.find(l => l.key === 'oui');
    assert.equal(oui.count, 42, 'and all their records are counted in it');
    assert.equal(oui.label, 'Oui', 'labelled with the commonest spelling');
    assert.equal(levelKey('  YES '), 'yes');
    assert.equal(levelKey(null), '');
    assert.equal(levelKey('   '), '', 'whitespace is missing');
  }

  // 4. The comparison group. A recognised "no" wins; a missing-like level is
  //    never chosen, however common.
  {
    const refOf = (counts, exposed) => {
      const levels = collectLevels(column('x', counts), 'x');
      return detectReferenceLevel(levels, levelKey(exposed))?.label ?? null;
    };
    assert.equal(refOf({ Yes: 40, No: 30, Unknown: 50 }, 'Yes'), 'No');
    // The case that was wrong: "Unknown" outnumbers the real unexposed group.
    assert.equal(refOf({ Ate: 30, 'Did not eat': 10, Unknown: 18 }, 'Ate'), 'Did not eat');
    assert.equal(refOf({ High: 10, Medium: 20, Low: 15, Unknown: 40 }, 'High'), 'Medium',
      'without a recognised "no", the commonest real level');
    assert.equal(refOf({ Yes: 10, Unknown: 20 }, 'Yes'), null,
      'only a missing-like level left: the user has to choose');
    assert.equal(refOf({ 1: 10, 0: 20, 9: 30 }, '1'), '0');

    for (const value of ['Unknown', 'unknown', 'UNK', "Don't know", 'DK', 'N/A', 'NA', 'Missing',
      'Refused', 'Inconnu', 'Ne sait pas', 'Desconocido', 'No sabe', 'Não sabe', '?']) {
      assert.equal(isMissingLikeLevel(levelKey(value)), true, `${value} is missing-like`);
    }
    for (const value of ['No', 'None', 'Never', '0', 'Low']) {
      assert.equal(isMissingLikeLevel(levelKey(value)), false, `${value} is a real answer`);
    }
  }

  // 5. A saved choice is honoured when it still exists in the data, whatever
  //    its case, and ignored when it does not.
  {
    const records = column('x', { Y: 10, N: 20 });
    assert.equal(resolveExposureSetup(records, 'x', 'N').exposed.label, 'N', 'an explicit choice wins');
    assert.equal(resolveExposureSetup(records, 'x', 'n').exposed.label, 'N', 'matched without regard to case');
    const stale = resolveExposureSetup(records, 'x', 'Yes');
    assert.equal(stale.exposed.label, 'Y', 'a saved value no longer in the data falls back to detection');
    assert.equal(stale.reference.label, 'N');
    const same = resolveExposureSetup(records, 'x', 'Y', 'Y');
    assert.equal(same.reference.label, 'N', 'a group is never compared with itself');
    const unknown = resolveExposureSetup(column('x', { Chicken: 5, Fish: 6 }), 'x');
    assert.equal(unknown.exposed, null);
    assert.equal(unknown.reference, null);
  }

  // 6. Counting the cells. True table among the usable records:
  //    a = 30, b = 10, c = 5, d = 25. Around it: blank exposures, blank
  //    outcomes, an "Unknown" exposure level, and stray case and spacing.
  {
    const records = [];
    const add = (rice, ill, n) => {
      for (let i = 0; i < n; i++) records.push({ id: `${records.length}`, rice, ill });
    };
    add('Yes', 'Ill', 28); add('yes ', 'ill', 2);          // a = 30
    add('Yes', 'Well', 10);                                // b = 10
    add('No', 'Ill', 5);                                   // c = 5
    add('No', 'Well', 24); add(' NO', 'Well', 1);          // d = 25
    add('Unknown', 'Ill', 6); add('Unknown', 'Well', 6);   // another level
    add('', 'Ill', 3); add(null, 'Well', 2); add('   ', 'Ill', 1);   // exposure missing
    add('Yes', '', 4); add('No', null, 3);                 // outcome missing

    const counts = tabulateTwoByTwo(records, 'rice', 'yes', 'no', 'ill', caseKeySet(['Ill']));
    assert.deepEqual(counts.table, { a: 30, b: 10, c: 5, d: 25 });
    assert.equal(counts.missingExposure, 6, 'blank and whitespace-only exposures are excluded and counted');
    assert.equal(counts.missingOutcome, 7, 'a missing outcome is excluded, never counted as not ill');
    assert.equal(counts.otherLevels, 12, 'records in another exposure level are excluded and counted');
    assert.equal(
      counts.table.a + counts.table.b + counts.table.c + counts.table.d
        + counts.missingExposure + counts.missingOutcome + counts.otherLevels,
      records.length, 'every record is accounted for');

    // Stored booleans and numbers tabulate the same way.
    const coded = [
      { id: '1', e: true, o: 1 }, { id: '2', e: true, o: 0 },
      { id: '3', e: false, o: 1 }, { id: '4', e: false, o: 0 }, { id: '5', e: false, o: 0 },
    ];
    assert.deepEqual(
      tabulateTwoByTwo(coded, 'e', 'true', 'false', 'o', caseKeySet(['1'])).table,
      { a: 1, b: 1, c: 1, d: 2 });
  }

  // 7. Which columns can be the outcome. A 1/0-coded numeric column must be
  //    offered: numeric columns used to be excluded unless the key contained
  //    "age", which left a 1/0 outcome impossible to select.
  {
    const records = Array.from({ length: 40 }, (_, i) => ({
      id: `${i}`, pid: `P${i}`, ill: i % 2, ate_rice: i % 3 ? 1 : 0, village: ['Greenville', 'Hillside'][i % 2],
      age: 20 + i, onset: `2026-01-${String(1 + (i % 28)).padStart(2, '0')}`,
    }));
    const columns = [
      { key: 'pid', label: 'pid', type: 'text' },
      { key: 'village', label: 'village', type: 'text' },
      { key: 'ate_rice', label: 'ate_rice', type: 'number' },
      { key: 'ill', label: 'ill', type: 'number' },
      { key: 'age', label: 'age', type: 'number' },
      { key: 'onset', label: 'onset', type: 'date' },
    ];
    const keys = outcomeCandidateColumns(columns, records).map(c => c.key);
    assert.ok(keys.includes('ill'), 'a 1/0 numeric outcome is selectable');
    assert.ok(!keys.includes('age'), 'a numeric column with many values is not');
    assert.ok(!keys.includes('onset'), 'nor is a date');
    assert.deepEqual(suggestOutcome(columns, records), { key: 'ill', caseValues: ['1'] },
      'and it is the one pre-selected, not "village"');
  }

  console.log('2x2 setup regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
