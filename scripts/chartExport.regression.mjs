/**
 * Chart export: valid XML, usable filenames, a file that stands on its own,
 * and the layout helpers that keep text off other text.
 *
 * A control character in one category label used to make the whole SVG
 * unparseable, and the PNG export then failed without a word. Ten of the twelve
 * charts saved every figure under the same fixed filename. Stratified panels
 * could not be exported at all.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-chartexport-test-'));
const bundled = path.join(tempDir, 'chartExport.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/chartExport.ts')],
    bundle: true, format: 'esm', platform: 'node',
    outfile: bundled, logLevel: 'silent',
    external: ['xlsx'],
  });

  const {
    sanitizeXmlText, escapeXml, chartFilename, svgWrapper, svgText, svgHeader, svgFooter,
    toStandaloneSvg, fitText, estimateTextWidth, wrapText, spreadPositions, composeFacetSvg,
    CHART_FONT_FAMILY, EXPORT_FONT_FAMILY,
  } = await import(pathToFileURL(bundled).href);

  // Every character the XML 1.0 specification allows in a document.
  const isValidXmlText = (text) =>
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(text)
    && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text)
    && !/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);

  // 1. Characters XML forbids are removed; everything else survives.
  {
    assert.equal(sanitizeXmlText('Ward\u000BB'), 'WardB', 'a vertical tab broke the whole export');
    assert.equal(sanitizeXmlText('a\u0000b\u0001c\u001Fd'), 'abcd');
    assert.equal(sanitizeXmlText('line one\nline two\ttabbed'), 'line one line two tabbed');
    assert.equal(sanitizeXmlText('Côte d\'Ivoire القاهرة 北京'), 'Côte d\'Ivoire القاهرة 北京');
    assert.equal(sanitizeXmlText('ok \u{1F600} ok'), 'ok \u{1F600} ok', 'a complete surrogate pair is a character');
    assert.equal(sanitizeXmlText('bad \uD83D end'), 'bad  end', 'half of one is not');
    assert.equal(sanitizeXmlText('bad \uDE00 end'), 'bad  end');

    for (const nasty of ['Ward\u000BB', '\u0001\u0002', 'x\uD800', '\uDC00y', 'a & b < c > d "e"']) {
      const escaped = escapeXml(nasty);
      assert.ok(isValidXmlText(escaped), `still invalid: ${JSON.stringify(escaped)}`);
      assert.ok(!/[<>"]/.test(escaped) && !/&(?!amp;|lt;|gt;|quot;)/.test(escaped), `unescaped markup in ${escaped}`);
    }
    assert.equal(escapeXml('Under 5 & "infants" <1y'), 'Under 5 &amp; &quot;infants&quot; &lt;1y');
  }

  // 2. Text drawn into a chart is sanitised on the way in.
  {
    const svg = svgWrapper(100, 50, svgText(10, 10, 'Ward\u000BB & <C>'));
    assert.ok(isValidXmlText(svg));
    assert.ok(svg.includes('WardB &amp; &lt;C&gt;'));
  }

  // 3. A filename from a title.
  {
    assert.equal(chartFilename('Cases by status: 01/09/2026', 'bar_chart'), 'Cases_by_status_01_09_2026');
    assert.equal(chartFilename('  Records by Sex  ', 'x'), 'Records_by_Sex');
    assert.equal(chartFilename('', 'bar_chart'), 'bar_chart');
    assert.equal(chartFilename(undefined, 'bar_chart'), 'bar_chart');
    assert.equal(chartFilename('???', 'bar_chart'), 'bar_chart', 'nothing usable falls back');
    assert.equal(chartFilename('Cas par âge (Côte d\'Ivoire)', 'x'), 'Cas_par_âge_(Côte_d\'Ivoire)');
    assert.ok(chartFilename('x'.repeat(300), 'y').length <= 80);
    assert.ok(!/[\\/:*?"<>|\s]/.test(chartFilename('a/b\\c:d*e?f"g<h>i|j k', 'x')));
  }

  // 4. The wrapper carries a viewBox, so the drawing scales instead of being
  //    cropped, and a real background rectangle.
  {
    const svg = svgWrapper(800, 310, '<g/>');
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="310" viewBox="0 0 800 310"'));
    assert.ok(svg.includes('<rect x="0" y="0" width="800" height="310" fill="#ffffff"/>'));
  }

  // 5. A standalone file names a font that exists outside a browser. The
  //    on-screen stack starts with a name only browsers understand, and Word
  //    or Illustrator fell back to their default serif.
  {
    const svg = svgWrapper(100, 50, svgText(10, 10, 'Title'));
    assert.ok(svg.includes(CHART_FONT_FAMILY));
    const file = toStandaloneSvg(svg);
    assert.ok(file.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(!file.includes('-apple-system'), 'no browser-only font name left in the file');
    assert.ok(file.includes(`font-family="${EXPORT_FONT_FAMILY}"`));
    assert.ok(EXPORT_FONT_FAMILY.startsWith('Arial'));
    assert.equal((file.match(/<svg/g) || []).length, 1);
  }

  // 6. Labels are cut to the room they have.
  {
    assert.equal(fitText('Jinja', 200, 11), 'Jinja');
    const cut = fitText('Kampala Central Division', 60, 11);
    assert.ok(cut.endsWith('…') && cut.length < 'Kampala Central Division'.length);
    assert.ok(estimateTextWidth(cut, 11) <= 60 + 11, 'the cut label fits its width');
    assert.ok(estimateTextWidth('bold', 12, true) > estimateTextWidth('bold', 12));

    const lines = wrapText('Values show the percent of the 54 records with Sex recorded and more words besides', 200, 10);
    assert.ok(lines.length > 1);
    assert.ok(lines.every(line => estimateTextWidth(line, 10) <= 200));
    assert.equal(lines.join(' '), 'Values show the percent of the 54 records with Sex recorded and more words besides');
    assert.deepEqual(wrapText('', 200, 10), []);
  }

  // 7. The title block reports its height, so a legend starts below a subtitle
  //    instead of being printed through it.
  {
    const titleOnly = svgHeader(800, 'Title');
    const withSubtitle = svgHeader(800, 'Title', 'Subtitle');
    assert.ok(withSubtitle.bottom > titleOnly.bottom);
    assert.ok(svgHeader(800, '').bottom < titleOnly.bottom);
    assert.equal(svgHeader(800, '').svg, '');
  }

  // 8. Notes and the source are stacked in order, never on one line, and the
  //    height returned holds all of them.
  {
    const footer = svgFooter(800, 300, ['First note.', 'Second note.'], 'Ministry of Health');
    const ys = [...footer.svg.matchAll(/<text x="10" y="([\d.]+)"/g)].map(m => Number(m[1]));
    assert.equal(ys.length, 3);
    assert.ok(ys[0] > 300 && ys[1] - ys[0] >= 12 && ys[2] - ys[1] >= 12, `lines too close: ${ys}`);
    assert.ok(footer.height > ys[2]);
    assert.ok(footer.svg.includes('Source: Ministry of Health'));
    assert.equal(svgFooter(800, 300, []).svg, '');
  }

  // 9. Labels that would overlap are moved apart, in order, and kept on the
  //    canvas where there is room.
  {
    const spread = spreadPositions([100, 101, 102, 300], 13, 50, 400);
    assert.deepEqual(spread, [100, 113, 126, 300]);
    const order = spreadPositions([200, 100, 201], 13, 50, 400);
    assert.ok(order[1] < order[0] && order[0] < order[2], 'input order is preserved in the result');
    assert.ok(order[2] - order[0] >= 13);
    const bottom = spreadPositions([395, 396, 397], 13, 50, 400);
    assert.ok(Math.max(...bottom) <= 400, 'pulled back up from the bottom edge');
    assert.ok(bottom[1] - bottom[0] >= 13 && bottom[2] - bottom[1] >= 13);
    assert.deepEqual(spreadPositions([], 13, 0, 100), []);
  }

  // 10. Stratified panels compose into one drawing that exports like any other.
  {
    const panel = (label) => svgWrapper(540, 200, svgText(20, 20, label));
    const svg = composeFacetSvg(
      [
        { label: 'Female', records: 153, svg: panel('f') },
        { label: 'Male', records: 147, svg: panel('m') },
        { label: 'Other & <unknown>', records: 2, svg: panel('o') },
      ],
      { title: 'Records by Age Group', subtitle: 'By Sex', notes: ['All panels share the same value axis.'], source: 'Survey' }
    );
    assert.ok(svg.startsWith('<svg xmlns='));
    const width = Number(/width="([\d.]+)"/.exec(svg)[1]);
    assert.ok(width >= 540 * 2, 'two panels side by side');
    assert.equal((svg.match(/<svg x=/g) || []).length, 3, 'one nested drawing per panel');
    for (const text of ['Female', 'n = 153', 'Male', 'n = 147', 'Other &amp; &lt;unknown&gt;', 'Records by Age Group', 'By Sex', 'All panels share the same value axis.', 'Source: Survey']) {
      assert.ok(svg.includes(text), `missing from the composed figure: ${text}`);
    }
    // Opening and closing tags balance, so the result is one well-formed tree.
    assert.equal((svg.match(/<svg[\s>]/g) || []).length, (svg.match(/<\/svg>/g) || []).length);
    assert.equal(composeFacetSvg([], { title: 't', notes: [] }), '');
  }

  console.log('chartExport regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
