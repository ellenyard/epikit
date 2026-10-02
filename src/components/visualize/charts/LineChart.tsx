import { useState, useMemo, useCallback } from 'react';
import type { CaseRecord, DataColumn, Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { AggregatedDataHint } from '../shared/AggregatedDataHint';
import { findCountColumn, countColumnCandidates } from '../../../utils/countColumn';
import { FacetWrapper, FacetControl } from '../shared/FacetWrapper';
import { getChartColor } from '../../../utils/chartColors';
import type { ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgHeader,
  svgFooter,
  svgText,
  svgAxisLine,
  svgGridLine,
  fitText,
  fitRotatedLabel,
  estimateTextWidth,
  FACET_PANEL_WIDTH,
  type ExcelExportData,
} from '../../../utils/chartExport';
import {
  buildLineAxis,
  categoryColumns,
  categoriesInColumn,
  categoryOf,
  numberOf,
  recordCount,
  type LineAxis,
} from '../../../utils/chartCategories';
import { niceScale, formatTick, median, type NumberSeparators } from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

interface LineChartProps {
  dataset: Dataset;
}

type ValueMode = 'count' | 'numeric';
type Aggregation = 'mean' | 'sum' | 'median';

interface SeriesPoint {
  x: number; // index position on x-axis
  y: number;
}

interface Series {
  name: string;
  points: SeriesPoint[];
  color: string;
  /** Dash pattern, used once the palette has gone round. */
  dash: string;
}

interface LineSvgOptions {
  series: Series[];
  axis: LineAxis;
  width: number;
  showDataPoints: boolean;
  showGridlines: boolean;
  title: string;
  subtitle: string;
  source: string;
  xTitle: string;
  yTitle: string;
  legendTitle: string;
  notes: string[];
  /** The values are counts, so the y-axis ticks are whole numbers. */
  integerY: boolean;
  /** A fixed y range, used to give every stratified panel the same axis. */
  yDomain?: [number, number];
  locale: NumberSeparators;
}

/** Generate SVG for line chart from series data. */
function generateLineSvg(opts: LineSvgOptions): string {
  const { series, axis, width, showDataPoints, showGridlines, locale } = opts;
  if (series.length === 0 || axis.values.length === 0) return '';

  const dims = getDefaultDimensions('line');
  const margin = { left: 70, right: 30 };
  const plotWidth = width - margin.left - margin.right;

  // The y-axis runs through zero and covers the data on both sides of it. It
  // used to assume the data was positive: a series of negative means was given
  // an axis from its minimum up to 10 and drawn flat along the bottom, or
  // below the axis altogether.
  const ys = series.flatMap(s => s.points.map(p => p.y));
  const scale = niceScale(
    Math.min(...ys, opts.yDomain?.[0] ?? Infinity),
    Math.max(...ys, opts.yDomain?.[1] ?? -Infinity),
    { integer: opts.integerY, maxIntervals: 6 }
  );
  const yRange = scale.max - scale.min;

  // Legend rows under the title block, so a subtitle is never printed through it
  const header = svgHeader(width, opts.title, opts.subtitle || undefined);
  const showLegend = series.length > 1;
  const legendItems = series.map(s => fitText(s.name, 150, 11));
  const legendRows: { text: string; index: number; x: number }[][] = [[]];
  if (showLegend) {
    let x = margin.left + (opts.legendTitle ? estimateTextWidth(`${opts.legendTitle}:`, 11, true) + 10 : 0);
    legendItems.forEach((text, index) => {
      const itemWidth = 26 + estimateTextWidth(text, 11) + 14;
      if (x + itemWidth > width - 10 && legendRows[legendRows.length - 1].length > 0) {
        legendRows.push([]);
        x = margin.left;
      }
      legendRows[legendRows.length - 1].push({ text, index, x });
      x += itemWidth;
    });
  }
  const legendTop = header.bottom + 10;
  const plotTop = legendTop + (showLegend ? legendRows.length * 18 + 6 : 6);
  const plotHeight = width < 700 ? 240 : dims.height - 130;
  const plotBottom = plotTop + plotHeight;

  const xCount = axis.values.length;
  const xStep = xCount > 1 ? plotWidth / (xCount - 1) : 0;
  const toPixelX = (index: number) => (xCount === 1 ? margin.left + plotWidth / 2 : margin.left + index * xStep);
  const toPixelY = (value: number) => plotBottom - ((value - scale.min) / yRange) * plotHeight;

  let svg = header.svg;

  if (showLegend) {
    if (opts.legendTitle) {
      svg += svgText(margin.left, legendTop + 9, `${opts.legendTitle}:`, { anchor: 'start', fontSize: 11, fontWeight: 'bold', fill: '#444', dy: '0.35em' });
    }
    legendRows.forEach((row, r) => {
      const y = legendTop + 9 + r * 18;
      for (const item of row) {
        const s = series[item.index];
        svg += `<line x1="${item.x}" y1="${y}" x2="${item.x + 20}" y2="${y}" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`;
        svg += svgText(item.x + 26, y, item.text, { anchor: 'start', fontSize: 11, fill: '#333', dy: '0.35em' });
      }
    });
  }

  for (const tick of scale.ticks) {
    const py = toPixelY(tick);
    if (showGridlines) svg += svgGridLine(margin.left, py, margin.left + plotWidth, py);
    svg += svgText(margin.left - 10, py, formatTick(tick, scale, locale), { anchor: 'end', fontSize: 11, fill: '#666', dy: '0.35em' });
  }

  svg += svgAxisLine(margin.left, plotTop, margin.left, plotBottom);
  // The baseline is the zero line, wherever on the axis that falls
  svg += svgAxisLine(margin.left, toPixelY(Math.max(scale.min, Math.min(0, scale.max))), margin.left + plotWidth, toPixelY(Math.max(scale.min, Math.min(0, scale.max))));

  // X labels: thin them to what fits, and rotate when even those would collide
  const labels = axis.labels.map(label => fitText(label, 110, 11));
  const widest = Math.max(...labels.map(l => estimateTextWidth(l, 11)));
  const maxUpright = Math.max(1, Math.floor(plotWidth / (widest + 12)));
  const rotate = xCount > maxUpright && widest > 30;
  const maxLabels = rotate ? Math.max(1, Math.floor(plotWidth / 22)) : maxUpright;
  const labelStep = Math.max(1, Math.ceil(xCount / maxLabels));
  const labelDepth = rotate ? Math.min(widest * 0.72 + 14, 96) : 22;

  axis.values.forEach((_, i) => {
    if (i % labelStep !== 0) return;
    const px = toPixelX(i);
    svg += `<line x1="${px}" y1="${plotBottom}" x2="${px}" y2="${plotBottom + 4}" stroke="#666" stroke-width="1"/>`;
    if (rotate) {
      svg += svgText(px, plotBottom + 14, fitRotatedLabel(axis.labels[i], px, 11, 110), { anchor: 'end', fontSize: 11, fill: '#666', rotate: -40 });
    } else {
      svg += svgText(px, plotBottom + 18, labels[i], { anchor: 'middle', fontSize: 11, fill: '#666' });
    }
  });

  for (const s of series) {
    // Join only neighbouring positions. A position with no value is a gap in
    // the line, not a straight run between the points either side of it.
    const runs: SeriesPoint[][] = [];
    for (const pt of s.points) {
      const run = runs[runs.length - 1];
      if (run && pt.x === run[run.length - 1].x + 1) run.push(pt);
      else runs.push([pt]);
    }
    const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
    for (const run of runs) {
      if (run.length === 1) {
        svg += `<circle cx="${toPixelX(run[0].x)}" cy="${toPixelY(run[0].y)}" r="3.5" fill="${s.color}"/>`;
        continue;
      }
      const pointsStr = run.map(pt => `${toPixelX(pt.x)},${toPixelY(pt.y)}`).join(' ');
      svg += `<polyline points="${pointsStr}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    }
    // Markers on every point crowd a long daily series into a solid band.
    if (showDataPoints && xCount <= 90) {
      for (const pt of s.points) {
        svg += `<circle cx="${toPixelX(pt.x)}" cy="${toPixelY(pt.y)}" r="3.5" fill="${s.color}" stroke="#fff" stroke-width="1.5"/>`;
      }
    }
  }

  // Axis titles: what is counted or averaged, and over what
  svg += svgText(16, plotTop + plotHeight / 2, fitText(opts.yTitle, plotHeight, 12), { fontSize: 12, fill: '#444', rotate: -90 });
  svg += svgText(margin.left + plotWidth / 2, plotBottom + labelDepth + 16, fitText(opts.xTitle, plotWidth, 12), { fontSize: 12, fill: '#444' });

  const footer = svgFooter(width, plotBottom + labelDepth + 22, opts.notes, opts.source || undefined);
  return svgWrapper(width, footer.height, svg + footer.svg);
}

/**
 * One series: the aggregate of `records` at each x position.
 * Count mode gives every position a value, zero included; the other modes skip
 * a position that has no numeric value.
 */
function buildSeriesPoints(
  records: CaseRecord[],
  xVar: string,
  axis: LineAxis,
  valueMode: ValueMode,
  yVar: string,
  aggregation: Aggregation,
): SeriesPoint[] {
  const position = new Map(axis.values.map((value, index) => [value, index]));

  if (valueMode === 'count') {
    const counts = new Array<number>(axis.values.length).fill(0);
    for (const record of records) {
      const key = axis.keyOf(record[xVar]);
      const index = key === null ? undefined : position.get(key);
      if (index !== undefined) counts[index]++;
    }
    return counts.map((y, x) => ({ x, y }));
  }

  if (!yVar) return [];
  const groups = axis.values.map(() => [] as number[]);
  for (const record of records) {
    const key = axis.keyOf(record[xVar]);
    const index = key === null ? undefined : position.get(key);
    const value = numberOf(record[yVar]);
    if (index !== undefined && value !== null) groups[index].push(value);
  }
  const points: SeriesPoint[] = [];
  groups.forEach((values, x) => {
    if (values.length === 0) return;
    const total = values.reduce((a, b) => a + b, 0);
    const y = aggregation === 'sum' ? total : aggregation === 'median' ? median(values) : total / values.length;
    points.push({ x, y });
  });
  return points;
}

export function LineChart({ dataset }: LineChartProps) {
  const { config: locale } = useLocale();
  // Config state
  // null means "follow the data": nothing chosen yet, so the chart starts from
  // what the dataset looks like.
  const [xVarChoice, setXVar] = useState<string | null>(null);
  const [valueModeChoice, setValueMode] = useState<ValueMode | null>(null);
  const [yVarChoice, setYVar] = useState<string | null>(null);
  const [aggregationChoice, setAggregation] = useState<Aggregation | null>(null);
  const [strataVar, setStrataVar] = useState('');
  const [facetCol, setFacetCol] = useState('');
  const [sharedScale, setSharedScale] = useState(true);
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showDataPoints, setShowDataPoints] = useState(true);
  const [showGridlines, setShowGridlines] = useState(true);
  // null means "follow the data"; a string is what the user typed.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [chartSubtitle, setChartSubtitle] = useState('');
  const [chartSource, setChartSource] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const colLabel = useCallback(
    (key: string) => dataset.columns.find(c => c.key === key)?.label || key,
    [dataset.columns]
  );

  // Columns for the pickers. The x-axis also takes dates, and a numeric column
  // of whole numbers such as an epi week or a year.
  const catColumns = useMemo(() => categoryColumns(dataset), [dataset]);
  const xColumns = useMemo(
    () => dataset.columns.filter(c => c.type === 'date' || catColumns.includes(c)),
    [dataset.columns, catColumns]
  );

  // Aggregated data (one row per report, with a column of cases) starts as
  // cases over time. Counting its rows drew a flat line, and the mean of the
  // count column, which was the default once it was chosen, is the average
  // report rather than the number of cases.
  const countColumn = useMemo(() => findCountColumn(dataset.columns, dataset.records), [dataset.columns, dataset.records]);
  const countLikeColumns = useMemo(
    () => (countColumn ? countColumnCandidates(dataset.columns, dataset.records).map(c => c.key) : []),
    [countColumn, dataset.columns, dataset.records]
  );
  const xVar = xVarChoice ?? (countColumn ? dataset.columns.find(c => c.type === 'date')?.key ?? '' : '');
  const valueMode: ValueMode = valueModeChoice ?? (countColumn ? 'numeric' : 'count');
  const yVar = yVarChoice ?? countColumn?.key ?? '';
  const aggregation: Aggregation = aggregationChoice ?? (countLikeColumns.includes(yVar) ? 'sum' : 'mean');
  // A total of cases is called by the column's own name, not "Sum of".
  const isCaseTotal = valueMode === 'numeric' && aggregation === 'sum' && countLikeColumns.includes(yVar);

  const xColumn: DataColumn | undefined = dataset.columns.find(c => c.key === xVar);
  const strataColumn = dataset.columns.find(c => c.key === strataVar);

  // The x-axis, shared by every series and every panel
  const axis = useMemo(
    () => (xColumn ? buildLineAxis(dataset.records, xColumn) : null),
    [xColumn, dataset.records]
  );

  // Strata, with one colour each for the whole figure. Colours used to be
  // handed out per panel, so a group was orange in one panel and blue in the next.
  const strata = useMemo(
    () => (strataColumn ? categoriesInColumn(dataset.records, strataColumn) : []),
    [strataColumn, dataset.records]
  );
  const paletteSize = 8;
  const styleOf = useCallback((index: number) => ({
    color: getChartColor(index, colorScheme),
    dash: index < paletteSize ? '' : index < paletteSize * 2 ? '7,4' : '2,4',
  }), [colorScheme]);

  const buildSeries = useCallback((records: CaseRecord[]): Series[] => {
    if (!axis || !xVar) return [];
    if (!strataVar) {
      return [{ name: 'All', points: buildSeriesPoints(records, xVar, axis, valueMode, yVar, aggregation), ...styleOf(0) }];
    }
    return strata
      .map((name, index) => ({
        name,
        points: buildSeriesPoints(
          records.filter(r => categoryOf(r[strataVar]) === name), xVar, axis, valueMode, yVar, aggregation
        ),
        ...styleOf(index),
      }))
      // A group with no records in this panel is left out of its legend.
      .filter(s => (valueMode === 'count' ? s.points.some(p => p.y !== 0) : s.points.length > 0));
  }, [axis, xVar, strataVar, strata, valueMode, yVar, aggregation, styleOf]);

  const seriesData = useMemo(() => buildSeries(dataset.records), [buildSeries, dataset.records]);

  // What the y-axis measures
  const yTitle = valueMode === 'count'
    ? 'Number of records'
    : isCaseTotal ? colLabel(yVar)
      : `${aggregation === 'sum' ? 'Sum' : aggregation === 'median' ? 'Median' : 'Mean'} of ${colLabel(yVar)}`;

  const defaultTitle = !xVar
    ? 'Line Chart'
    : `${valueMode === 'count' ? 'Records' : yTitle} by ${colLabel(xVar)}${strataVar ? ` and ${colLabel(strataVar)}` : ''}`;
  const chartTitle = titleOverride ?? defaultTitle;

  // Notes printed under the chart: what is plotted and what was left out
  const notes = useMemo(() => {
    if (!axis || !xVar) return [];
    const list: string[] = [];
    list.push(valueMode === 'count'
      ? `Points show the number of records at each ${colLabel(xVar)}.`
      : `Points show the ${aggregation} of ${colLabel(yVar)} at each ${colLabel(xVar)}.`);
    if (axis.kind === 'date' && axis.filled > 0) {
      list.push(valueMode === 'count'
        ? `${axis.step === 'day' ? 'Days' : axis.step === 'week' ? 'Weeks' : 'Months'} with no records are plotted as zero.`
        : `The line is broken where a ${axis.step} has no value.`);
    }
    if (axis.gapsHidden) list.push('Dates with no records are not shown, so the spacing between points is not to scale.');

    let excluded = 0;
    for (const record of dataset.records) {
      if (axis.keyOf(record[xVar]) === null
        || (strataVar && categoryOf(record[strataVar]) === null)
        || (valueMode === 'numeric' && yVar && numberOf(record[yVar]) === null)) {
        excluded++;
      }
    }
    if (excluded > 0) {
      const fields = [colLabel(xVar), strataVar && colLabel(strataVar), valueMode === 'numeric' && yVar && colLabel(yVar)].filter(Boolean);
      list.push(`${recordCount(excluded)} excluded: no value for ${fields.join(' or ')}.`);
    }
    return list;
  }, [axis, xVar, yVar, strataVar, valueMode, aggregation, dataset.records, colLabel]);

  const svgOptions = useMemo((): LineSvgOptions | null => axis && {
    series: seriesData,
    axis,
    width: getDefaultDimensions('line').width,
    showDataPoints,
    showGridlines,
    title: chartTitle,
    subtitle: chartSubtitle,
    source: chartSource,
    xTitle: colLabel(xVar),
    yTitle,
    legendTitle: strataVar ? colLabel(strataVar) : '',
    notes,
    integerY: valueMode === 'count',
    locale,
  }, [axis, seriesData, showDataPoints, showGridlines, chartTitle, chartSubtitle, chartSource, xVar, yTitle, strataVar, notes, valueMode, locale, colLabel]);

  // Generate SVG string
  const svgContent = useMemo(() => (svgOptions ? generateLineSvg(svgOptions) : ''), [svgOptions]);

  // Stratified panels: the y range every panel shares, taken from all of them
  const facetDomain = useMemo((): [number, number] | undefined => {
    if (!facetCol || !sharedScale) return undefined;
    const facetColumn = dataset.columns.find(c => c.key === facetCol);
    let lo = 0;
    let hi = 0;
    for (const value of categoriesInColumn(dataset.records, facetColumn)) {
      const panel = buildSeries(dataset.records.filter(r => categoryOf(r[facetCol]) === value));
      for (const s of panel) for (const p of s.points) {
        if (p.y < lo) lo = p.y;
        if (p.y > hi) hi = p.y;
      }
    }
    return [lo, hi];
  }, [facetCol, sharedScale, dataset, buildSeries]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const columns = [
      { header: xVar ? colLabel(xVar) : 'X-Axis', key: 'xLabel' },
      ...seriesData.map((series, i) => ({ header: series.name === 'All' && !strataVar ? yTitle : series.name, key: `s${i}` })),
    ];
    const rows = (axis?.values ?? []).map((xVal, index) => {
      const row: Record<string, string | number | null> = { xLabel: xVal };
      seriesData.forEach((series, i) => {
        const point = series.points.find(p => p.x === index);
        row[`s${i}`] = point ? point.y : null;
      });
      return row;
    });
    return {
      title: chartTitle,
      subtitle: chartSubtitle || undefined,
      source: chartSource || undefined,
      columns,
      rows,
    };
  }, [seriesData, axis, xVar, strataVar, yTitle, chartTitle, chartSubtitle, chartSource, colLabel]);

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Left Panel - Config */}
      <div className="w-full lg:w-72 flex-shrink-0 bg-gray-50 border-b lg:border-b-0 lg:border-r border-gray-200 p-4 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Line Chart</h3>
            <p className="text-xs text-gray-500 mt-1">
              Show trends over time with connected data points.
            </p>
          </div>

          <VisualizationTip
            tip="Line charts are ideal for showing trends over time. The connected points imply continuity, so use them only for time-ordered data. For unordered categories, a bar chart is more appropriate."
            context="Use date columns on the x-axis. Multiple series can compare trends across groups (e.g., cases by district over time)."
          />

          <div className="border border-blue-100 rounded-lg overflow-hidden mb-3">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 text-sm font-medium text-blue-800 hover:bg-blue-100 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                When to Use This Chart
              </span>
              <svg className={`w-4 h-4 transition-transform ${showGuide ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showGuide && (
              <div className="px-3 py-2 text-xs text-blue-700 space-y-1.5 bg-white">
                <p>• Showing trends over time (daily, weekly, monthly case counts)</p>
                <p>• Comparing trends across multiple groups or strata</p>
                <p>• Displaying surveillance data over continuous time periods</p>
                <p>• When the connection between data points implies continuity</p>
                <p className="text-blue-500 italic mt-2">Line charts imply continuity between points — only use them for time-ordered or naturally sequential data. For unordered categories, use a bar chart instead. — CDC Principles of Epidemiology</p>
              </div>
            )}
          </div>

          {/* X-axis variable */}
          <VariableMapper
            label="X-Axis Variable"
            description="Date or ordered variable for the horizontal axis"
            columns={xColumns}
            value={xVar}
            onChange={setXVar}
            required
            placeholder="Select x-axis variable..."
          />

          {/* Value mode */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Y-Axis Value</label>
            <select
              value={valueMode}
              onChange={(e) => setValueMode(e.target.value as ValueMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="count">Count (frequency over x)</option>
              <option value="numeric">Numeric variable</option>
            </select>
          </div>
          {valueMode === 'count' && countColumn && (
            <AggregatedDataHint
              countLabel={countColumn.label}
              onUseCounts={() => { setValueMode('numeric'); setYVar(countColumn.key); setAggregation('sum'); }}
            />
          )}

          {/* Y-axis variable (when numeric mode) */}
          {valueMode === 'numeric' && (
            <VariableMapper
              label="Y-Axis Variable"
              description="Numeric variable to plot"
              columns={dataset.columns}
              value={yVar}
              onChange={setYVar}
              filterTypes={['number']}
              required
              placeholder="Select numeric variable..."
            />
          )}

          {valueMode === 'numeric' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Summarise As</label>
              <select
                value={aggregation}
                onChange={(e) => setAggregation(e.target.value as Aggregation)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="mean">Mean at each x value</option>
                <option value="sum">Sum at each x value</option>
                <option value="median">Median at each x value</option>
              </select>
            </div>
          )}

          {/* Strata / group-by */}
          <VariableMapper
            label="Group By (optional)"
            description="Split into multiple series by this variable"
            columns={catColumns}
            value={strataVar}
            onChange={setStrataVar}
            placeholder="None (single series)"
          />

          {/* Color scheme */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
            <select
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value as ChartColorScheme)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="evergreen">Evergreen</option>
              <option value="colorblind">Colorblind-Friendly</option>
              <option value="grayscale">Grayscale</option>
              <option value="blue">Blue</option>
              <option value="warm">Warm</option>
            </select>
          </div>

          {/* Display options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Display Options</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showDataPoints}
                onChange={(e) => setShowDataPoints(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">Show data points</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showGridlines}
                onChange={(e) => setShowGridlines(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">Show gridlines</span>
            </label>
          </div>

          {/* Stratify */}
          <FacetControl
            columns={catColumns}
            value={facetCol}
            onChange={setFacetCol}
            sharedScale={sharedScale}
            onSharedScaleChange={setSharedScale}
          />

          {/* Chart labels */}
          <div className="space-y-3 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Chart Labels</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title</label>
              <input
                type="text"
                value={chartTitle}
                onChange={(e) => setTitleOverride(e.target.value)}
                placeholder="Chart title"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Subtitle</label>
              <input
                type="text"
                value={chartSubtitle}
                onChange={(e) => setChartSubtitle(e.target.value)}
                placeholder="Optional subtitle"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Source</label>
              <input
                type="text"
                value={chartSource}
                onChange={(e) => setChartSource(e.target.value)}
                placeholder="Data source"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Chart */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {svgOptions && svgContent ? (
          facetCol ? (
            <FacetWrapper
              dataset={dataset}
              facetCol={facetCol}
              title={chartTitle}
              subtitle={chartSubtitle || undefined}
              source={chartSource || undefined}
              notes={[
                ...notes,
                sharedScale
                  ? 'All panels share the same x-axis and y-axis.'
                  : 'All panels share the same x-axis. Each panel has its own y-axis scale: compare shapes, not heights.',
              ]}
              filename="line_chart"
              renderPanel={(records) => generateLineSvg({
                ...svgOptions,
                series: buildSeries(records),
                width: FACET_PANEL_WIDTH,
                title: '',
                subtitle: '',
                source: '',
                notes: [],
                yDomain: facetDomain,
              })}
            />
          ) : (
            <ChartContainer
              title={chartTitle}
              svgContent={svgContent}
              excelData={excelData}
              filename="line_chart"
            >
              <div dangerouslySetInnerHTML={{ __html: svgContent }} />
            </ChartContainer>
          )
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            {xVar
              ? 'No data available for the selected configuration'
              : 'Select an x-axis variable to generate the line chart'}
          </div>
        )}
      </div>
    </div>
  );
}
