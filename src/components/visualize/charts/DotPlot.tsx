import { useState, useMemo, useCallback } from 'react';
import type { Dataset } from '../../../types/analysis';
import { pickCategoryColumn, pickNumericColumn, resolveColumnChoice } from '../../../utils/chartDefaults';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { FacetWrapper, FacetControl } from '../shared/FacetWrapper';
import { getChartColors, type ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgHeader,
  svgFooter,
  svgText,
  svgAxisLine,
  svgGridLine,
  fitText,
  FACET_PANEL_WIDTH,
  type ExcelExportData,
} from '../../../utils/chartExport';
import {
  categoryColumns,
  categoryOf,
  numberOf,
  orderCategories,
  hasNaturalOrder,
  byCategoryOrder,
  recordCount,
} from '../../../utils/chartCategories';
import {
  niceScale,
  formatTick,
  formatFixed,
  decimalsForValues,
  median,
  type NumberSeparators,
} from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

interface DotPlotProps {
  dataset: Dataset;
}

type SortMode = 'value' | 'category';
type ValueFormat = 'number' | 'percent';
type Aggregation = 'mean' | 'sum' | 'count' | 'median';

interface DotPlotRow {
  category: string;
  val1: number;
  n: number;
  /** No records in this panel for a category the other panels have. */
  empty?: boolean;
}

interface DotPlotRows {
  rows: DotPlotRow[];
  excluded: number;
  /** Records counted, the denominator of a percentage. */
  included: number;
}

interface DotSvgOptions {
  rows: DotPlotRow[];
  excluded: number;
  included: number;
  width: number;
  categoryCol: string;
  valueCol: string;
  colorScheme: ChartColorScheme;
  showLabels: boolean;
  title: string;
  subtitle: string;
  source: string;
  axisTitle: string;
  valueFormat: ValueFormat;
  aggregation: Aggregation;
  flagSmallCounts: boolean;
  referenceValue: number | null;
  referenceLabel: string;
  dataset: Dataset;
  /** Facet panels share one set of footnotes under the grid, so they suppress their own. */
  suppressFootnotes?: boolean;
  /** A fixed value range, used to give every stratified panel the same axis. */
  domain?: [number, number];
  locale: NumberSeparators;
}

/** Wrap a category label into at most 2 lines, breaking near 22-25 chars on a space when possible. */
function wrapCategoryLabel(label: string): string[] {
  const MAX_LINE = 25;
  if (label.length <= MAX_LINE) return [label];
  let breakIdx = -1;
  for (let i = MAX_LINE - 1; i >= 12; i--) {
    if (label[i] === ' ') {
      breakIdx = i;
      break;
    }
  }
  if (breakIdx === -1) breakIdx = MAX_LINE - 1;
  const line1 = label.slice(0, breakIdx).trimEnd();
  let line2 = label.slice(breakIdx).trim();
  if (line2.length > MAX_LINE) line2 = `${line2.slice(0, MAX_LINE - 1).trimEnd()}...`;
  return [line1, line2];
}

/** The notes under a dot plot: what a dot is, and what was left out. */
function buildFootnotes(opts: DotSvgOptions, axisStartsAtZero: boolean): string[] {
  const { rows, excluded, included, categoryCol, valueCol, valueFormat, aggregation, flagSmallCounts, dataset } = opts;
  const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;
  const footnotes: string[] = [];
  if (aggregation === 'count') {
    footnotes.push(valueFormat === 'percent'
      ? `Values show the percent of the ${recordCount(included)} with ${colLabel(categoryCol)} recorded.`
      : `Values show the number of records per ${colLabel(categoryCol)}.`);
  } else {
    footnotes.push(`Values show the ${aggregation} of ${colLabel(valueCol)} per ${colLabel(categoryCol)}.`);
  }
  // A dot marks a position, so the axis may start near the data rather than
  // at zero. Say so: distances between dots then overstate ratios.
  if (!axisStartsAtZero) footnotes.push('The value axis does not start at zero.');
  if (flagSmallCounts && rows.some(r => !r.empty && r.n < 20)) {
    footnotes.push('Hollow dots indicate categories based on fewer than 20 records. Interpret with caution.');
  }
  if (excluded > 0) {
    footnotes.push(`${recordCount(excluded)} excluded due to missing values.`);
  }
  return footnotes;
}

