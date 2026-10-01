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
  assert.equal(emptyHeader.columns[1].label, 'Column 2');
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

  // Genuinely ambiguous dates are not converted and not typed as dates: the
  // column is handed back as a question, with the values untouched.
  const ambiguous = parseCSV('onset\n01/02/2024\n03/04/2024');
  assert.equal(ambiguous.columns[0].type, 'text');
  assert.equal(ambiguous.records[0].onset, '01/02/2024');
  assert.equal(ambiguous.dateQuestions.length, 1);
  assert.equal(ambiguous.dateQuestions[0].columnKey, 'onset');
  assert.equal(ambiguous.dateQuestions[0].count, 2);
  assert.deepEqual(ambiguous.dateQuestions[0].previews, { DMY: '1 February 2024', MDY: '2 January 2024' });
  // Answered, each reading gives the date that reading means.
  assert.equal(parseCSV('onset\n01/02/2024\n03/04/2024', { dateChoices: { onset: 'DMY' } }).records[1].onset, '2024-04-03');
  assert.equal(parseCSV('onset\n01/02/2024\n03/04/2024', { dateChoices: { onset: 'MDY' } }).records[1].onset, '2024-03-04');
  const keptAsText = parseCSV('onset\n01/02/2024\n03/04/2024', { dateChoices: { onset: 'text' } });
  assert.equal(keptAsText.columns[0].type, 'text');
  assert.equal(keptAsText.records[1].onset, '03/04/2024');

  // The suggestion for an ambiguous column: another date column in the file
  // that proves an order wins over the user's setting.
  const sibling = parseCSV('onset,dob\n03/04/2025,15/06/1990\n05/04/2025,01/02/1985', { preferredDateOrder: 'MDY' });
  assert.equal(sibling.dateQuestions.length, 1);
  assert.equal(sibling.dateQuestions[0].suggested, 'DMY');
  assert.equal(sibling.dateQuestions[0].suggestedFrom, 'sibling');
  assert.equal(sibling.records[0].dob, '1990-06-15');
  const fromSetting = parseCSV('onset\n03/04/2025\n05/04/2025', { preferredDateOrder: 'MDY' });
  assert.equal(fromSetting.dateQuestions[0].suggested, 'MDY');
  assert.equal(fromSetting.dateQuestions[0].suggestedFrom, 'setting');

  // Every row is evidence. A file sorted by date opens with the first twelve
  // days of the month, which prove nothing; row 13 does. Sampling ten rows
  // asked the user and pre-selected month-first.
  const sorted = ['onset'];
  for (let day = 1; day <= 12; day++) sorted.push(`${String(day).padStart(2, '0')}/03/2025`);
  sorted.push('13/03/2025', '25/03/2025');
  const sortedResult = parseCSV(sorted.join('\n'));
  assert.equal(sortedResult.columns[0].type, 'date');
  assert.equal(sortedResult.dateQuestions.length, 0, 'a day above 12 anywhere in the column settles the order');
  assert.deepEqual(
    sortedResult.records.map(r => r.onset),
    [...Array.from({ length: 12 }, (_, i) => `2025-03-${String(i + 1).padStart(2, '0')}`), '2025-03-13', '2025-03-25']
  );

  // A column mixing ISO and day-first dates converts both, since a year-first
  // date is never ambiguous and 15/03 proves the order of the rest.
  const mixedFormats = parseCSV('onset\n2025-03-01\n2025-03-02\n15/03/2025\n03/04/2025\n4 March 2025');
  assert.equal(mixedFormats.columns[0].type, 'date');
  assert.deepEqual(mixedFormats.records.map(r => r.onset),
    ['2025-03-01', '2025-03-02', '2025-03-15', '2025-04-03', '2025-03-04']);

  // A value that is not a date is kept as written and reported with its row;
  // it is never dropped and never left to be read month-first later.
  const strayText = parseCSV('onset\n13/03/2025\n14/03/2025\n15/03/2025\n16/03/2025\n31/02/2025');
  assert.equal(strayText.columns[0].type, 'date');
  assert.equal(strayText.records[4].onset, '31/02/2025');
  assert.ok(strayText.warnings.some(w => w.level === 'check' && /could not be read as a date/.test(w.message) && /31\/02\/2025/.test(w.message) && /row 6/.test(w.message)),
    'the unreadable date must be reported with its value and row');

  // Day-first date-times convert, keeping the time. They used to be skipped
  // because of the colon and left for the Date constructor, which reads
  // 03/04 as 4 March and cannot read 15/04 at all.
  const dateTimes = parseCSV('seen\n15/04/2025 14:30\n03/04/2025 09:00');
  assert.equal(dateTimes.columns[0].type, 'date');
  assert.deepEqual(dateTimes.records.map(r => r.seen), ['2025-04-15T14:30', '2025-04-03T09:00']);
  // An offset is dropped and the written time kept, so the day does not
  // depend on where the file is opened.
  const offsets = parseCSV('seen\n2025-03-05T01:00:00+03:00\n2025-03-04T23:30:00Z');
  assert.deepEqual(offsets.records.map(r => r.seen), ['2025-03-05T01:00', '2025-03-04T23:30']);
  assert.ok(offsets.warnings.some(w => /time-zone offset/.test(w.message)));

  // The whole value must be a date. A pattern anchored only at the start
  // rewrote household codes and dropped qualifiers.
  const notDates = parseCSV('hh_id,approx\n03-12-05,12/08/2024 (approx)\n01-04-09,13/08/2024?\n02-11-01,14/08/2024 est.');
  assert.equal(notDates.columns[0].type, 'text');
  assert.equal(notDates.records[0].hh_id, '03-12-05');
  assert.equal(notDates.dateQuestions.length, 0, 'a household code is not a date question');
  assert.equal(notDates.records[0].approx, '12/08/2024 (approx)');
  assert.equal(notDates.records[1].approx, '13/08/2024?');

  // 2-digit years: the century that does not put the date in a future year.
  const twoDigit = parseCSV('onset\n13/01/24\n14/01/24');
  assert.equal(twoDigit.columns[0].type, 'date');
  assert.equal(twoDigit.records[0].onset, '2024-01-13');
  const pivot = parseCSV('onset\n13/01/95');
  assert.equal(pivot.records[0].onset, '1995-01-13');
  // Three years from now, written with two digits, is last century: a line
  // list records what has happened. Excel's fixed pivot put 29 in 2029.
  const thisYear = new Date().getFullYear();
  const futureYY = String((thisYear + 3) % 100).padStart(2, '0');
  const dob = parseCSV(`dob\n15/06/${futureYY}`);
  assert.equal(dob.records[0].dob, `${thisYear + 3 - 100}-06-15`);
  assert.ok(dob.warnings.some(w => /two-digit year/.test(w.message)), 'a supplied century is reported');

  // A column is typed from every row, and a value that does not fit is never
  // emptied. Ten numbers followed by text used to make a number column with
  // the text deleted from it.
  const badNumber = parseCSV('n\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\nabc');
  assert.equal(badNumber.columns[0].type, 'text');
  assert.equal(badNumber.records[10].n, 'abc');
  assert.equal(badNumber.records[0].n, '1');
  assert.ok(badNumber.warnings.some(w => w.level === 'check' && /imported as text/.test(w.message) && /"abc"/.test(w.message) && /row 12/.test(w.message)));
  // The case that matters: ages with "<1". Emptying it loses the infants.
  const ages = ['age', ...Array.from({ length: 10 }, (_, i) => String(20 + i)), '<1', '6 months'].join('\n');
  const agesResult = parseCSV(ages);
  assert.equal(agesResult.columns[0].type, 'text');
  assert.deepEqual(agesResult.records.slice(10).map(r => r.age), ['<1', '6 months']);

  // A marker for "no value" in a numeric column is imported as empty, and
  // the import says so.
  const markers = parseCSV('age\n34\nNA\n.\n45\nUnknown');
  assert.equal(markers.columns[0].type, 'number');
  assert.deepEqual(markers.records.map(r => r.age), [34, null, null, 45, null]);
  assert.ok(markers.warnings.some(w => w.level === 'changed' && /3 values/.test(w.message) && /imported as empty/.test(w.message)));

  // Yes/No columns keep the file's own words. Typed as boolean from the
  // first ten rows, "Unknown" in row 11 was stored as false, i.e. as "No".
  const yesNo = ['hosp', ...Array.from({ length: 10 }, (_, i) => (i % 2 ? 'Yes' : 'No')),
    'Unknown', 'N/A', 'Refused', 'Y', 'Oui', 'Yes ', ''].join('\n');
  const yesNoResult = parseCSV(`id,${yesNo.split('\n')[0]}\n` + yesNo.split('\n').slice(1).map((v, i) => `P${i},${v}`).join('\n'));
  assert.notEqual(yesNoResult.columns[1].type, 'boolean');
  assert.deepEqual(yesNoResult.records.slice(10).map(r => r.hosp),
    ['Unknown', 'N/A', 'Refused', 'Y', 'Oui', 'Yes', null]);
  assert.ok(yesNoResult.records.every(r => typeof r.hosp !== 'boolean'), 'no value may be stored as true or false');
  const pureYesNo = parseCSV('id,ill\na,Yes\nb,No\nc,Yes');
  assert.equal(pureYesNo.columns[1].type, 'categorical');
  assert.deepEqual(pureYesNo.records.map(r => r.ill), ['Yes', 'No', 'Yes']);

  // Identifiers stay text wherever in the column the tell appears, and so do
  // digit strings too long to hold exactly and codes that only look numeric.
  const ids = parseCSV('case_id,national_id,sample,code,phone\n' +
    Array.from({ length: 10 }, (_, i) => `${100 + i},123456789012345678${i},${i + 1}E5,0x1${i},+2547000000${i}0`).join('\n') +
    '\n0114,1234567890123456799,12E10,0x2A,+254700000111');
  for (const key of ['case_id', 'national_id', 'sample', 'code', 'phone']) {
    assert.equal(ids.columns.find(c => c.key === key).type, 'text', `${key} must stay text`);
  }
  assert.equal(ids.records[10].case_id, '0114', 'a leading zero in row 11 must survive');
  assert.equal(ids.records[0].national_id, '1234567890123456780');
  assert.equal(ids.records[1].national_id, '1234567890123456781', 'long IDs must not collapse together');
  assert.equal(ids.records[0].sample, '1E5');
  assert.equal(ids.records[0].code, '0x10');
  // Real scientific notation, as R writes it, is still a number.
  assert.deepEqual(parseCSV('p\n1.5e-3\n2e+05').records.map(r => r.p), [0.0015, 200000]);

  // ---- Decimal and thousands marks: decided from the file, never from the
  // browser's locale. localeConfig is passed to show it makes no difference.
  const germanCfg = { decimalSeparator: ',', thousandsSeparator: '.', csvDelimiter: ';' };
  const usCfg = { decimalSeparator: '.', thousandsSeparator: ',', csvDelimiter: ',' };
  for (const localeConfig of [germanCfg, usCfg, undefined]) {
    // A period-decimal file. Under a comma-decimal locale 9.082 became 9082.
    const gps = parseCSV('lat,lon,w\n9.082,7.491,3.250\n9.1,7.5,62.5\n12.345,-1.234,0.125', { localeConfig });
    assert.deepEqual(gps.records.map(r => r.lat), [9.082, 9.1, 12.345]);
    assert.deepEqual(gps.records.map(r => r.lon), [7.491, 7.5, -1.234]);
    assert.deepEqual(gps.records.map(r => r.w), [3.25, 62.5, 0.125]);
    assert.equal(gps.numberQuestions.length, 0);

    // A French-Excel file: semicolons and decimal commas. Under an English
    // locale a birth weight of 3,250 kg became 3250.
    const poids = parseCSV('id;poids;temp\nA;3,250;38,5\nB;2,900;37,125\nC;3,1;39', { localeConfig });
    assert.deepEqual(poids.records.map(r => r.poids), [3.25, 2.9, 3.1]);
    assert.deepEqual(poids.records.map(r => r.temp), [38.5, 37.125, 39]);

    // Values the text itself settles.
    assert.equal(parseCSV('n\n1.234.567,89', { delimiter: ';', localeConfig }).records[0].n, 1234567.89);
    assert.deepEqual(parseCSV('n\n"1,234,567"\n"12,345.5"', { localeConfig }).records.map(r => r.n), [1234567, 12345.5]);
    assert.deepEqual(parseCSV('n\n1.5\n2.75', { delimiter: ';', localeConfig }).records.map(r => r.n), [1.5, 2.75]);
  }

  // Space-grouped numbers, with the no-break spaces French Excel writes.
  assert.deepEqual(parseCSV('id;pop\nA;1\u00a0234,5\nB;12\u202f345\nC;1 234').records.map(r => r.pop), [1234.5, 12345, 1234]);

  // Open-shaped values with nothing to settle them are read as decimals and
  // raised as a question, never multiplied by a thousand on a guess.
  const open = parseCSV('id;lat\nA;9.082\nB;12.345');
  assert.deepEqual(open.records.map(r => r.lat), [9.082, 12.345]);
  assert.equal(open.numberQuestions.length, 1);
  assert.equal(open.numberQuestions[0].suggested, 'decimal');
  assert.deepEqual(open.numberQuestions[0].previews, { decimal: 9.082, thousands: 9082 });
  assert.ok(open.warnings.some(w => w.level === 'check' && /decimal or a thousands/.test(w.message)));
  assert.deepEqual(parseCSV('id;lat\nA;9.082\nB;12.345', { numberChoices: { lat: 'thousands' } }).records.map(r => r.lat), [9082, 12345]);
  const quoted = parseCSV('id,count\nA,"1,234"\nB,856');
  assert.equal(quoted.records[0].count, 1.234);
  assert.equal(quoted.numberQuestions.length, 1);

  // The app's own export reads back unchanged under every delimiter, with a
  // value shaped like a thousands figure in it.
  const numberColumns = [
    { key: 'k', label: 'k', type: 'text' },
    { key: 'v', label: 'v', type: 'number' },
  ];
  const numberRecords = [{ id: '1', k: 'a', v: 23.125 }, { id: '2', k: 'b', v: 0.5 }, { id: '3', k: 'c', v: 1234.5 }, { id: '4', k: 'd', v: 9.082 }];
  for (const localeConfig of [germanCfg, usCfg]) {
    const exported = exportToCSV(numberColumns, numberRecords, { localeConfig });
    const back = parseCSV(exported, { localeConfig });
    assert.deepEqual(back.records.map(r => r.v), [23.125, 0.5, 1234.5, 9.082],
      `own export must re-import unchanged with delimiter "${localeConfig.csvDelimiter}"`);
  }
  // A column of only open-shaped decimals, exported and re-imported: still
  // unchanged, whichever delimiter.
  for (const localeConfig of [germanCfg, usCfg]) {
    const exported = exportToCSV(numberColumns, [{ id: '1', k: 'a', v: 9.082 }, { id: '2', k: 'b', v: 12.345 }], { localeConfig });
    assert.deepEqual(parseCSV(exported).records.map(r => r.v), [9.082, 12.345]);
  }

  // Export: a byte-order mark so Excel reads accents, and stored true/false
  // written as the Yes/No the line list shows.
  const exportedBool = exportToCSV(
    [{ key: 'n', label: 'Nom', type: 'text' }, { key: 'b', label: 'Hosp', type: 'boolean' }],
    [{ id: '1', n: 'Aïcha', b: true }, { id: '2', n: 'Koné', b: false }, { id: '3', n: 'x', b: null }]
  );
  assert.equal(exportedBool.charCodeAt(0), 0xfeff);
  assert.equal(exportedBool.slice(1), 'Nom,Hosp\nAïcha,Yes\nKoné,No\nx,');
  assert.equal(exportToCSV(numberColumns, [], { bom: false }), 'k,v');
  assert.deepEqual(parseCSV(exportedBool).records.map(r => r.nom), ['Aïcha', 'Koné', 'x'], 'the mark is not part of the first header');

  // ISO date columns must type as date (not number)
  const isoDates = parseCSV('onset\n2026-07-01\n2026-07-02', { localeConfig: usCfg });
  assert.equal(isoDates.columns[0].type, 'date');
  assert.equal(isoDates.records[0].onset, '2026-07-01');
  const isoDatesGerman = parseCSV('onset\n2026-07-01\n2026-07-02', { delimiter: ';', localeConfig: germanCfg });
  assert.equal(isoDatesGerman.columns[0].type, 'date');

  // ---- Quotes. A quotation mark opens a quoted field only at the start of
  // a field. One inch mark used to swallow the rest of the file.
  const inch = ['id,name,notes'];
  for (let i = 1; i <= 100; i++) inch.push(`${i},Person ${i},${i === 50 ? 'height 5" approx' : i === 80 ? 'said "ok"' : 'ok'}`);
  const inchResult = parseCSV(inch.join('\n'));
  assert.equal(inchResult.records.length, 100, 'no row may be folded into another');
  assert.equal(inchResult.records[49].notes, 'height 5" approx');
  assert.equal(inchResult.records[79].notes, 'said "ok"');
  assert.equal(inchResult.records[99].id_, 100);
  // A quote that opens a field and is never closed is kept as text, the rows
  // after it survive, and the import says where.
  const unclosed = parseCSV('id,notes\n1,ok\n2,"never closed\n3,fine\n4,fine');
  assert.equal(unclosed.records.length, 4);
  assert.equal(unclosed.records[1].notes, '"never closed');
  assert.equal(unclosed.records[3].id_, 4);
  assert.ok(unclosed.warnings.some(w => /no closing mark/.test(w.message) && /line 3/.test(w.message)));
  assert.equal(parseCSV('id,name\n1,O"Brien').records[0].name, 'O"Brien');

  // ---- Rows are never dropped for their length.
  const ragged = parseCSV('id,age,notes\nA,1,x\nB,2\nC,3,z,extra');
  assert.equal(ragged.records.length, 3);
  assert.equal(ragged.records[1].notes, null);
  assert.equal(ragged.columns.length, 4);
  assert.equal(ragged.columns[3].label, 'Column 4');
  assert.equal(ragged.records[2].column_4, 'extra');
  assert.ok(ragged.warnings.some(w => /fewer values/.test(w.message) && /line 3/.test(w.message)));
  assert.ok(ragged.warnings.some(w => /more values than the header/.test(w.message)));
  // A trailing delimiter is not a column.
  const trailing = parseCSV('id,age\nA,1,\nB,2,');
  assert.equal(trailing.columns.length, 2);
  assert.equal(trailing.records.length, 2);

  // ---- How the file is laid out.
  const titled = parseCSV('Cholera line list - District X\n\nid,age,onset\na,3,2025-03-04\nb,4,2025-03-05');
  assert.deepEqual(titled.columns.map(c => c.label), ['id', 'age', 'onset']);
  assert.equal(titled.records.length, 2);
  assert.ok(titled.warnings.some(w => w.level === 'info' && /treated as a title/.test(w.message)));
  const sepLine = parseCSV('sep=;\nid;age\nA;1\nB;2');
  assert.deepEqual(sepLine.columns.map(c => c.label), ['id', 'age']);
  assert.equal(sepLine.records.length, 2);
  // The delimiter is judged over several lines, not the header alone.
  assert.equal(detectDelimiter('id;Nom, prénom, surnom;âge\n1;Dupont, Jean;34\n2;Diop;28'), ';');
  assert.equal(parseCSV('id;Nom, prénom, surnom;âge\n1;Dupont, Jean;34\n2;Diop;28').columns.length, 3);
  assert.equal(parseCSV('\ufeff"id","age"\n"A","1"').columns[0].label, 'id');

  // Warnings come most consequential first.
  const ordered = parseCSV('age,when\n34,2025-03-05T01:00:00+03:00\nNA,2025-03-06T01:00:00+03:00\n40,nonsense\n41,2025-03-07T01:00:00+03:00\n42,2025-03-08T01:00:00+03:00\n43,2025-03-09T01:00:00+03:00');
  assert.deepEqual(ordered.warnings.map(w => w.level), ['changed', 'check', 'info']);
  assert.deepEqual(ordered.errors, ordered.warnings.map(w => w.message));

  // Nothing at all.
  assert.equal(parseCSV('').records.length, 0);
  assert.ok(parseCSV('').errors.includes('File is empty'));

  console.log('CSV parser regression checks passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
