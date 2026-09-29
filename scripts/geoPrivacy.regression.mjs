/**
 * Location obfuscation guarantees.
 *
 * These assert the properties the spot map's privacy promise depends on. The
 * exports previously shipped exact coordinates in files labelled as jittered,
 * and nothing would have caught that recurring, so the invariants are pinned
 * here rather than left to manual checking.
 */
import assert from 'node:assert/strict';
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

  const { jitterCoordinates, metresBetween } = await import(pathToFileURL(bundled).href);

  const LAT = 41.6723, LNG = -83.6145, R = 500;
  const points = Array.from({ length: 2000 }, (_, i) =>
    jitterCoordinates(LAT, LNG, R, `record-${i}`));
  const dists = points.map(p => metresBetween(LAT, LNG, p.lat, p.lng)).sort((a, b) => a - b);

  // 1. The stated distance is a hard bound. A point displaced further than
  //    claimed is not a privacy failure, but it undermines the label.
  assert.ok(dists[dists.length - 1] <= R + 0.5,
    `max displacement ${dists[dists.length - 1].toFixed(1)}m exceeds the stated ${R}m`);

  // 2. Points must actually move. A displacement of zero would publish the
  //    true location while claiming otherwise.
  assert.ok(dists[0] > 0, 'every point must be displaced');

  // 3. Uniform over the disc, not uniform in radius. A uniform radius packs
  //    points toward the centre, so the true location sits closer to the
  //    published one than the stated distance implies: median R/2 rather than
  //    R/sqrt(2). This is the property that silently weakens the jitter.
  const mean = dists.reduce((s, v) => s + v, 0) / dists.length;
  const median = dists[Math.floor(dists.length / 2)];
  assert.ok(Math.abs(mean - (2 * R) / 3) < R * 0.05,
    `mean displacement ${mean.toFixed(0)}m should be near ${((2 * R) / 3).toFixed(0)}m for a uniform disc`);
  assert.ok(Math.abs(median - R / Math.SQRT2) < R * 0.06,
    `median displacement ${median.toFixed(0)}m should be near ${(R / Math.SQRT2).toFixed(0)}m for a uniform disc`);

  // 4. Deterministic. Re-randomising would let repeated exports be averaged to
  //    recover the true position, defeating the whole mechanism.
  const a = jitterCoordinates(LAT, LNG, R, 'stable-seed');
  const b = jitterCoordinates(LAT, LNG, R, 'stable-seed');
  assert.deepEqual(a, b, 'the same seed must always give the same offset');

  // 5. Different records land in different places, in both axes. If offsets
  //    collapsed onto one direction the displacement would be predictable.
  const distinctLat = new Set(points.map(p => p.lat.toFixed(6))).size;
  const distinctLng = new Set(points.map(p => p.lng.toFixed(6))).size;
  assert.ok(distinctLat > points.length * 0.8, `only ${distinctLat} distinct latitudes from ${points.length} seeds`);
  assert.ok(distinctLng > points.length * 0.8, `only ${distinctLng} distinct longitudes from ${points.length} seeds`);

  // 6. Direction and distance must vary independently. If they were tied, the
  //    offset would be predictable from either one alone. Checked as joint
  //    coverage: bucket each offset by compass octant and distance quartile,
  //    and require nearly all 32 cells to be reached. Counting quadrants alone
  //    is too weak, since a correlated generator still reaches all four.
  const cells = new Set();
  for (const p of points) {
    const dLat = (p.lat - LAT) * 111320;
    const dLng = (p.lng - LNG) * 111320 * Math.cos((LAT * Math.PI) / 180);
    const octant = Math.floor(((Math.atan2(dLat, dLng) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4));
    const quartile = Math.min(3, Math.floor((Math.hypot(dLat, dLng) / R) * 4));
    cells.add(`${octant}-${quartile}`);
  }
  assert.ok(cells.size >= 30,
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
    assert.ok(Math.max(...d) <= R + 1,
      `at latitude ${lat} the max displacement was ${Math.max(...d).toFixed(0)}m`);
    const m = d.reduce((s, v) => s + v, 0) / d.length;
    assert.ok(Math.abs(m - (2 * R) / 3) < R * 0.08,
      `at latitude ${lat} the mean displacement was ${m.toFixed(0)}m`);
  }

  // 9. The bound scales with the setting.
  for (const r of [100, 250, 1000]) {
    const d = Array.from({ length: 500 }, (_, i) => {
      const p = jitterCoordinates(LAT, LNG, r, `s${i}`);
      return metresBetween(LAT, LNG, p.lat, p.lng);
    });
    assert.ok(Math.max(...d) <= r + 0.5,
      `at a ${r}m setting the max displacement was ${Math.max(...d).toFixed(0)}m`);
    assert.ok(Math.min(...d) > 0, `at a ${r}m setting some point was not displaced at all`);
  }

  console.log('geoPrivacy regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
