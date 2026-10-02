import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-area-map-test-'));
const bundledUtils = path.join(tempDir, 'areaMap.mjs');

const boundaries = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { district: 'North' }, geometry: null },
    { type: 'Feature', properties: { district: 'South' }, geometry: null },
    { type: 'Feature', properties: { district: 'East' }, geometry: null },
  ],
};

const records = [
  { id: '1', district: 'North' },
  { id: '2', district: 'North' },
  { id: '3', district: 'South' },
  { id: '4', district: 'West' },
];

const denominatorDataset = {
  id: 'denominator',
  name: 'Census',
  source: 'import',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  columns: [
    { key: 'district', label: 'District', type: 'text' },
    { key: 'population', label: 'Population', type: 'number' },
  ],
  records: [
    { id: 'd1', district: 'North', population: 1000 },
    { id: 'd2', district: 'South', population: 500 },
    { id: 'd3', district: 'Central', population: 700 },
  ],
};

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/areaMap.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundledUtils,
    logLevel: 'silent',
  });

  const {
    buildAreaJoin,
    SMALL_COUNT_THRESHOLD,
    suppressSmallCounts,
    buildJoinReport,
    classifyValues,
    normalizeAreaKey,
    buildLegendClasses,
    classColor,
    getClassIndex,
    parseManualBreaks,
    MAX_CLASSES,
    getGeoJsonPropertyKeys,
    suggestBoundaryKey,
    suggestJoinFields,
    validateBoundaryGeoJson,
    rememberBoundaries,
    recallBoundaries,
  } = await import(pathToFileURL(bundledUtils).href);

  assert.equal(normalizeAreaKey('  Sao  Tome  '), 'sao tome');

  const countJoin = buildAreaJoin({
    records,
    areaField: 'district',
    boundaries,
    boundaryKey: 'district',
    metric: 'count',
  });
  assert.equal(countJoin.areas.find(area => area.label === 'North')?.count, 2);
  assert.equal(countJoin.areas.find(area => area.label === 'South')?.count, 1);
  assert.deepEqual(countJoin.summary.unmatchedDataKeys, ['West']);
  assert.deepEqual(countJoin.summary.unmatchedBoundaryKeys, ['East']);

  const rateJoin = buildAreaJoin({
    records,
    areaField: 'district',
    boundaries,
    boundaryKey: 'district',
    metric: 'rate',
    denominatorDataset,
    denominatorKey: 'district',
    denominatorValue: 'population',
    rateMultiplier: 100000,
  });
  assert.equal(rateJoin.areas.find(area => area.label === 'North')?.rate, 200);
  assert.equal(rateJoin.areas.find(area => area.label === 'South')?.rate, 200);
  assert.deepEqual(rateJoin.summary.unmatchedDenominatorKeys, ['Central']);
  assert.deepEqual(rateJoin.summary.missingDenominatorKeys, []);

  const report = buildJoinReport(rateJoin);
  assert.ok(report.some(row => row.area_label === 'West' && row.issue.includes('Observation area')));
  assert.deepEqual(classifyValues([1, 2, 3, 4, 5], 'equal', 5).length, 4);
  assert.deepEqual(classifyValues([1, 2, 3, 4, 5], 'manual', 5, '2, 4'), [2, 4]);

  // Single unique value -> one class with no breaks
  assert.deepEqual(classifyValues([5, 5, 5], 'equal', 5), []);
  assert.deepEqual(classifyValues([5, 5, 5], 'quantile', 5), []);
  // Quantile breaks are deduplicated on skewed data (many zero-count areas)
  assert.deepEqual(classifyValues([0, 0, 0, 0, 5], 'quantile', 5), [0]);

  // Duplicate denominators are detected via normalized keys (case variants merge)
  const duplicateDenominatorDataset = {
    ...denominatorDataset,
    records: [
      { id: 'd1', district: 'North', population: 1000 },
      { id: 'd2', district: 'north', population: 1000 },
      { id: 'd3', district: 'South', population: 500 },
    ],
  };
  const duplicateJoin = buildAreaJoin({
    records,
    areaField: 'district',
    boundaries,
    boundaryKey: 'district',
    metric: 'rate',
    denominatorDataset: duplicateDenominatorDataset,
    denominatorKey: 'district',
    denominatorValue: 'population',
    rateMultiplier: 100000,
  });
  assert.deepEqual(duplicateJoin.summary.duplicateDenominatorKeys, ['north']);

  // Small-count disclosure. The Help Center tells users not to publish areas
  // holding fewer than five cases; the map must at least tell them when it is
  // showing some. Reported rather than suppressed, so mid-investigation signal
  // is not hidden.
  {
    const boundaries = {
      type: 'FeatureCollection',
      features: ['North', 'South', 'East', 'West'].map(name => ({
        type: 'Feature',
        properties: { name },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      })),
    };
    // North 7 cases, South 3, East 1, West 0.
    const records = [
      ...Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, area: 'North' })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, area: 'South' })),
      { id: 'e0', area: 'East' },
    ];
    const result = buildAreaJoin({
      records, areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count',
    });

    assert.deepEqual(result.summary.smallCountKeys, ['East', 'South'],
      'areas with 1 and 3 cases should be flagged');
    assert.ok(!result.summary.smallCountKeys.includes('North'),
      'an area at or above the threshold must not be flagged');
    assert.ok(!result.summary.smallCountKeys.includes('West'),
      'an empty area has nobody to identify and must not be flagged');

    // The threshold is exclusive: exactly five cases is not flagged.
    const atThreshold = buildAreaJoin({
      records: Array.from({ length: SMALL_COUNT_THRESHOLD }, (_, i) => ({ id: `x${i}`, area: 'North' })),
      areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count',
    });
    assert.deepEqual(atThreshold.summary.smallCountKeys, [],
      `exactly ${SMALL_COUNT_THRESHOLD} cases should not be flagged`);
  }

  // A zero or missing denominator must give no rate, not Infinity or NaN.
  // count / 0 would otherwise be rendered as a real rate on the map.
  {
    const boundaries = {
      type: 'FeatureCollection',
      features: ['Alpha', 'Beta'].map(name => ({
        type: 'Feature',
        properties: { name },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      })),
    };
    const records = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, area: 'Alpha' })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, area: 'Beta' })),
    ];
    // Alpha has a real population, Beta's is zero.
    const denominatorDataset = {
      id: 'pop', name: 'pop', source: 'form',
      columns: [
        { key: 'area', label: 'Area', type: 'text' },
        { key: 'pop', label: 'Population', type: 'number' },
      ],
      records: [
        { id: '1', area: 'Alpha', pop: 1000 },
        { id: '2', area: 'Beta', pop: 0 },
      ],
      createdAt: '', updatedAt: '',
    };
    const joined = buildAreaJoin({
      records, areaField: 'area', boundaries, boundaryKey: 'name', metric: 'rate',
      denominatorDataset, denominatorKey: 'area', denominatorValue: 'pop',
      rateMultiplier: 100000,
    });
    const byLabel = Object.fromEntries(joined.areas.map(a => [a.label, a]));

    assert.equal(byLabel.Alpha.rate, (6 / 1000) * 100000, 'a valid denominator gives a real rate');
    assert.equal(byLabel.Beta.rate, null, 'a zero denominator must give no rate rather than Infinity');
    for (const a of joined.areas) {
      assert.ok(a.rate === null || Number.isFinite(a.rate),
        `rate for ${a.label} was ${a.rate}, which is not finite`);
    }
    assert.ok(joined.summary.missingDenominatorKeys.includes('Beta'),
      'an area with cases but no usable denominator should be reported');
  }

  // Optional suppression, for when a map is being prepared to share. Values are
  // withheld rather than zeroed: a zero reads as "no cases here" rather than
  // "not disclosed", which is a different and wrong claim.
  {
    const boundaries = {
      type: 'FeatureCollection',
      features: ['North', 'South', 'East', 'West'].map(name => ({
        type: 'Feature',
        properties: { name },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      })),
    };
    const records = [
      ...Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, area: 'North' })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, area: 'South' })),
      { id: 'e0', area: 'East' },
    ];
    const joined = buildAreaJoin({
      records, areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count',
    });
    const withheld = suppressSmallCounts(joined);
    const byLabel = Object.fromEntries(withheld.areas.map(a => [a.label, a]));

    assert.equal(byLabel.North.count, 7, 'an area at or above the threshold is untouched');
    assert.equal(byLabel.North.suppressed, false);

    for (const small of ['South', 'East']) {
      assert.equal(byLabel[small].value, null, `${small} must not carry a mappable value`);
      assert.notEqual(byLabel[small].value, 0, `${small} must not read as zero cases`);
      assert.equal(byLabel[small].suppressed, true, `${small} must be marked as withheld`);
    }

    // An area with no cases has nobody to identify, so it is left alone and can
    // still legitimately show zero.
    assert.equal(byLabel.West.suppressed, false, 'an empty area is not suppressed');

    // The summary still reports what was withheld, so the count is not lost.
    assert.deepEqual(withheld.summary.smallCountKeys, ['East', 'South']);
  }


  // ---------------------------------------------------------------------
  // Pre-launch review. Each block below is a result that was wrong on the
  // map or in the report while nothing on screen said so.
  // ---------------------------------------------------------------------

  const square = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
  const namedFeatures = (...names) => ({
    type: 'FeatureCollection',
    features: names.map(name => ({ type: 'Feature', properties: { name }, geometry: square })),
  });
  const people = (count, area, prefix = area) =>
    Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, area }));
  const census = rowsOfCensus => ({
    id: 'pop', name: 'pop', source: 'import', createdAt: '', updatedAt: '',
    columns: [
      { key: 'area', label: 'Area', type: 'text' },
      { key: 'year', label: 'Year', type: 'number' },
      { key: 'pop', label: 'Population', type: 'number' },
    ],
    records: rowsOfCensus.map(([area, year, pop], i) => ({ id: String(i), area, year, pop })),
  });

  // Duplicate denominator rows. A census table with one row per district-year
  // was summed without comment: three years tripled the population and the
  // rate came out a third of the truth.
  {
    const boundaries = namedFeatures('Alpha', 'Beta', 'Gamma');
    const records = [...people(50, 'Alpha'), ...people(10, 'Beta'), ...people(8, 'Gamma')];
    const denominatorDataset = census([
      ['Alpha', 2023, 100000], ['Alpha', 2024, 100000], ['Alpha', 2025, 100000],
      ['Beta', 2023, 50000], ['Beta', 2024, 50000], ['Beta', 2025, 50000],
      ['Gamma', 2025, 40000],
    ]);
    const options = {
      records, areaField: 'area', boundaries, boundaryKey: 'name', metric: 'rate',
      denominatorDataset, denominatorKey: 'area', denominatorValue: 'pop', rateMultiplier: 100000,
    };

    const blocked = buildAreaJoin(options);
    const byLabel = Object.fromEntries(blocked.areas.map(a => [a.label, a]));
    assert.equal(byLabel.Alpha.rate, null, 'an area with several denominator rows gets no rate by default');
    assert.equal(byLabel.Alpha.denominator, null);
    assert.equal(byLabel.Beta.rate, null);
    assert.equal(byLabel.Gamma.rate, (8 / 40000) * 100000, 'an area with one row is unaffected');
    assert.deepEqual(blocked.summary.duplicateDenominatorLabels,
      [{ label: 'Alpha', rows: 3 }, { label: 'Beta', rows: 3 }],
      'the duplicates must be reported with how many rows each has');
    assert.deepEqual(blocked.summary.missingDenominatorKeys, ['Alpha', 'Beta']);
    const blockedReport = buildJoinReport(blocked);
    assert.ok(blockedReport.find(row => row.area_label === 'Alpha').issue.includes('More than one denominator row'),
      'the report must say why there is no rate');
    assert.equal(blockedReport.find(row => row.area_label === 'Gamma').issue, '');

    // Adding them up is right when the rows are parts of one population, and
    // happens only when asked for.
    const summed = buildAreaJoin({ ...options, duplicateDenominators: 'sum' });
    assert.equal(summed.areas.find(a => a.label === 'Alpha').denominator, 300000);
    assert.equal(summed.areas.find(a => a.label === 'Alpha').rate, (50 / 300000) * 100000);
    assert.equal(summed.summary.duplicateDenominatorLabels.length, 2, 'and is still reported');
  }

  // Duplicate boundary names. Two districts called "Central" in different
  // provinces each showed the count for both, and nothing reported it.
  {
    const boundaries = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { NAME_1: 'Northern', NAME_2: 'Central' }, geometry: square },
        { type: 'Feature', properties: { NAME_1: 'Southern', NAME_2: 'Central' }, geometry: square },
        { type: 'Feature', properties: { NAME_1: 'Southern', NAME_2: 'Lakeside' }, geometry: square },
      ],
    };
    const joined = buildAreaJoin({
      records: people(15, 'Central'), areaField: 'area', boundaries, boundaryKey: 'NAME_2', metric: 'count',
    });
    assert.deepEqual(joined.summary.duplicateBoundaryLabels, [{ label: 'Central', features: 2 }]);
    assert.equal(joined.summary.matchedRecords, 15, 'records are counted once however many polygons share the name');
    const report = buildJoinReport(joined);
    assert.equal(report.filter(row => row.issue.includes('shared by 2 polygons')).length, 2,
      'both polygons must carry the warning in the report');
  }

  // Record accounting. Unmatched areas were written to the report with a
  // count of 0, and records with a blank area were counted nowhere.
  {
    const boundaries = namedFeatures('Kisumu', 'Siaya');
    const records = [...people(5, 'Kisumu'), ...people(40, 'Homa-Bay', 'h'), ...people(8, '', 'blank'), ...people(2, '   ', 'space')];
    const joined = buildAreaJoin({ records, areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count' });
    const { summary } = joined;
    assert.equal(summary.totalRecords, 55);
    assert.equal(summary.matchedRecords, 5);
    assert.equal(summary.unmatchedRecords, 40);
    assert.equal(summary.blankAreaRecords, 10);
    assert.equal(summary.matchedRecords + summary.unmatchedRecords + summary.blankAreaRecords, summary.totalRecords,
      'every record is on the map, unmatched or blank');
    assert.deepEqual(summary.unmatchedDataCounts, { 'Homa-Bay': 40 });

    const report = buildJoinReport(joined);
    assert.equal(report.find(row => row.area_label === 'Homa-Bay').data_count, 40,
      'an unmatched area must show how many records it holds');
    const blank = report.find(row => row.boundary_status === 'No area recorded');
    assert.ok(blank, 'records with no area must appear in the report');
    assert.equal(blank.data_count, 10);
    assert.equal(report.reduce((sum, row) => sum + (row.data_count ?? 0), 0), 55, 'the report accounts for every record');

    // A count map has no denominators, so none can be missing. Every area with
    // cases used to be marked "Missing or zero denominator".
    assert.ok(report.every(row => !row.issue.includes('denominator')),
      'a count map must not report missing denominators');
    assert.equal(report.find(row => row.area_label === 'Kisumu').issue, '');
  }

  // Suppression. One blank among published counts is the total less the rest.
  {
    const boundaries = namedFeatures('North', 'South', 'East', 'West');
    const joined = buildAreaJoin({
      records: [...people(9, 'North'), ...people(7, 'South'), ...people(3, 'East')],
      areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count',
    });
    const withheld = suppressSmallCounts(joined);
    const byLabel = Object.fromEntries(withheld.areas.map(a => [a.label, a]));
    assert.equal(byLabel.East.suppressed, true);
    assert.equal(byLabel.South.suppressed, true,
      'the smallest other area is withheld too, or East is simply 19 minus what is shown');
    assert.equal(byLabel.South.value, null);
    assert.equal(byLabel.North.suppressed, false);
    assert.equal(byLabel.North.count, 9);
    assert.equal(byLabel.West.suppressed, false, 'an area with no records is not used to hide another');
    assert.deepEqual(withheld.summary.withheldKeys, ['East', 'South']);
    assert.deepEqual(withheld.summary.complementaryKeys, ['South']);
    assert.equal(withheld.summary.withheldRecoverable, false);

    const report = buildJoinReport(withheld);
    for (const label of ['East', 'South']) {
      const row = report.find(r => r.area_label === label);
      assert.equal(row.data_count, null, `${label} must not carry a count in the report`);
      assert.ok(row.issue.startsWith('Withheld'), `${label} must be reported as withheld, not as having no value`);
    }
    assert.equal(report.find(r => r.area_label === 'West').issue, 'No observation records');
  }

  // Two or more small counts normally hide each other, but not when their
  // total is the least it could be: three areas summing to three are each 1.
  {
    const boundaries = namedFeatures('A', 'B', 'C', 'D');
    const allOnes = suppressSmallCounts(buildAreaJoin({
      records: [...people(1, 'A'), ...people(1, 'B'), ...people(1, 'C'), ...people(12, 'D')],
      areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count',
    }));
    assert.deepEqual(allOnes.summary.complementaryKeys, ['D'], 'all-ones must be covered by a further area');

    const mixed = suppressSmallCounts(buildAreaJoin({
      records: [...people(1, 'A'), ...people(3, 'B'), ...people(12, 'D')],
      areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count',
    }));
    assert.deepEqual(mixed.summary.complementaryKeys, [], 'two small counts that could split several ways need no cover');
    assert.equal(mixed.areas.find(a => a.label === 'D').suppressed, false);

    // 1 beside 5 totals 6, which can only be 1 and 5; a second area is added.
    const forced = suppressSmallCounts(buildAreaJoin({
      records: [...people(1, 'A'), ...people(5, 'B'), ...people(9, 'C')],
      areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count',
    }));
    assert.deepEqual(forced.summary.complementaryKeys, ['B', 'C']);

    // With no other area to withhold, the user has to be told it is recoverable.
    const alone = suppressSmallCounts(buildAreaJoin({
      records: people(2, 'A'), areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count',
    }));
    assert.equal(alone.summary.withheldRecoverable, true);
    assert.deepEqual(alone.summary.complementaryKeys, []);

    // An area drawn as two polygons is one count: both parts are withheld, and
    // it is not mistaken for two areas hiding each other.
    const twoParts = {
      type: 'FeatureCollection',
      features: ['Island', 'Island', 'Mainland'].map(name => ({ type: 'Feature', properties: { name }, geometry: square })),
    };
    const parts = suppressSmallCounts(buildAreaJoin({
      records: [...people(2, 'Island'), ...people(20, 'Mainland')],
      areaField: 'area', boundaries: twoParts, boundaryKey: 'name', metric: 'count',
    }));
    assert.ok(parts.areas.filter(a => a.label === 'Island').every(a => a.suppressed));
    assert.deepEqual(parts.summary.complementaryKeys, ['Mainland']);

    // Small counts off the map are withheld in the report as well.
    const offMap = suppressSmallCounts(buildAreaJoin({
      records: [...people(1, 'A'), ...people(3, 'B'), ...people(2, 'Nowhere'), ...people(30, 'Elsewhere')],
      areaField: 'area', boundaries, boundaryKey: 'name', metric: 'count',
    }));
    const offMapReport = buildJoinReport(offMap);
    assert.equal(offMapReport.find(r => r.area_label === 'Nowhere').data_count, null);
    assert.equal(offMapReport.find(r => r.area_label === 'Elsewhere').data_count, 30);
  }

  // Legend labels must say which values each class holds. A value equal to a
  // break is in the lower class, but the labels repeated the break on both
  // sides ("0 - 1", "1 - 2"), so an area of 1 was coloured as one row and
  // read as another.
  {
    const counts = [0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 5, 5, 8, 13, 40];
    for (const method of ['quantile', 'equal', 'natural']) {
      for (const classes of [3, 5, 7]) {
        const breaks = classifyValues(counts, method, classes);
        const legend = buildLegendClasses(counts, breaks);
        for (const value of counts) {
          const row = legend.find(item => item.classIndex === getClassIndex(value, breaks));
          assert.ok(row, `${method}/${classes}: no legend row for ${value}`);
          const [from, to] = row.label.includes('–')
            ? row.label.split('–').map(Number)
            : [Number(row.label), Number(row.label)];
          assert.ok(value >= from && value <= to,
            `${method}/${classes}: ${value} is drawn as "${row.label}"`);
        }
        // No two rows may claim the same value.
        const claimed = legend.flatMap(item => {
          const [from, to] = item.label.includes('–') ? item.label.split('–').map(Number) : [Number(item.label), Number(item.label)];
          return Array.from({ length: to - from + 1 }, (_, i) => from + i);
        });
        assert.equal(new Set(claimed).size, claimed.length, `${method}/${classes}: legend rows overlap`);
      }
    }
    assert.deepEqual(
      buildLegendClasses(counts, classifyValues(counts, 'quantile', 5)).map(item => item.label),
      ['0', '1', '2', '3–5', '6–40']
    );

    // No empty class above the maximum: two areas of 1 and 5 used to get a
    // third row, "> 5", with nothing in it.
    assert.deepEqual(classifyValues([1, 5], 'quantile', 5), [1]);
    assert.deepEqual(buildLegendClasses([1, 5], classifyValues([1, 5], 'quantile', 5)).map(item => item.label), ['1', '2–5']);

    // Rates are not whole numbers, so their rows say "more than".
    const rates = [2.5, 4.1, 7.9, 12.4, 30.2];
    const rateLegend = buildLegendClasses(rates, [5, 10]).map(item => item.label);
    assert.equal(rateLegend.length, 3);
    assert.ok(rateLegend[1].startsWith('> 5'), `middle class should read "> 5 – 10", got "${rateLegend[1]}"`);
    assert.ok(rateLegend[2].startsWith('> 10'));

    // One value, one row.
    assert.deepEqual(buildLegendClasses([4, 4], []).map(item => item.label), ['4']);

    // The lowest and highest classes take the ends of the colour ramp whatever
    // the number of classes, and every class has its own colour.
    for (const total of [2, 3, 5, 7]) {
      const colours = Array.from({ length: total }, (_, i) => classColor(i, total));
      assert.equal(new Set(colours).size, total, `${total} classes need ${total} colours`);
      assert.equal(colours[0], classColor(0, 7));
      assert.equal(colours[total - 1], classColor(6, 7));
    }

    // Manual breaks: a decimal comma is not a separator, and there are never
    // more classes than colours.
    assert.deepEqual(parseManualBreaks('10, 25, 50'), [10, 25, 50]);
    assert.deepEqual(parseManualBreaks('10,25,50'), [10, 25, 50]);
    assert.deepEqual(parseManualBreaks('2,5; 7,5'), [2.5, 7.5]);
    assert.deepEqual(parseManualBreaks('2,5, 7,5'), [2.5, 7.5]);
    assert.deepEqual(parseManualBreaks('abc, 4'), [4]);
    assert.equal(classifyValues([1, 99], 'manual', 5, '10,20,30,40,50,60,70,80,90').length, MAX_CLASSES - 1);
  }

  // The default join field for the boundary sources field teams use. The
  // first name-like property alphabetically was the province (GADM) or the
  // country (OCHA), which every polygon shares.
  {
    const collection = rows => ({
      type: 'FeatureCollection',
      features: rows.map(properties => ({ type: 'Feature', properties, geometry: square })),
    });
    const gadm = collection(['Baringo Central', 'Baringo North', 'Mogotio', 'Eldama Ravine'].map((name, i) => ({
      GID_0: 'KEN', COUNTRY: 'Kenya', GID_1: 'KEN.1_1', NAME_1: 'Baringo', NL_NAME_1: 'NA',
      GID_2: `KEN.1.${i + 1}_1`, NAME_2: name, VARNAME_2: 'NA', NL_NAME_2: 'NA',
      TYPE_2: 'Constituency', ENGTYPE_2: 'Constituency', CC_2: String(159 + i), HASC_2: 'NA',
    })));
    assert.equal(suggestBoundaryKey(getGeoJsonPropertyKeys(gadm), gadm), 'NAME_2');

    const ocha = collection(['Baringo Central', 'Baringo North', 'Mogotio', 'Eldama Ravine'].map((name, i) => ({
      Shape_Leng: 1.2 + i, Shape_Area: 0.3 + i, ADM2_EN: name, ADM2_PCODE: `KE0301${i}`, ADM2_REF: null,
      ADM1_EN: 'Baringo', ADM1_PCODE: 'KE030', ADM0_EN: 'Kenya', ADM0_PCODE: 'KE', date: '2017-11-03', validOn: '2019-10-31',
    })));
    assert.equal(suggestBoundaryKey(getGeoJsonPropertyKeys(ocha), ocha), 'ADM2_EN');

    // When the data is known, the property its values match wins outright,
    // even when the dataset holds codes rather than names.
    const dataKeys = new Set(['ke03010', 'ke03011']);
    assert.equal(suggestBoundaryKey(getGeoJsonPropertyKeys(ocha), ocha, dataKeys), 'ADM2_PCODE');

    const columns = [
      { key: 'case_id', label: 'Case ID', type: 'text' },
      { key: 'onset', label: 'Onset', type: 'date' },
      { key: 'subcounty', label: 'Sub-county', type: 'text' },
    ];
    const records = ['Mogotio', 'mogotio ', 'Baringo North', 'Unknown place'].map((subcounty, i) => ({
      id: String(i), case_id: `C${i}`, onset: '2026-01-01', subcounty,
    }));
    assert.deepEqual(suggestJoinFields(columns, records, gadm), { areaField: 'subcounty', boundaryKey: 'NAME_2' });
    assert.equal(suggestJoinFields(columns, records, namedFeatures('X', 'Y')), null,
      'no shared value means no suggested pair');

    // A column of small numbers shares values with any file that numbers its
    // polygons. That is not a match: the surveillance sample's Deaths column
    // was joined to the sample boundary file's object ids this way.
    {
      const numbered = {
        type: 'FeatureCollection',
        features: ['Alpha', 'Beta', 'Gamma', 'Delta'].map((name, i) => ({
          type: 'Feature', geometry: null, properties: { source_objectid: i + 1, name },
        })),
      };
      const surveillanceColumns = [
        { key: 'district', label: 'District', type: 'categorical' },
        { key: 'deaths', label: 'Deaths', type: 'number' },
        { key: 'cases', label: 'Cases Reported', type: 'number' },
      ];
      const surveillance = [0, 1, 2, 3, 4, 1, 2].map((deaths, i) => ({
        id: String(i), district: ['Lakeside', 'Hillcrest'][i % 2], deaths, cases: deaths * 10,
      }));
      assert.equal(suggestJoinFields(surveillanceColumns, surveillance, numbered), null,
        'a count column is not joined to polygon numbers');
      // The same numbers in a column named for a code are a legitimate key.
      const coded = surveillance.map((r, i) => ({ ...r, district_code: (i % 4) + 1 }));
      assert.deepEqual(
        suggestJoinFields([...surveillanceColumns, { key: 'district_code', label: 'District code', type: 'number' }], coded, numbered),
        { areaField: 'district_code', boundaryKey: 'source_objectid' });
      // One name in ten matching is a coincidence, not a join.
      const mostlyElsewhere = ['Alpha', 'North', 'South', 'East', 'West', 'Centre', 'Upper', 'Lower', 'Old', 'New']
        .map((district, i) => ({ id: String(i), district, deaths: 0, cases: 1 }));
      assert.equal(suggestJoinFields(surveillanceColumns, mostlyElsewhere, numbered), null,
        'a pair has to agree on at least half the names');
    }

    // Without the file the old behaviour stands.
    assert.equal(suggestBoundaryKey(['zzz', 'name']), 'name');
  }

  // Boundary files are checked before anything draws them.
  {
    const ok = validateBoundaryGeoJson(namedFeatures('A', 'B'));
    assert.equal(ok.error, '');
    assert.equal(ok.boundaries.features.length, 2);
    assert.deepEqual(ok.warnings, []);

    // A null in the features array took the Maps module down to its error screen.
    const holed = validateBoundaryGeoJson({
      type: 'FeatureCollection',
      features: [null, 'text', { type: 'Feature', properties: null, geometry: square }, { type: 'Feature', properties: {}, geometry: null }],
    });
    assert.equal(holed.error, '');
    assert.equal(holed.boundaries.features.length, 1);
    assert.deepEqual(holed.boundaries.features[0].properties, {}, 'null properties become an empty object');
    assert.equal(holed.warnings.length, 1);
    assert.deepEqual(getGeoJsonPropertyKeys(holed.boundaries), []);
    assert.deepEqual(getGeoJsonPropertyKeys({ type: 'FeatureCollection', features: [null] }), [],
      'reading property names must not throw on a malformed feature');

    // Projected coordinates (UTM metres) were read as degrees and drew a grey strip.
    const utm = validateBoundaryGeoJson({
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32737' } },
      features: [{ type: 'Feature', properties: { name: 'Westlands' },
        geometry: { type: 'Polygon', coordinates: [[[250000, 9855000], [255000, 9855000], [255000, 9860000], [250000, 9855000]]] } }],
    });
    assert.equal(utm.boundaries, null);
    assert.ok(/latitude\/longitude/.test(utm.error) && /WGS84/.test(utm.error), `message was: ${utm.error}`);

    assert.ok(validateBoundaryGeoJson({ type: 'Topology', objects: {} }).error.includes('TopoJSON'));
    assert.ok(validateBoundaryGeoJson([1, 2, 3]).error.length > 0);
    assert.ok(validateBoundaryGeoJson(null).error.length > 0);
    assert.ok(validateBoundaryGeoJson({ type: 'FeatureCollection', features: [] }).error.length > 0);
    const pointsOnly = validateBoundaryGeoJson({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [36.8, -1.3] } }],
    });
    assert.ok(pointsOnly.error.includes('points or lines'));
    // A single Feature is accepted as a collection of one.
    assert.equal(validateBoundaryGeoJson({ type: 'Feature', properties: { name: 'A' }, geometry: square }).boundaries.features.length, 1);
    // Coordinates that are not numbers are a malformed feature, not a crash.
    assert.ok(validateBoundaryGeoJson({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[['a', 'b']]] } }],
    }).error.length > 0);

    // Boundaries are kept for the session, per dataset.
    rememberBoundaries('dataset-1', { boundaries: ok.boundaries, fileName: 'a.geojson' });
    assert.equal(recallBoundaries('dataset-1').fileName, 'a.geojson');
    assert.equal(recallBoundaries('dataset-2'), null);
    rememberBoundaries('dataset-1', null);
    assert.equal(recallBoundaries('dataset-1'), null);
  }

  console.log('Area map regression checks passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
