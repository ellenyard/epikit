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

  console.log('Area map regression checks passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