/** Generate SVG for dot plot from rows. */
function generateDotSvg(opts: DotSvgOptions): string {
  const {
    rows,
    width,
    colorScheme,
    showLabels,
    title,
    subtitle,
    source,
    axisTitle,
    valueFormat,
    aggregation,
    flagSmallCounts,
    referenceValue,
    referenceLabel,
    locale,
  } = opts;
  if (rows.length === 0) return '';

  const dims = getDefaultDimensions('dot');

  // Wrap category labels (max 2 lines) and widen the left margin to fit the longest line
  const wrappedLabels = rows.map(r => wrapCategoryLabel(r.category));
  const maxLabelChars = wrappedLabels.reduce((m, lines) => Math.max(m, ...lines.map(l => l.length)), 0);
  const margin = {
    left: Math.min(Math.min(260, width * 0.4), Math.max(60, Math.ceil(maxLabelChars * 6.8) + 16)),
    right: dims.margin.right,
  };
  const plotW = width - margin.left - margin.right;

  // Round ticks that cover the data. A count axis starts at zero and steps in
  // whole records; other statistics may start near the data. The old axis was
  // the data range padded by a percentage and cut in five, which produced
  // ticks like 9.9, 10.0, 10.0, 10.0, 10.1 on a count of ten.
  const values = rows.filter(r => !r.empty).map(r => r.val1);
  const isRecordCount = aggregation === 'count' && valueFormat !== 'percent';
  const scale = niceScale(
    Math.min(...values, referenceValue ?? Infinity, opts.domain?.[0] ?? Infinity),
    Math.max(...values, referenceValue ?? -Infinity, opts.domain?.[1] ?? -Infinity),
    { integer: isRecordCount, includeZero: aggregation === 'count', maxIntervals: width < 700 ? 4 : 6 }
  );
  const suffix = valueFormat === 'percent' ? '%' : '';
  const decimals = isRecordCount ? 0 : aggregation === 'count' ? 1 : decimalsForValues(values);

  const colors = getChartColors(1, colorScheme);
  const dotRadius = 5;
  // Rows shrink to fit the default height down to a floor, then the canvas grows.
  const defaultPlotH = dims.height - dims.margin.top - dims.margin.bottom;
  const rowHeight = Math.max(Math.min(defaultPlotH / rows.length, 30), 14);
  const actualPlotH = rowHeight * rows.length;

  const header = svgHeader(width, title, subtitle || undefined);
  const plotTop = header.bottom + 14;
  const axisY = plotTop + actualPlotH;

  const xScale = (val: number) => margin.left + ((val - scale.min) / (scale.max - scale.min)) * plotW;
  const yScale = (i: number) => plotTop + i * rowHeight + rowHeight / 2;

  let svg = header.svg;

  for (const tick of scale.ticks) {
    const x = xScale(tick);
    svg += svgGridLine(x, plotTop, x, axisY);
    svg += svgText(x, axisY + 18, formatTick(tick, scale, locale, suffix), { fontSize: 10, fill: '#666' });
  }

  svg += svgAxisLine(margin.left, axisY, margin.left + plotW, axisY);

  if (referenceValue !== null) {
    const refX = xScale(referenceValue);
    svg += `<line x1="${refX}" y1="${plotTop}" x2="${refX}" y2="${axisY}" stroke="#6B7280" stroke-width="1.5" stroke-dasharray="5,4"/>`;
    if (referenceLabel) {
      const onRight = refX < margin.left + plotW * 0.7;
      svg += svgText(refX + (onRight ? 4 : -4), plotTop - 5, referenceLabel, { anchor: onRight ? 'start' : 'end', fontSize: 10, fill: '#555' });
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cy = yScale(i);

    const lines = wrappedLabels[i];
    if (lines.length === 1 || rowHeight < 24) {
      svg += svgText(margin.left - 8, cy, fitText(row.category, margin.left - 14, 11), { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
    } else {
      svg += svgText(margin.left - 8, cy - 7, lines[0], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
      svg += svgText(margin.left - 8, cy + 7, lines[1], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
    }

    svg += `<line x1="${margin.left}" y1="${cy}" x2="${margin.left + plotW}" y2="${cy}" stroke="#E5E7EB" stroke-width="1"/>`;

    if (row.empty) continue;

    const hollow = flagSmallCounts && row.n < 20;
    const dot1X = xScale(row.val1);

    svg += hollow
      ? `<circle cx="${dot1X}" cy="${cy}" r="${dotRadius}" fill="white" stroke="${colors[0]}" stroke-width="1.5"/>`
      : `<circle cx="${dot1X}" cy="${cy}" r="${dotRadius}" fill="${colors[0]}" stroke="white" stroke-width="1"/>`;

    if (showLabels) {
      const labelVal1 = `${formatFixed(row.val1, decimals, locale)}${suffix}`;
      svg += svgText(dot1X + dotRadius + 4, cy, labelVal1, { anchor: 'start', fontSize: 10, fill: '#444', dy: '0.35em' });
    }
  }

  // Bottom area: axis title, then footnotes and the source line
  let cursorY = axisY + 24;
  if (axisTitle) {
    cursorY += 14;
    svg += svgText(margin.left + plotW / 2, cursorY, fitText(axisTitle, plotW + margin.right, 12), { fontSize: 12, fill: '#444' });
  }

  const footnotes = opts.suppressFootnotes ? [] : buildFootnotes(opts, scale.min <= 0 && scale.max >= 0);
  const footer = svgFooter(width, cursorY + 4, footnotes, source || undefined);
  return svgWrapper(width, footer.height, svg + footer.svg);
}

export function DotPlot({ dataset }: DotPlotProps) {
  const { config: locale } = useLocale();
  const [categoryColChoice, setCategoryColChoice] = useState('');
  const [valueColChoice, setValueColChoice] = useState('');
  const [facetCol, setFacetCol] = useState('');
  const [sharedScale, setSharedScale] = useState(true);
  // null means "follow the data": categories with an order of their own keep
  // it, and the rest are ranked by value.
  const [sortChoice, setSortChoice] = useState<SortMode | null>(null);
  const [aggregation, setAggregation] = useState<Aggregation>('mean');
  const [valueFormat, setValueFormat] = useState<ValueFormat>('number');
  const [flagSmallCounts, setFlagSmallCounts] = useState(true);
  const [referenceLine, setReferenceLine] = useState('');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  // null means "follow the data"; a string is an explicit override typed by the
  // user. Derived rather than synced in an effect, so the title cannot lag the
  // controls it describes.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState('');
  const [axisTitleOverride, setAxisTitleOverride] = useState<string | null>(null);
  const [source, setSource] = useState('');

  const catColumns = useMemo(() => categoryColumns(dataset), [dataset]);

  // Effective selections: the user's choice while it remains valid for the
  // current dataset, otherwise an automatic pick. Derived rather than written
  // back through an effect.
  const categoryCol = resolveColumnChoice(dataset, categoryColChoice, useMemo(() => pickCategoryColumn(dataset), [dataset]));
  const valueCol = resolveColumnChoice(dataset, valueColChoice, useMemo(() => pickNumericColumn(dataset), [dataset]), true);

  const categoryColumn = useMemo(
    () => dataset.columns.find(c => c.key === categoryCol),
    [dataset.columns, categoryCol]
  );
  const valueLabel = dataset.columns.find(c => c.key === valueCol)?.label || '';
  const statistic = aggregation === 'count' ? '' : `${aggregation[0].toUpperCase()}${aggregation.slice(1)} of ${valueLabel}`;

  const axisTitle = useMemo(() => {
    if (axisTitleOverride !== null) return axisTitleOverride;
    if (aggregation === 'count') {
      return valueFormat === 'percent' ? 'Percent of records' : 'Number of records';
    }
    // Outside count mode the values are not converted to percentages: the
    // aggregate is only a percentage if the column already was one. Name the
    // statistic and the variable, and mark the unit.
    return valueFormat === 'percent' ? `${statistic} (%)` : statistic;
  }, [axisTitleOverride, aggregation, statistic, valueFormat]);

  const defaultTitle = !categoryCol
    ? 'Dot Plot'
    : `${aggregation === 'count' ? 'Records' : statistic} by ${categoryColumn?.label || categoryCol}`;
  const title = titleOverride ?? defaultTitle;

  const referenceValue = useMemo(() => {
    if (referenceLine.trim() === '') return null;
    const v = Number(referenceLine);
    return isNaN(v) ? null : v;
  }, [referenceLine]);

  const computeRows = useCallback((records: Dataset['records']): DotPlotRows => {
    // Count mode tallies records per category and never reads the value column. Requiring a
    // numeric value there under-counted every category and made the percent denominator
    // "records that happen to have a value" rather than all records.
    const countMode = aggregation === 'count';
    if (!categoryCol) return { rows: [], excluded: 0, included: 0 };
    if (!countMode && !valueCol) return { rows: [], excluded: 0, included: 0 };

    const categoryMap = new Map<string, { values1: number[] }>();
    let excluded = 0;
    let included = 0;

    for (const rec of records) {
      const catStr = categoryOf(rec[categoryCol]);
      if (catStr === null) {
        excluded++;
        continue;
      }
      let v1 = 0;
      if (!countMode) {
        const num = numberOf(rec[valueCol]);
        if (num === null) {
          excluded++;
          continue;
        }
        v1 = num;
      }
      if (!categoryMap.has(catStr)) {
        categoryMap.set(catStr, { values1: [] });
      }
      const entry = categoryMap.get(catStr)!;
      entry.values1.push(v1);
      included++;
    }

    const aggregate = (values: number[]): number => {
      switch (aggregation) {
        case 'sum':
          return values.reduce((a, b) => a + b, 0);
        case 'count':
          return values.length;
        case 'median':
          return median(values);
        default:
          return values.reduce((a, b) => a + b, 0) / values.length;
      }
    };

    const computedRows: DotPlotRow[] = Array.from(categoryMap.entries()).map(([cat, agg]) => ({
      category: cat,
      val1: aggregate(agg.values1),
      n: agg.values1.length,
    }));

    // In count mode with percent format, plot each category's share of the included records
    if (aggregation === 'count' && valueFormat === 'percent' && included > 0) {
      for (const r of computedRows) r.val1 = (r.n / included) * 100;
    }

    return { rows: computedRows, excluded, included };
  }, [categoryCol, valueCol, aggregation, valueFormat]);

  const { rows: unsortedRows, excluded, included } = useMemo(() => computeRows(dataset.records), [computeRows, dataset.records]);

  // Category order: the column's declared order, then numeric-aware, so age
  // bands run 0-4, 5-9, 10-14. The old "Alphabetical" put 10-14 before 5-9.
  const categoryOrder = useMemo(
    () => orderCategories(unsortedRows.map(r => r.category), categoryColumn),
    [unsortedRows, categoryColumn]
  );
  const sortMode: SortMode = sortChoice
    ?? (hasNaturalOrder(categoryOrder, categoryColumn) ? 'category' : 'value');

  const rows = useMemo(() => {
    const inOrder = [...unsortedRows].sort(byCategoryOrder(categoryOrder, r => r.category));
    return sortMode === 'value' ? inOrder.sort((a, b) => b.val1 - a.val1) : inOrder;
  }, [unsortedRows, categoryOrder, sortMode]);

  const svgOptions = useMemo((): DotSvgOptions => ({
    rows,
    excluded,
    included,
    width: getDefaultDimensions('dot').width,
    categoryCol,
    valueCol,
    colorScheme,
    showLabels,
    title,
    subtitle,
    source,
    axisTitle,
    valueFormat,
    aggregation,
    flagSmallCounts,
    referenceValue,
    referenceLabel,
    dataset,
    locale,
  }), [rows, excluded, included, categoryCol, valueCol, colorScheme, showLabels, title, subtitle, source, axisTitle, valueFormat, aggregation, flagSmallCounts, referenceValue, referenceLabel, dataset, locale]);

  const svgContent = useMemo(() => generateDotSvg(svgOptions), [svgOptions]);

  // Stratified panels list the same categories in the same order, so a row
  // means the same thing in every panel.
  const facetPanelRows = useCallback((records: Dataset['records']): DotPlotRow[] => {
    const panel = computeRows(records);
    const byCategory = new Map(panel.rows.map(r => [r.category, r]));
    return rows.map(r => byCategory.get(r.category)
      ?? { category: r.category, val1: 0, n: 0, empty: aggregation !== 'count' });
  }, [computeRows, rows, aggregation]);

  // The value range every panel shares, taken from all of them
  const facetDomain = useMemo((): [number, number] | undefined => {
    if (!facetCol || !sharedScale) return undefined;
    let lo = Infinity;
    let hi = -Infinity;
    const strata = new Set(dataset.records.map(r => categoryOf(r[facetCol])).filter((v): v is string => v !== null));
    for (const stratum of strata) {
      for (const r of facetPanelRows(dataset.records.filter(rec => categoryOf(rec[facetCol]) === stratum))) {
        if (r.empty) continue;
        if (r.val1 < lo) lo = r.val1;
        if (r.val1 > hi) hi = r.val1;
      }
    }
    return isFinite(lo) ? [lo, hi] : undefined;
  }, [facetCol, sharedScale, dataset.records, facetPanelRows]);

  const facetFootnotes = useMemo(() => {
    const notes = buildFootnotes(svgOptions, aggregation === 'count');
    if (aggregation === 'count' && valueFormat === 'percent') {
      notes[0] = `Values show the percent of each panel's records with ${categoryColumn?.label || categoryCol} recorded.`;
    }
    if (aggregation !== 'count') notes.splice(1, 0, 'The value axis may not start at zero.');
    notes.push(sharedScale
      ? 'All panels share the same value axis.'
      : 'Each panel has its own value axis scale: compare within a panel, not between panels.');
    return notes;
  }, [svgOptions, aggregation, valueFormat, categoryColumn, categoryCol, sharedScale]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;
    const columns = [
      { header: categoryCol ? colLabel(categoryCol) : 'Category', key: 'category' },
      // In count mode val1 holds a record count (or a percent share when valueFormat is
      // 'percent'), never the value column, so the header must not carry that column's name.
      {
        header: aggregation === 'count'
          ? (valueFormat === 'percent' ? 'Percent of records' : 'Count')
          : (valueCol ? statistic : 'Value'),
        key: 'val1',
      },
      { header: 'Records', key: 'n' },
    ];
    const excelRows = rows.map(r => {
      const row: Record<string, string | number | null> = {
        category: r.category,
        val1: r.val1,
        n: r.n,
      };
      return row;
    });
    return {
      title,
      subtitle: subtitle || undefined,
      source: source || undefined,
      columns,
      rows: excelRows,
    };
  }, [rows, title, subtitle, source, dataset, categoryCol, valueCol, aggregation, valueFormat, statistic]);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          <VariableMapper
            label="Category"
            description="Groups shown on the y-axis"
            columns={catColumns}
            value={categoryCol}
            onChange={setCategoryColChoice}
            required
          />

          {/* Counting records reads no value column, so none is asked for. */}
          {aggregation !== 'count' && (
            <VariableMapper
              label="Value"
              description="Numeric column summarised per category"
              columns={dataset.columns}
              value={valueCol}
              onChange={setValueColChoice}
              filterTypes={['number']}
              required
            />
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Options</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort</label>
            <select
              value={sortMode}
              onChange={(e) => setSortChoice(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="value">By value (descending)</option>
              <option value="category">Category order</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Aggregation</label>
            <select
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value as Aggregation)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="mean">Mean</option>
              <option value="sum">Sum</option>
              <option value="count">Count</option>
              <option value="median">Median</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Value Format</label>
            <select
              value={valueFormat}
              onChange={(e) => setValueFormat(e.target.value as ValueFormat)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="number">Number</option>
              <option value="percent">Percent</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
            <select
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value as ChartColorScheme)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="evergreen">Evergreen</option>
              <option value="colorblind">Colorblind-safe</option>
              <option value="grayscale">Grayscale</option>
              <option value="blue">Blue sequential</option>
              <option value="warm">Warm</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference line (optional)</label>
            <input
              type="number"
              value={referenceLine}
              onChange={(e) => setReferenceLine(e.target.value)}
              placeholder="No reference line"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference label</label>
            <input
              type="text"
              value={referenceLabel}
              onChange={(e) => setReferenceLabel(e.target.value)}
              placeholder="e.g. National average"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show value labels
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={flagSmallCounts}
              onChange={(e) => setFlagSmallCounts(e.target.checked)}
              className="rounded border-gray-300"
            />
            Flag small counts (n &lt; 20)
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <FacetControl
            columns={catColumns}
            value={facetCol}
            onChange={setFacetCol}
            sharedScale={sharedScale}
            onSharedScaleChange={setSharedScale}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Annotations</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitleOverride(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Axis Title</label>
            <input
              type="text"
              value={axisTitle}
              onChange={(e) => {
                setAxisTitleOverride(e.target.value);
              }}
              placeholder="Defaults to the Value column label"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-w-0">
        {svgContent ? (
          facetCol ? (
            <FacetWrapper
              dataset={dataset}
              facetCol={facetCol}
              title={title}
              subtitle={subtitle || undefined}
              source={source || undefined}
              notes={facetFootnotes}
              filename="dot-plot"
              renderPanel={(records) => generateDotSvg({
                ...svgOptions,
                rows: facetPanelRows(records),
                width: FACET_PANEL_WIDTH,
                title: '',
                subtitle: '',
                source: '',
                suppressFootnotes: true,
                domain: facetDomain,
              })}
            />
          ) : (
            <ChartContainer
              title={title}
              svgContent={svgContent}
              excelData={excelData}
              filename="dot-plot"
            >
              <div dangerouslySetInnerHTML={{ __html: svgContent }} />
            </ChartContainer>
          )
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Select a category and value column to create a dot plot</p>
            <p className="text-gray-400 text-sm mt-2">Map your data using the panel on the left</p>
          </div>
        )}
      </div>
    </div>
  );
}
