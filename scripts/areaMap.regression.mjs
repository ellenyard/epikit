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
    buildJoinReport,
    classifyValues,
    normalizeAreaKey,
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

  console.log('Area map regression checks passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
