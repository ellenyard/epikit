/**
 * Location obfuscation guarantees.
 *
 * These assert the properties the spot map's privacy promise depends on. The
 * exports previously shipped exact coordinates in files labelled as jittered,
 * and nothing would have caught that recurring, so the invariants are pinned
 * here rather than left to manual checking.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-geo-test-'));
const bundled = path.join(tempDir, 'geoPrivacy.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/geoPrivacy.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    jitterCoordinates, jitterOffset, metresBetween, sha256,
    createJitterSecret, isJitterSecret, jitterSeed,
    normalizeJitterDistance, jitterMinimumDistance,
    JITTER_MIN_FRACTION, JITTER_OUTPUT_DECIMALS,
    findWithheldColumns, buildSpotMapExport,
  } = await import(pathToFileURL(bundled).href);

  const LAT = 41.6723, LNG = -83.6145, R = 500;
  const INNER = R * JITTER_MIN_FRACTION;
  // A published coordinate is rounded to about a metre, so distances measured
  // from it can be out by the diagonal of one rounding cell.
  const ROUNDING = 1;
  const points = Array.from({ length: 2000 }, (_, i) =>
    jitterCoordinates(LAT, LNG, R, `record-${i}`));
  const dists = points.map(p => metresBetween(LAT, LNG, p.lat, p.lng)).sort((a, b) => a - b);

  // 0. The hash underneath is SHA-256, checked against Node's own. An offset
  //    drawn from a weak hash would reduce the secret to a few guessable bits.
  for (const message of ['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'é漢字 '.repeat(40)]) {
    assert.equal(
      Buffer.from(sha256(message)).toString('hex'),
      createHash('sha256').update(message).digest('hex'),
      `sha256 disagrees with Node for a ${message.length}-character message`
    );
  }

  // 1. The stated distance is a hard bound. A point displaced further than
  //    claimed is not a privacy failure, but it undermines the label.
  assert.ok(dists[dists.length - 1] <= R + ROUNDING,
    `max displacement ${dists[dists.length - 1].toFixed(1)}m exceeds the stated ${R}m`);

  // 2. Points must actually move, and by at least the minimum. A uniform disc
  //    put about 6% of points within 50 m of the truth at the 200 m setting.
  assert.ok(dists[0] >= INNER - ROUNDING,
    `a point moved only ${dists[0].toFixed(1)}m; the minimum is ${INNER}m`);

  // 3. Uniform by area over the ring between the minimum and the stated
  //    distance, not uniform in radius. A uniform radius packs points toward
  //    the inner edge, so the true location sits closer to the published one
  //    than the stated distance implies.
  const mean = dists.reduce((s, v) => s + v, 0) / dists.length;
  const median = dists[Math.floor(dists.length / 2)];
  const expectedMean = (2 / 3) * (R ** 3 - INNER ** 3) / (R ** 2 - INNER ** 2);
  const expectedMedian = Math.sqrt((R ** 2 + INNER ** 2) / 2);
  assert.ok(Math.abs(mean - expectedMean) < R * 0.05,
    `mean displacement ${mean.toFixed(0)}m should be near ${expectedMean.toFixed(0)}m for a uniform ring`);
  assert.ok(Math.abs(median - expectedMedian) < R * 0.06,
    `median displacement ${median.toFixed(0)}m should be near ${expectedMedian.toFixed(0)}m for a uniform ring`);

  // 4. Deterministic. Re-randomising would let repeated exports be averaged to
  //    recover the true position, defeating the whole mechanism.
  const a = jitterCoordinates(LAT, LNG, R, 'stable-seed');
  const b = jitterCoordinates(LAT, LNG, R, 'stable-seed');
  assert.deepEqual(a, b, 'the same seed must always give the same offset');

  // 5. Different seeds land in different places, in both axes. If offsets
  //    collapsed onto one direction the displacement would be predictable.
  //    Measured on the offset itself: published coordinates are rounded to a
  //    metre, so many of them share a latitude by design.
  const offsets = Array.from({ length: 2000 }, (_, i) => jitterOffset(`record-${i}`, R));
  const distinctNorth = new Set(offsets.map(o => o.north.toFixed(3))).size;
  const distinctEast = new Set(offsets.map(o => o.east.toFixed(3))).size;
  assert.ok(distinctNorth > offsets.length * 0.99, `only ${distinctNorth} distinct northings from ${offsets.length} seeds`);
  assert.ok(distinctEast > offsets.length * 0.99, `only ${distinctEast} distinct eastings from ${offsets.length} seeds`);
  assert.ok(new Set(points.map(p => `${p.lat},${p.lng}`)).size > points.length * 0.99,
    'different seeds must give different published points');

  // 6. Direction and distance must vary independently. If they were tied, the
  //    offset would be predictable from either one alone. Checked as joint
  //    coverage: bucket each offset by compass octant and by quarter of the
  //    ring's width, and require all 32 cells to be reached. Counting
  //    quadrants alone is too weak, since a correlated generator still reaches
  //    all four.
  const cells = new Set();
  for (let i = 0; i < 2000; i++) {
    const { north, east } = jitterOffset(`record-${i}`, R);
    const octant = Math.floor(((Math.atan2(north, east) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4));
    const quartile = Math.min(3, Math.floor(((Math.hypot(north, east) - INNER) / (R - INNER)) * 4));
    cells.add(`${octant}-${quartile}`);
  }
  assert.ok(cells.size >= 31,
    `offsets reached only ${cells.size} of 32 direction/distance cells, suggesting the two are tied together`);

  // 7. Zero distance is an explicit opt out and must not move the point.
  const unmoved = jitterCoordinates(LAT, LNG, 0, 'seed');
  assert.deepEqual(unmoved, { lat: LAT, lng: LNG }, 'a distance of 0 must leave the point exactly');

  // 8. Displacement is isotropic on the ground, so it must hold at high
  //    latitude too, where a degree of longitude is much shorter.
  for (const lat of [0, 41.67, 65, 78]) {
    const far = Array.from({ length: 400 }, (_, i) =>
      jitterCoordinates(lat, 10, R, `high-${i}`));
    const d = far.map(p => metresBetween(lat, 10, p.lat, p.lng));
    assert.ok(Math.max(...d) <= R + ROUNDING,
      `at latitude ${lat} the max displacement was ${Math.max(...d).toFixed(0)}m`);
    const m = d.reduce((s, v) => s + v, 0) / d.length;
    assert.ok(Math.abs(m - expectedMean) < R * 0.08,
      `at latitude ${lat} the mean displacement was ${m.toFixed(0)}m`);
  }

  // 9. The bounds scale with the setting.
  for (const r of [200, 500, 1000, 2000]) {
    const d = Array.from({ length: 500 }, (_, i) => {
      const p = jitterCoordinates(LAT, LNG, r, `s${i}`);
      return metresBetween(LAT, LNG, p.lat, p.lng);
    });
    assert.ok(Math.max(...d) <= r + ROUNDING,
      `at a ${r}m setting the max displacement was ${Math.max(...d).toFixed(0)}m`);
    assert.ok(Math.min(...d) >= jitterMinimumDistance(r) - ROUNDING,
      `at a ${r}m setting a point moved only ${Math.min(...d).toFixed(0)}m`);
  }

  // 10. Near a pole and across the antimeridian the result is still a valid
  //     coordinate. Dividing by cos(latitude) once sent a point at 89.9995
  //     degrees a quarter of the way round the world.
  for (const [lat, lng] of [[89.9995, 10], [-89.9995, 10], [-17.7, 179.9995], [-17.7, -179.9995]]) {
    for (let i = 0; i < 50; i++) {
      const p = jitterCoordinates(lat, lng, 2000, `edge-${i}`);
      assert.ok(p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180,
        `(${lat}, ${lng}) was moved to an invalid coordinate (${p.lat}, ${p.lng})`);
    }
  }

  // 11. Only the distances on offer are accepted from a saved setting or a
  //     recipe. Zero would draw exact locations under a "jittered" notice.
  for (const bad of [0, -5, 1, 50, 1e9, NaN, '500', null, undefined]) {
    assert.equal(normalizeJitterDistance(bad), 500, `${String(bad)} should fall back to the default distance`);
  }
  for (const good of [200, 500, 1000, 2000]) assert.equal(normalizeJitterDistance(good), good);

  // ---------------------------------------------------------------------
  // The export must not be enough to recover the true point.
  // ---------------------------------------------------------------------

  assert.ok(isJitterSecret(createJitterSecret()), 'a new secret must be 128 bits of hex');
  assert.notEqual(createJitterSecret(), createJitterSecret(), 'two secrets must differ');
  // A fixed secret from here on, so that the checks below do the same thing on
  // every run.
  const secret = '5f0c2a9d47e1b83660d4a7f2c19e3b58';
  assert.ok(isJitterSecret(secret));
  assert.equal(isJitterSecret('demo'), false);
  assert.equal(isJitterSecret(undefined), false);

  const columns = [
    { key: 'case_id', label: 'Case ID', type: 'text' },
    { key: 'patient_name', label: 'Patient name', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'gps', label: 'gps', type: 'text' },
    { key: '_gps_latitude', label: '_gps_latitude', type: 'number' },
    { key: '_gps_longitude', label: '_gps_longitude', type: 'number' },
    { key: 'y', label: 'Y', type: 'number' },
    { key: 'district', label: 'District', type: 'text' },
    { key: 'month_name', label: 'Month name', type: 'text' },
    { key: 'status', label: 'Status', type: 'categorical' },
    { key: 'age', label: 'Age', type: 'number' },
  ];
  // Five-decimal coordinates, as a phone GPS or a geocoder gives them.
  const records = Array.from({ length: 12 }, (_, i) => {
    const lat = Number((-1.29214 + i * 0.00311).toFixed(5));
    const lng = Number((36.82195 + i * 0.00273).toFixed(5));
    return {
      id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
      case_id: `KE-${100 + i}`,
      patient_name: `Synthetic Person ${i}`,
      phone: `07000000${String(i).padStart(2, '0')}`,
      gps: `${lat} ${lng} 1795 5`,
      _gps_latitude: lat,
      _gps_longitude: lng,
      y: lat,
      district: 'Westlands',
      month_name: 'March',
      status: i % 2 ? 'Confirmed' : 'Suspected',
      age: 20 + i,
    };
  });
  const truth = records.map(record => ({ record, lat: record._gps_latitude, lng: record._gps_longitude }));

  // 12. Columns that would undo the jitter are found: the other copies of the
  //     position (by name, by content, and under a name that says nothing),
  //     and direct identifiers. Area names and study ids are kept.
  const withheld = findWithheldColumns(columns, records, '_gps_latitude', '_gps_longitude', truth);
  const withheldKeys = withheld.map(column => column.key).sort();
  assert.deepEqual(withheldKeys, ['gps', 'patient_name', 'phone', 'y'],
    `withheld columns were ${withheldKeys.join(', ')}`);
  assert.equal(withheld.find(column => column.key === 'y').reason, 'coordinates',
    'a numeric copy of the latitude must be recognised whatever it is called');

  // Names that must be caught, and names that must not.
  const named = (key, label = key) => findWithheldColumns([{ key, label, type: 'text' }], [], 'lat', 'lon').length > 0;
  for (const key of ['location', 'household_location', 'geopoint', 'hh-Latitude', 'gpsLongitude', 'address',
    'street', 'surname', 'first_name', 'name', 'caregiver_name', 'email', 'mobile', 'dob', 'date_of_birth',
    'national_id', 'postcode', 'what3words', 'utm_easting']) {
    assert.ok(named(key), `"${key}" should be withheld`);
  }
  for (const key of ['district', 'district_name', 'facility_name', 'village', 'month_name', 'case_status',
    'onset_date', 'age', 'sex', 'participant_id', 'ate_potato_salad', 'how_long_ill', 'latency_days']) {
    assert.ok(!named(key), `"${key}" should not be withheld`);
  }

  const DISTANCE = 500;
  const cases = truth.map(({ record, lat, lng }) => {
    const moved = jitterCoordinates(lat, lng, DISTANCE, jitterSeed(secret, lat, lng, DISTANCE));
    return { record, lat, lng, displayLat: moved.lat, displayLng: moved.lng };
  });
  const exported = buildSpotMapExport({
    cases, columns, latColumn: '_gps_latitude', lngColumn: '_gps_longitude',
    obfuscate: true, jitterDistance: DISTANCE, withheldKeys,
  });
  const geojsonText = JSON.stringify(exported.geojson);

  // 13. Nothing in the file says where the point really is or who it is.
  assert.ok(!geojsonText.includes(secret), 'the jitter secret must never be exported');
  for (const feature of exported.geojson.features) {
    assert.ok(!('id' in feature.properties), 'the internal record id must not be exported');
    for (const key of withheldKeys) {
      assert.ok(!(key in feature.properties), `withheld column "${key}" was exported`);
    }
    assert.equal(feature.properties._location_privacy, `jittered_${DISTANCE}m`);
    assert.ok(!('_original_latitude' in feature.properties));
  }
  cases.forEach((caseData, index) => {
    const feature = exported.geojson.features[index];
    assert.deepEqual(feature.geometry.coordinates, [caseData.displayLng, caseData.displayLat]);
    assert.equal(feature.properties._gps_latitude, caseData.displayLat, 'the latitude column must carry the jittered value');
    assert.equal(feature.properties._gps_longitude, caseData.displayLng, 'the longitude column must carry the jittered value');
    // The true position, as a pair. One axis on its own can coincide with
    // another record's jittered value by chance, which gives nothing away.
    for (const other of exported.geojson.features) {
      assert.ok(
        !(other.geometry.coordinates[0] === caseData.lng && other.geometry.coordinates[1] === caseData.lat),
        `the true position of ${caseData.record.case_id} is a point in the export`);
    }
    assert.ok(!geojsonText.includes(caseData.record.gps), 'a combined coordinate string appears in the export');
    assert.ok(!geojsonText.includes(caseData.record.id), 'a record id appears in the export');
    assert.ok(!geojsonText.includes(caseData.record.patient_name), 'a patient name appears in the export');
  });
  assert.deepEqual(exported.geojson.linelist_withheld_columns.slice().sort(), withheldKeys,
    'the file must say which columns were withheld');
  assert.deepEqual(exported.columns.map(column => column.key),
    columns.map(column => column.key).filter(key => !withheldKeys.includes(key)),
    'the CSV must have the same columns less the withheld ones');
  for (const row of exported.records) {
    for (const key of withheldKeys) assert.ok(!(key in row), `withheld column "${key}" is in the CSV rows`);
  }

  // 14. Published coordinates carry no more precision than the stated number
  //     of decimals. With full precision, `true + offset` can be tested
  //     exactly against candidates, which is how the old export was reversed.
  for (const caseData of cases) {
    for (const value of [caseData.displayLat, caseData.displayLng]) {
      assert.equal(Number(value.toFixed(JITTER_OUTPUT_DECIMALS)), value,
        `${value} has more than ${JITTER_OUTPUT_DECIMALS} decimals`);
    }
  }

  // 15. The attack that worked. The old seed was the record id, the true
  //     coordinate and the distance; the first and last were in the export, so
  //     every coordinate within the radius could be tried until one reproduced
  //     the published point. Run it here with everything an attacker has: the
  //     source code and every value in the file. It must not single out the
  //     true point.
  const feature = exported.geojson.features[0];
  const target = cases[0];
  const [pubLng, pubLat] = feature.geometry.coordinates;
  const known = [...Object.values(feature.properties).map(String), 'undefined', ''];
  const scale = 1e5;
  const reach = (DISTANCE / 111320) * 1.05;
  const reachLng = reach / Math.cos((pubLat * Math.PI) / 180);
  let tried = 0;
  let reproduced = 0;
  for (let i = Math.round((pubLat - reach) * scale); i <= Math.round((pubLat + reach) * scale); i += 7) {
    for (let j = Math.round((pubLng - reachLng) * scale); j <= Math.round((pubLng + reachLng) * scale); j += 7) {
      const lat = i / scale, lng = j / scale;
      tried++;
      // The former seed format, and the present one with a guessed secret.
      for (const guess of [known[0], known[1], '']) {
        const p = jitterCoordinates(lat, lng, DISTANCE, `${guess}|${lat}|${lng}|${DISTANCE}`);
        if (p.lat === pubLat && p.lng === pubLng) reproduced++;
      }
    }
  }
  // And at the true point itself, with every exported value tried as the key.
  for (const guess of known) {
    for (const seed of [
      `${guess}|${target.lat}|${target.lng}|${DISTANCE}`,
      jitterSeed(guess, target.lat, target.lng, DISTANCE),
    ]) {
      const p = jitterCoordinates(target.lat, target.lng, DISTANCE, seed);
      assert.ok(!(p.lat === pubLat && p.lng === pubLng),
        'the published point was reproduced from the true point using only exported values');
    }
  }
  assert.ok(tried > 10000, 'the search should cover the whole radius');
  // Without the secret each try is a random draw over roughly a million
  // one-metre cells, so a handful of chance hits is the most that can occur.
  // The old export gave exactly one hit, at the true point.
  assert.ok(reproduced <= 3,
    `${reproduced} of ${tried} candidate points reproduced the published point without the secret`);

  // 16. The secret is what places the point: another browser's secret puts the
  //     same household somewhere else, and the right one reproduces it.
  const again = jitterCoordinates(target.lat, target.lng, DISTANCE, jitterSeed(secret, target.lat, target.lng, DISTANCE));
  assert.deepEqual([again.lat, again.lng], [pubLat, pubLng], 'the same secret must reproduce the point');
  const other = jitterCoordinates(target.lat, target.lng, DISTANCE,
    jitterSeed('a3d91c07e45f6b2889c0d7e1f4a2b635', target.lat, target.lng, DISTANCE));
  assert.notDeepEqual([other.lat, other.lng], [pubLat, pubLng], 'a different secret must move the point elsewhere');

  // 17. No offset lattice. The old generator had 3,600 directions and 10,000
  //     distances; the true point could be picked out as the only candidate
  //     whose offset lay on that grid, with no knowledge of the seed at all.
  const directions = new Set();
  const radii = new Set();
  for (let i = 0; i < 20000; i++) {
    const { north, east } = jitterOffset(`lattice-${i}`, DISTANCE);
    directions.add(Math.atan2(north, east).toFixed(9));
    radii.add(Math.hypot(north, east).toFixed(6));
  }
  assert.ok(directions.size > 19990, `only ${directions.size} distinct directions in 20,000 draws`);
  assert.ok(radii.size > 19990, `only ${radii.size} distinct distances in 20,000 draws`);

  // 18. Records at one address move together. Given an offset each, several
  //     cases in a household would surround it, and their centre is the house.
  const sameHouse = [1, 2, 3].map(() =>
    jitterCoordinates(target.lat, target.lng, DISTANCE, jitterSeed(secret, target.lat, target.lng, DISTANCE)));
  assert.deepEqual(sameHouse[0], sameHouse[1]);
  assert.deepEqual(sameHouse[1], sameHouse[2]);

  // 19. Each distance setting is an independent draw. If the direction were
  //     reused and only scaled, two exports at different settings would lie on
  //     a line through the true point.
  const bearings = [200, 500, 1000, 2000].map(distance => {
    const { north, east } = jitterOffset(jitterSeed(secret, target.lat, target.lng, distance), distance);
    return Math.atan2(north, east);
  });
  assert.equal(new Set(bearings.map(bearing => bearing.toFixed(6))).size, 4,
    'each distance setting must have its own direction');

  // 20. With obfuscation off the export is the data as it is, and says so. The
  //     internal id is still not a column and still not exported.
  const exact = buildSpotMapExport({
    cases: cases.map(c => ({ ...c, displayLat: c.lat, displayLng: c.lng })),
    columns, latColumn: '_gps_latitude', lngColumn: '_gps_longitude',
    obfuscate: false, jitterDistance: DISTANCE, withheldKeys,
  });
  assert.equal(exact.geojson.features[0].properties._location_privacy, 'exact');
  assert.equal(exact.geojson.features[0].properties.gps, records[0].gps);
  assert.equal(exact.geojson.features[0].properties._original_latitude, records[0]._gps_latitude);
  assert.ok(!('id' in exact.geojson.features[0].properties));
  assert.equal(exact.columns.length, columns.length, 'nothing is withheld when the user has chosen exact locations');

  console.log('geoPrivacy regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
