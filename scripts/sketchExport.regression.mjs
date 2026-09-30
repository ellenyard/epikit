/**
 * Sketch map SVG export.
 *
 * The exported file cloned only the drawing, so the legend, which is HTML on
 * screen, was dropped. The download succeeded, was named the same, and said
 * nothing, leaving a map of unexplained symbols in whatever report it reached.
 *
 * The geometry is the part worth testing: the wrong offset lays the legend over
 * the drawing, and the wrong canvas size crops it out of the file. Both produce
 * a file that opens perfectly well and is simply wrong.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-sketch-export-'));
const bundled = path.join(tempDir, 'sketchExport.mjs');

const SKETCH = '<rect width="1200" height="800" fill="#FFFFFF"/><circle cx="100" cy="100" r="20"/>';
const LEGEND = '<text>Legend</text><text>Case</text>';

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/sketchExport.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
  });

  const {
    composeSketchExport, legendExportHeight,
    SKETCH_CANVAS_WIDTH, SKETCH_CANVAS_HEIGHT,
    LEGEND_EXPORT_WIDTH, SKETCH_EXPORT_GAP,
  } = await import(pathToFileURL(bundled).href);

  // 1. The drawing always reaches the file.
  {
    const { svg } = composeSketchExport({
      sketchInner: SKETCH, legendInner: null, legendPosition: 'side', legendItemCount: 0,
    });
    assert.ok(svg.includes('<circle cx="100" cy="100" r="20"/>'), 'the drawing must be in the export');
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'),
      'a standalone file needs the SVG namespace or it will not open');
    assert.ok(svg.trimEnd().endsWith('</svg>'));
  }

  // 2. With no legend the file is exactly the canvas.
  {
    const r = composeSketchExport({
      sketchInner: SKETCH, legendInner: null, legendPosition: 'side', legendItemCount: 0,
    });
    assert.equal(r.width, SKETCH_CANVAS_WIDTH);
    assert.equal(r.height, SKETCH_CANVAS_HEIGHT);
    assert.equal(r.includesLegend, false);
    assert.ok(!r.svg.includes('translate('), 'nothing is offset when there is no legend');
  }

  // 3. A side legend widens the file and sits clear of the drawing. Placing it
  //    at or before the canvas edge would cover the map.
  {
    const r = composeSketchExport({
      sketchInner: SKETCH, legendInner: LEGEND, legendPosition: 'side', legendItemCount: 3,
    });
    assert.equal(r.includesLegend, true);
    assert.equal(r.width, SKETCH_CANVAS_WIDTH + SKETCH_EXPORT_GAP + LEGEND_EXPORT_WIDTH,
      'the file must be wide enough to hold the legend, or it is cropped out');
    assert.equal(r.height, SKETCH_CANVAS_HEIGHT, 'a side legend does not change the height');
    assert.ok(r.svg.includes('>Case<'), 'legend labels must reach the file');

    const offset = Number(r.svg.match(/translate\((\d+), 0\)/)[1]);
    assert.ok(offset >= SKETCH_CANVAS_WIDTH,
      `a side legend must start at or beyond the canvas edge, got ${offset}`);
    assert.ok(offset + LEGEND_EXPORT_WIDTH <= r.width,
      'and must fit inside the declared width');
  }

  // 4. A legend below does the same vertically.
  {
    const items = 4;
    const r = composeSketchExport({
      sketchInner: SKETCH, legendInner: LEGEND, legendPosition: 'below', legendItemCount: items,
    });
    assert.equal(r.width, SKETCH_CANVAS_WIDTH, 'a legend below does not change the width');
    assert.equal(r.height, SKETCH_CANVAS_HEIGHT + SKETCH_EXPORT_GAP + legendExportHeight(items));

    const offset = Number(r.svg.match(/translate\(0, (\d+)\)/)[1]);
    assert.ok(offset >= SKETCH_CANVAS_HEIGHT,
      `a legend below must start at or beyond the canvas bottom, got ${offset}`);
    assert.ok(offset + legendExportHeight(items) <= r.height, 'and must fit inside the declared height');
  }

  // 5. The legend grows with its rows, so a long legend is not clipped.
  {
    const small = composeSketchExport({
      sketchInner: SKETCH, legendInner: LEGEND, legendPosition: 'below', legendItemCount: 2,
    });
    const large = composeSketchExport({
      sketchInner: SKETCH, legendInner: LEGEND, legendPosition: 'below', legendItemCount: 10,
    });
    assert.ok(large.height > small.height, 'more legend rows need more room');
    assert.equal(large.height - small.height, legendExportHeight(10) - legendExportHeight(2));
  }

  // 6. An empty legend is not attached: it would be a heading over blank space.
  {
    const r = composeSketchExport({
      sketchInner: SKETCH, legendInner: LEGEND, legendPosition: 'side', legendItemCount: 0,
    });
    assert.equal(r.includesLegend, false, 'a legend with no rows is omitted');
    assert.equal(r.width, SKETCH_CANVAS_WIDTH, 'and does not widen the file');
  }

  // 7. The background is opaque and covers the whole file, legend included.
  //    A transparent SVG prints black in some viewers.
  {
    const r = composeSketchExport({
      sketchInner: SKETCH, legendInner: LEGEND, legendPosition: 'side', legendItemCount: 3,
    });
    const bg = r.svg.match(/<rect width="(\d+)" height="(\d+)" fill="#FFFFFF"\/>/);
    assert.ok(bg, 'the export needs an opaque background');
    assert.equal(Number(bg[1]), r.width, 'the background must span the full width');
    assert.equal(Number(bg[2]), r.height, 'and the full height');
  }

  // 8. viewBox matches the declared size, so editors that scale by viewBox and
  //    editors that use width and height agree.
  {
    const r = composeSketchExport({
      sketchInner: SKETCH, legendInner: LEGEND, legendPosition: 'below', legendItemCount: 5,
    });
    assert.ok(r.svg.includes(`viewBox="0 0 ${r.width} ${r.height}"`),
      'viewBox must match the declared width and height');
    assert.ok(r.svg.includes(`width="${r.width}"`) && r.svg.includes(`height="${r.height}"`),
      'explicit width and height let editors that ignore viewBox open it at the right size');
  }

  console.log('sketch export regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
