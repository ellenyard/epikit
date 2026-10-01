/**
 * The epidemic curve's exported drawing.
 *
 * "Export PNG" was a screenshot of the page taken with html2canvas, which
 * cannot parse the oklch() colours Tailwind 4 emits. It threw, the error was
 * logged, and the button under the flagship chart did nothing. Both exports are
 * now made from one SVG drawn from the data, which is what this checks.
 *
 * That SVG had faults of its own, each checked below: no font-family, so every
 * label but the annotations rendered in Times; a fixed 120px per legend entry,
 * so long names overlapped and many ran off both sides; a width that grew with
 * the bar count without limit (4,980px for four months of days); a fixed right
 * margin that clipped the last date label; 4px gaps between the bars of what is
 * a histogram; and markers for events off the axis drawn on its edge.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-episvg-test-'));
const zone = process.env.TZ || 'system timezone';

const attr = (tag, name) => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};
const num = (tag, name) => Number(attr(tag, name));
const texts = (svg) => [...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map(m => ({ tag: m[1], text: m[2] }));
const rects = (svg) => [...svg.matchAll(/<rect ([^>]*)\/>/g)].map(m => m[1]);
const lines = (svg) => [...svg.matchAll(/<line ([^>]*)\/>/g)].map(m => m[1]);
const size = (svg) => {
  const open = /^<svg ([^>]*)>/.exec(svg)[1];
  return { open, width: num(open, 'width'), height: num(open, 'height') };
};

/** Every tag closes, in order, and nothing unescaped is left in the text. */
function assertWellFormed(svg, what) {
  assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'), `${what}: is one svg element`);
  assert.ok(!/NaN|undefined|Infinity/.test(svg), `${what}: no NaN, undefined or Infinity in the output`);
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)([^<>]*?)(\/?)>/g)) {
    if (m[4] === '/') continue;
    if (m[1] === '/') assert.equal(stack.pop(), m[2], `${what}: </${m[2]}> closes the tag that is open`);
    else stack.push(m[2]);
  }
  assert.deepEqual(stack, [], `${what}: every tag is closed`);
  const stray = svg.replace(/<[^<>]*>/g, '').replace(/&(amp|lt|gt|quot);/g, '');
  assert.ok(!/[<>&]/.test(stray), `${what}: text is escaped`);
}

