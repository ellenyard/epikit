/**
 * Reading coordinates, and deciding which records can be mapped.
 *
 * A point in the wrong place looks exactly like a point in the right place.
 * These pin the cases that used to go wrong quietly: degrees-minutes-seconds
 * cut down to whole degrees, a west longitude that lost its sign, a pasted
 * minus sign that was not read as one, swapped columns that only a third of
 * the world's longitudes could reveal, and a dataset with no coordinates at
 * all being plotted from its age column.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-coordinates-test-'));
const bundled = path.join(tempDir, 'coordinates.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/coordinates.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    parseCoordinateValue,
    parseCoordinateDetailed,
    looksLikeCoordinatePair,
    isPlausibleCoordinateColumn,
    suggestCoordinateColumns,
    analyzeCoordinateQuality,
  } = await import(pathToFileURL(bundled).href);

  const near = (actual, expected, message) =>
    assert.ok(actual !== null && Math.abs(actual - expected) < 1e-6, `${message}: got ${actual}, expected ${expected}`);

  // 1. Decimal degrees, as numbers and as text, with either decimal mark.
  assert.equal(parseCoordinateValue(41.6528), 41.6528);
  assert.equal(parseCoordinateValue('41.6528'), 41.6528);
  assert.equal(parseCoordinateValue('  -1.2921 '), -1.2921);
  assert.equal(parseCoordinateValue('41,6528'), 41.6528, 'a decimal comma is a decimal mark');
  assert.equal(parseCoordinateValue('-83,5552'), -83.5552);
  assert.equal(parseCoordinateValue('+36.8'), 36.8);
  assert.equal(parseCoordinateValue('41.6528°'), 41.6528);
  assert.equal(parseCoordinateValue(0), 0);

  // 2. A minus sign from a word processor is still a minus sign. It used to be
  //    skipped, which moved Ohio to western China.
  assert.equal(parseCoordinateValue('−83.5552'), -83.5552, 'U+2212 MINUS SIGN');
  assert.equal(parseCoordinateValue('–83.5552'), -83.5552, 'en dash');

  // 3. Hemispheres, as letters or words, on either side. S and W are negative.
  assert.equal(parseCoordinateValue('83.5 W'), -83.5);
  assert.equal(parseCoordinateValue('W 83.5'), -83.5);
  assert.equal(parseCoordinateValue('W83.5'), -83.5);
  assert.equal(parseCoordinateValue('1.2921S'), -1.2921);
  assert.equal(parseCoordinateValue('36.8219E'), 36.8219);
  assert.equal(parseCoordinateValue('41.6528° N'), 41.6528);
  assert.equal(parseCoordinateValue('12.5 South'), -12.5, 'a spelled-out hemisphere used to be ignored');
  assert.equal(parseCoordinateValue('12.5 west'), -12.5);
  assert.equal(parseCoordinateValue('North 12.5'), 12.5);
  assert.equal(parseCoordinateDetailed('83.5 W').hemisphere, 'W');
  assert.equal(parseCoordinateDetailed('41.65').hemisphere, null);

  // 4. Degrees, minutes and seconds are read in full. They used to be cut down
  //    to the degrees, up to 111 km out, and a west longitude came out east.
  near(parseCoordinateValue('41°39\'10"N'), 41 + 39 / 60 + 10 / 3600, 'DMS north');
  near(parseCoordinateValue('83°33\'18"W'), -(83 + 33 / 60 + 18 / 3600), 'DMS west keeps its sign');
  near(parseCoordinateValue('41° 39\' 10.1" N'), 41 + 39 / 60 + 10.1 / 3600, 'DMS with spaces');
  near(parseCoordinateValue('41 39 10 N'), 41 + 39 / 60 + 10 / 3600, 'DMS separated by spaces');
  near(parseCoordinateValue('S 01°17\'31"'), -(1 + 17 / 60 + 31 / 3600), 'hemisphere first');
  near(parseCoordinateValue('41° 39.167\' N'), 41 + 39.167 / 60, 'degrees and decimal minutes');
  near(parseCoordinateValue('41°39′10″N'), 41 + 39 / 60 + 10 / 3600, 'typographic prime marks');
  near(parseCoordinateValue('-41 39 10'), -(41 + 39 / 60 + 10 / 3600), 'signed DMS');
  assert.equal(parseCoordinateDetailed('41°39\'10"N').format, 'dms');

  // 5. Anything that cannot be read in full is not read at all. Each of these
  //    used to yield its first number.
  for (const unreadable of [
    '41.6528, -83.5552',            // both coordinates in one cell
    '-1.2921 36.8219 1795 5',       // Kobo geopoint
    'POINT(36.82 -1.29)',           // WKT
    '1,234.5',                      // thousands separator
    'GPS 12.5',
    '12.5 km',
    'C001',
    'N/A',
    'unknown',
    '',
    '   ',
    '41°75\'10"N',                  // 75 minutes
    '41°39\'75"N',                  // 75 seconds
    '-12.5 N',                      // contradicts itself
    'N 12.5 S',
    '41d 39m 10s',                  // "s" would be seconds or south
    '4.5E1',
  ]) {
    assert.equal(parseCoordinateValue(unreadable), null, `"${unreadable}" should be unreadable, not partly read`);
  }
  assert.equal(parseCoordinateValue(null), null);
  assert.equal(parseCoordinateValue(undefined), null);
  assert.equal(parseCoordinateValue(NaN), null);

  assert.ok(looksLikeCoordinatePair('41.6528, -83.5552'));
  assert.ok(looksLikeCoordinatePair('-1.2921 36.8219 1795 5'));
  assert.ok(looksLikeCoordinatePair('POINT(36.82 -1.29)'));
  assert.ok(!looksLikeCoordinatePair('41.6528'));
  assert.ok(!looksLikeCoordinatePair(41.6528));

  // ---------------------------------------------------------------------
  // Which columns are coordinates
  // ---------------------------------------------------------------------

  const column = (key, type = 'number', label = key) => ({ key, label, type });
  const rows = (count, make) => Array.from({ length: count }, (_, i) => ({ id: String(i), ...make(i) }));

  // 6. A dataset without coordinates gets no selection. The bundled nutrition
  //    survey used to open with "Age (months)" as both axes: 300 points in a
  //    straight line from Nigeria to Russia, reported as "300 of 300 mapped".
  const nutritionColumns = [
    column('child_id', 'text', 'Child ID'),
    column('age_months', 'number', 'Age (months)'),
    column('sex', 'categorical', 'Sex'),
    column('whz', 'number', 'WHZ Score'),
    column('survey_cluster', 'number', 'Survey Cluster'),
    column('survey_date', 'date', 'Survey Date'),
  ];
  const nutritionRecords = rows(60, i => ({
    child_id: `CH${String(i + 1).padStart(4, '0')}`,
    age_months: 6 + (i % 54),
    sex: i % 2 ? 'F' : 'M',
    whz: Number((-3 + (i % 50) * 0.11).toFixed(2)),
    survey_cluster: 1 + (i % 30),
    survey_date: '2025-03-01',
  }));
  assert.deepEqual(suggestCoordinateColumns(nutritionColumns, nutritionRecords), { lat: '', lng: '' });
  for (const axis of ['lat', 'lng']) {
    for (const key of ['child_id', 'age_months', 'sex', 'survey_cluster', 'survey_date']) {
      assert.ok(!isPlausibleCoordinateColumn(nutritionColumns.find(c => c.key === key), nutritionRecords, axis),
        `"${key}" should not be offered as a ${axis} column`);
    }
  }

  // 7. Nor does one whose only "lat" is the middle of "population". That
  //    substring match picked District Population as the latitude.
  const surveillanceColumns = [
    column('report_id', 'text', 'Report ID'),
    column('quarter', 'categorical', 'Quarter'),
    column('cases', 'number', 'Cases Reported'),
    column('population', 'number', 'District Population'),
  ];
  const surveillanceRecords = rows(40, i => ({
    report_id: `SR${String(i).padStart(4, '0')}`, quarter: `Q${1 + (i % 4)}`, cases: i % 30, population: 120000 + i * 37,
  }));
  assert.deepEqual(suggestCoordinateColumns(surveillanceColumns, surveillanceRecords), { lat: '', lng: '' });

  // 8. Real coordinate columns are found under the names field tools give them.
  const points = rows(30, i => ({ a: 41.6 + i * 0.001, b: -83.5 - i * 0.001 }));
  for (const [latKey, lngKey] of [
    ['latitude', 'longitude'], ['lat', 'lon'], ['Lat', 'Long'], ['_gps_latitude', '_gps_longitude'],
    ['household_location-Latitude', 'household_location-Longitude'], ['gpsLatitude', 'gpsLongitude'], ['y_lat', 'x_lng'],
  ]) {
    const columns = [column('age'), column(latKey), column(lngKey)];
    const records = points.map((p, i) => ({ id: p.id, age: 20 + i, [latKey]: p.a, [lngKey]: p.b }));
    assert.deepEqual(suggestCoordinateColumns(columns, records), { lat: latKey, lng: lngKey },
      `${latKey}/${lngKey} should be selected`);
  }

  // 9. One axis on its own selects nothing, and a column is never both axes.
  assert.deepEqual(
    suggestCoordinateColumns([column('latitude')], points.map(p => ({ id: p.id, latitude: p.a }))),
    { lat: '', lng: '' }
  );
  assert.deepEqual(
    suggestCoordinateColumns([column('lat_long', 'text')], points.map(p => ({ id: p.id, lat_long: `${p.a}, ${p.b}` }))),
    { lat: '', lng: '' }
  );

  // 10. A column named like an axis but full of something else is not chosen.
  const mislabelled = points.map((p, i) => ({ id: p.id, latitude: 5000 + i, longitude: p.b }));
  assert.deepEqual(suggestCoordinateColumns([column('latitude'), column('longitude')], mislabelled), { lat: '', lng: '' });

  // 11. "long" is also a word. The true longitude wins over "how long ill".
  const withDuration = points.map((p, i) => ({ id: p.id, how_long_ill: 1 + (i % 9), latitude: p.a, longitude: p.b }));
  assert.deepEqual(
    suggestCoordinateColumns([column('how_long_ill'), column('latitude'), column('longitude')], withDuration),
    { lat: 'latitude', lng: 'longitude' }
  );

  // 12. Text columns in degrees and minutes can still be chosen by hand.
  const dmsRecords = rows(10, i => ({ ns: `41°${10 + i}'10"N`, ew: `83°${20 + i}'18"W` }));
  assert.ok(isPlausibleCoordinateColumn(column('ns', 'text'), dmsRecords, 'lat'));
  assert.ok(isPlausibleCoordinateColumn(column('ew', 'text'), dmsRecords, 'lng'));

  // ---------------------------------------------------------------------
  // Which records are mapped
  // ---------------------------------------------------------------------

  // 13. Every problem is counted and the record kept off the map, with a reason.
  const mixed = [
    { id: 'ok1', lat: 41.6528, lon: -83.5552 },
    { id: 'ok2', lat: '41,6601', lon: '-83,5601' },
    { id: 'dms', lat: '41°39\'10"N', lon: '83°33\'18"W' },
    { id: 'nolat', lat: '', lon: -83.5 },
    { id: 'nolon', lat: 41.6, lon: null },
    { id: 'zero', lat: 0, lon: 0 },
    { id: 'range', lat: 141.6, lon: -83.5 },
    { id: 'text', lat: 'unknown', lon: -83.5 },
    { id: 'pair', lat: '41.65, -83.55', lon: '41.65, -83.55' },
    { id: 'swapletters', lat: '83.5552 W', lon: '41.6528 N' },
    { id: 'swaprange', lat: -183.5, lon: 41.6 },
  ];
  const qa = analyzeCoordinateQuality(mixed, 'lat', 'lon');
  assert.equal(qa.totalRecords, 11);
  assert.deepEqual(qa.usable.map(row => row.record.id), ['ok1', 'ok2', 'dms']);
  assert.equal(qa.validCoordinates, 3);
  assert.equal(qa.missingLatitude, 1);
  assert.equal(qa.missingLongitude, 1);
  assert.equal(qa.zeroPlaceholders, 1);
  assert.equal(qa.outOfRange, 2);
  assert.equal(qa.unparseable, 2);
  assert.equal(qa.combinedValues, 1);
  assert.equal(qa.likelySwapped, 2, 'compass letters on the wrong axis, and an out-of-range value that fits the other way');
  assert.equal(qa.excludedRecords.length, 8);
  assert.equal(qa.validCoordinates + qa.excludedRecords.length, qa.totalRecords, 'every record is mapped or excluded');
  for (const excluded of qa.excludedRecords) {
    assert.ok(String(excluded._map_exclusion_reason).length > 0, `${excluded.id} has no exclusion reason`);
  }
  const dms = qa.usable.find(row => row.record.id === 'dms');
  near(dms.lat, 41 + 39 / 60 + 10 / 3600, 'DMS latitude on the map');
  near(dms.lng, -(83 + 33 / 60 + 18 / 3600), 'DMS longitude on the map');

  // 14. A swapped record is found from the data itself, wherever it is. The
  //     range test alone only works where longitude exceeds 90 degrees: it
  //     missed Africa, Europe, most of South Asia, South America and the
  //     eastern United States.
  for (const [place, lat, lng] of [
    ['Nairobi', -1.2921, 36.8219], ['Lagos', 6.5244, 3.3792], ['Delhi', 28.6139, 77.2090],
    ['Lima', -12.0464, -77.0428], ['Kampala', 0.3476, 32.5825], ['Toledo', 41.6528, -83.5552],
    ['Dhaka', 23.8103, 90.4125], ['Manila', 14.5995, 120.9842],
  ]) {
    const good = rows(20, i => ({ lat: lat + (i % 5) * 0.004, lon: lng + Math.floor(i / 5) * 0.004 }));
    const swapped = [
      { id: 'swap-a', lat: lng + 0.003, lon: lat + 0.002 },
      { id: 'swap-b', lat: lng + 0.006, lon: lat + 0.005 },
    ];
    const result = analyzeCoordinateQuality([...good, ...swapped], 'lat', 'lon');
    assert.equal(result.likelySwapped, 2, `${place}: the two swapped records should be flagged`);
    assert.equal(result.validCoordinates, 20, `${place}: only the good records should be mapped`);
    assert.ok(result.usable.every(row => !String(row.record.id).startsWith('swap')),
      `${place}: a swapped record was left on the map`);
  }

  // 15. A real outlier is not mistaken for a swap: a travel-associated case in
  //     another country stays on the map.
  const nairobi = rows(20, i => ({ lat: -1.29 + (i % 5) * 0.004, lon: 36.82 + Math.floor(i / 5) * 0.004 }));
  const traveller = { id: 'traveller', lat: 51.5074, lon: -0.1278 };
  const withTraveller = analyzeCoordinateQuality([...nairobi, traveller], 'lat', 'lon');
  assert.equal(withTraveller.likelySwapped, 0);
  assert.equal(withTraveller.validCoordinates, 21);

  // 16. A place where latitude and longitude are nearly equal has nothing to
  //     tell apart, and nothing is flagged.
  const diagonal = rows(20, i => ({ lat: 10 + (i % 5) * 0.01, lon: 10.2 + Math.floor(i / 5) * 0.01 }));
  assert.equal(analyzeCoordinateQuality(diagonal, 'lat', 'lon').likelySwapped, 0);

  // 17. Columns chosen the wrong way round are called out by their names when
  //     the values alone cannot show it.
  const backwards = analyzeCoordinateQuality(
    nairobi.map(r => ({ id: r.id, longitude: r.lon, latitude: r.lat })), 'longitude', 'latitude',
    [column('longitude'), column('latitude')]
  );
  assert.equal(backwards.columnsLookSwapped, true);
  assert.equal(analyzeCoordinateQuality(nairobi, 'lat', 'lon', [column('lat'), column('lon')]).columnsLookSwapped, false);

  // 18. Duplicates and coarse values are still reported.
  const repeated = analyzeCoordinateQuality([
    { id: '1', lat: 41.65, lon: -83.55 }, { id: '2', lat: 41.65, lon: -83.55 }, { id: '3', lat: 41.6612, lon: -83.5713 },
  ], 'lat', 'lon');
  assert.equal(repeated.duplicateCoordinates, 2);
  assert.equal(repeated.lowPrecision, 2);

  // 19. No columns chosen is an empty result, not an error.
  const none = analyzeCoordinateQuality(mixed, '', '');
  assert.equal(none.validCoordinates, 0);
  assert.equal(none.excludedRecords.length, 0);

  console.log('coordinates regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