try {
  const outfile = path.join(tempDir, 'epiCurveSvg.mjs');
  await build({
    stdin: {
      contents: `export * from './src/utils/epiCurveSvg.ts'; export * from './src/utils/epiCurve.ts';`,
      resolveDir: root,
    },
    bundle: true, format: 'esm', platform: 'node', external: ['xlsx'],
    outfile, logLevel: 'silent',
  });
  const { generateEpiCurveSVG, processEpiCurveData } = await import(pathToFileURL(outfile).href);

  const defaults = {
    title: 'Epidemic Curve', xLabel: 'Onset Date', yLabel: 'Number of Cases',
    showGrid: true, showCounts: true, stratifyBy: '', colorScheme: 'default',
    annotations: [], exposureWindow: null,
  };
  const yMaxFor = (data) => Math.max(data.maxCount + 1, Math.ceil((data.maxCount + 1) / 5) * 5);
  const draw = (data, extra = {}) => generateEpiCurveSVG({ ...defaults, data, yMax: yMaxFor(data), ...extra });
  const base = { type: 'exposure', category: 'exposure', color: '#9CA3AF', source: 'manual' };

  // The sample outbreak as the app opens it: 12-hour bars stratified by case
  // status, with the picnic marked from noon to 2 PM on 10 January.
  const status = ['Confirmed', 'Probable', 'Suspected'];
  const sampleRecords = [
    { id: 's0', onset: '2026-01-10', time: '22:00', status: 'Confirmed' },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, onset: '2026-01-11', time: `${String(i).padStart(2, '0')}:00`, status: status[i % 2] })),
    ...Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, onset: '2026-01-11', time: `${12 + (i % 12)}:30`, status: status[i % 3] })),
    ...Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, onset: '2026-01-12', time: `${String(i).padStart(2, '0')}:15`, status: status[i % 3] })),
  ];
  const picnic = { ...base, id: 'picnic', label: 'Exposure: 12–2 PM',
    date: new Date(2026, 0, 10, 12, 0), hasTime: true, endDate: new Date(2026, 0, 10, 14, 0), endHasTime: true };
  const sample = processEpiCurveData(sampleRecords, 'onset', '12hour', 'status', [picnic], 'time');

  // 1. The drawing is complete and holds every case.
  {
    const svg = draw(sample, { stratifyBy: 'status', annotations: [picnic] });
    assertWellFormed(svg, 'sample');
    const { open, width, height } = size(svg);

    // A font is named, so the figure is not set in the viewer's default serif.
    const family = attr(open, 'font-family');
    assert.ok(family && /sans-serif/.test(family), `the drawing names a sans-serif font, got ${family}`);
    assert.equal(attr(open, 'viewBox'), `0 0 ${width} ${height}`, 'and scales when placed in a document');

    const all = texts(svg);
    const has = (t) => all.some(x => x.text === t);
    assert.ok(has('Epidemic Curve') && has('Onset Date') && has('Number of Cases'), 'title and both axis labels');
    assert.deepEqual(all.filter(x => status.includes(x.text)).map(x => x.text), status, 'legend, in stack order');
    assert.ok(has('Exposure: 12–2 PM'), 'the annotation label');

    // Bars: heights add up to the 44 cases, 12 + 20 + 11 + 1.
    const plotBottom = Math.max(...lines(svg).map(l => num(l, 'y2')));
    // Bars are the solid rects on the plot: not the 12px legend swatches, not the shaded band.
    const bars = rects(svg).filter(r => attr(r, 'opacity') === null && attr(r, 'fill').startsWith('#')
      && num(r, 'width') !== 12 && num(r, 'y') + num(r, 'height') <= plotBottom + 0.01);
    const perCase = 330 / yMaxFor(sample);
    const drawn = bars.reduce((s, r) => s + num(r, 'height'), 0) / perCase;
    assert.ok(Math.abs(drawn - 44) < 0.001, `bar heights must add up to 44 cases, got ${drawn}`);
    assert.deepEqual(all.filter(x => /^\d+$/.test(x.text) && attr(x.tag, 'font-size') === '10').map(x => x.text),
      ['1', '12', '20', '11'], 'the count over each bar');

    // An epidemic curve is a histogram: neighbouring bars touch. They were 4px apart.
    const columns = [...new Set(bars.map(r => num(r, 'x')))].sort((a, b) => a - b);
    const barWidth = num(bars[0], 'width');
    for (let i = 1; i < columns.length; i++) {
      const gap = columns[i] - (columns[i - 1] + barWidth);
      assert.ok(gap <= 1.001, `bars ${i - 1} and ${i} are ${gap}px apart`);
    }

    // The picnic is drawn from noon: the left edge of the bar that starts at
    // noon on the 10th, which holds the first case. It was drawn at 6 AM.
    const firstCaseBarX = columns[0];
    const band = rects(svg).find(r => attr(r, 'opacity') === '0.1');
    assert.ok(band, 'the exposure period is shaded');
    assert.ok(Math.abs(num(band, 'x') - (firstCaseBarX - 1)) < 0.01,
      `${zone}: the 12-2 PM band starts at noon (x=${firstCaseBarX - 1}), not at x=${num(band, 'x')}`);
    assert.ok(Math.abs(num(band, 'width') - (barWidth + 1) / 6) < 0.01, 'and is two of the bar\'s twelve hours wide');

    // Nothing is drawn outside the canvas.
    for (const t of all) {
      assert.ok(num(t.tag, 'x') >= 0 && num(t.tag, 'x') <= width && num(t.tag, 'y') >= 0 && num(t.tag, 'y') <= height,
        `"${t.text}" is on the canvas`);
    }
  }

  // 2. A long, heavily stratified curve still fits a page.
  {
    const districts = Array.from({ length: 12 }, (_, i) => `Health District ${i + 1} (North-Eastern Zone)`);
    const records = [];
    for (let day = 0; day < 120; day++) {
      const d = new Date(2026, 0, 5 + day);
      const onset = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      for (let j = 0; j < 1 + (day * 7) % 5; j++) records.push({ id: `${day}-${j}`, onset, district: districts[(day + j) % 12] });
    }
    const data = processEpiCurveData(records, 'onset', 'daily', 'district');
    assert.equal(data.bins.length, 122);
    const svg = draw(data, { stratifyBy: 'district' });
    assertWellFormed(svg, 'long');
    const { width, height } = size(svg);
    assert.ok(width <= 1600, `122 daily bars exported ${width}px wide; this was 4,980px`);

    // Legend: every entry on the canvas, none overlapping its neighbour.
    const legend = texts(svg).filter(t => districts.includes(t.text));
    assert.equal(legend.length, 12);
    const rows = new Map();
    for (const item of legend) {
      const y = num(item.tag, 'y');
      rows.set(y, [...(rows.get(y) ?? []), item]);
    }
    assert.ok(rows.size > 1, 'twelve long names wrap onto more than one row');
    for (const row of rows.values()) {
      row.forEach((item, i) => {
        const x = num(item.tag, 'x');
        const end = x + item.text.length * 12 * 0.5; // a narrow estimate of 12px text
        assert.ok(x - 16 >= 0 && end <= width, `legend entry "${item.text}" is on the canvas`);
        if (i > 0) {
          const previous = row[i - 1];
          const previousEnd = num(previous.tag, 'x') + previous.text.length * 12 * 0.5;
          assert.ok(x - 16 >= previousEnd, `"${item.text}" does not overlap "${previous.text}"`);
        }
      });
    }
    // The legend rows sit above the plot, not on it.
    const plotTop = Math.min(...lines(svg).map(l => num(l, 'y1')));
    assert.ok(Math.max(...rows.keys()) < plotTop, 'the legend clears the plot');

    // Date labels: thinned, each fully on the canvas, and the last one too.
    const dateLabels = texts(svg).filter(t => /^[A-Z][a-z]{2} \d{1,2}$/.test(t.text));
    assert.ok(dateLabels.length >= 10 && dateLabels.length < 122, `${dateLabels.length} date labels for 122 bars`);
    for (const label of dateLabels) {
      const reach = label.text.length * 11 * 0.6 * Math.SQRT1_2; // rotated 45°
      assert.ok(num(label.tag, 'x') + reach <= width, `date label "${label.text}" is not clipped on the right`);
      assert.ok(num(label.tag, 'y') + reach <= height, `date label "${label.text}" is not clipped at the bottom`);
    }
    const xs = dateLabels.map(l => num(l.tag, 'x'));
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 16, 'neighbouring date labels do not touch');
  }

  // 3. The last label of a short curve is not clipped either. With a fixed
  //    80px margin, "Jan 12 12:00" on the sample ran to the edge.
  {
    const svg = draw(sample, { stratifyBy: 'status' });
    const { width } = size(svg);
    const last = texts(svg).filter(t => /:00$/.test(t.text)).pop();
    const reach = last.text.length * 11 * 0.6 * Math.SQRT1_2;
    assert.ok(num(last.tag, 'x') + reach <= width, `"${last.text}" ends at ${num(last.tag, 'x') + reach} on a ${width}px canvas`);
  }

  // 4. A weekly curve says that its bars are weeks, and which kind. The whole
  //    text of one used to be "Mar 2, Mar 9, Mar 16" and the column name.
  {
    const records = ['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-20'].map((onset, i) => ({ id: String(i), onset }));
    const cdc = texts(draw(processEpiCurveData(records, 'onset', 'weekly-cdc'))).map(t => t.text).join(' | ');
    assert.match(cdc, /week.*Sunday to Saturday.*CDC\/MMWR/, 'CDC weeks are named');
    const isoWeeks = texts(draw(processEpiCurveData(records, 'onset', 'weekly-iso'))).map(t => t.text).join(' | ');
    assert.match(isoWeeks, /week.*Monday to Sunday.*ISO/, 'ISO weeks are named');
    const daily = texts(draw(processEpiCurveData(records, 'onset', 'daily'))).map(t => t.text).join(' | ');
    assert.ok(!/week/i.test(daily), 'a daily curve carries no such note');
  }

  // 5. An event outside the dates shown is not drawn. It used to be drawn on
  //    the edge of the axis, where it read as the last day shown.
  {
    const records = ['2026-03-11', '2026-03-12'].map((onset, i) => ({ id: String(i), onset }));
    const range = { range: { start: new Date(2026, 2, 11), end: new Date(2026, 2, 12, 23, 59, 59, 999) } };
    const data = processEpiCurveData(records, 'onset', 'daily', undefined, undefined, undefined, range);
    const recall = { ...base, type: 'intervention', category: 'response', id: 'recall', label: 'Recall issued', date: new Date(2026, 2, 20) };
    const inRange = { ...base, id: 'meal', label: 'Wedding meal', date: new Date(2026, 2, 11) };
    const window = { start: new Date(2026, 2, 1), end: new Date(2026, 2, 5, 23, 59, 59, 999) };
    const svg = draw(data, { annotations: [recall, inRange], exposureWindow: window });
    assertWellFormed(svg, 'out of range');
    const labels = texts(svg).map(t => t.text);
    assert.ok(labels.includes('Wedding meal'), 'the annotation inside the range is drawn');
    assert.ok(!labels.includes('Recall issued'), 'the one outside it is not');
    assert.ok(!labels.includes('Est. Exposure'), 'nor an exposure window that lies wholly outside it');
    assert.equal(lines(svg).filter(l => attr(l, 'stroke-dasharray') === '4 3').length, 1, 'one marker line, for the one event shown');
  }

  // 6. Text from the user is escaped, and an empty title leaves no empty element.
  {
    const data = processEpiCurveData([{ id: '1', onset: '2026-03-11', g: 'A & B <1y>' }], 'onset', 'daily', 'g');
    const svg = draw(data, { title: 'Cases: Ward 3 & 4 <provisional> "v2"', stratifyBy: 'g' });
    assertWellFormed(svg, 'special characters');
    assert.ok(svg.includes('Ward 3 &amp; 4 &lt;provisional&gt;'));
    assert.ok(svg.includes('A &amp; B &lt;1y&gt;'));
    assert.ok(!texts(draw(data, { title: '   ' })).some(t => t.text.trim() === ''), 'no blank title element');
  }

  console.log(`epiCurve SVG regression: all checks passed (${zone})`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
