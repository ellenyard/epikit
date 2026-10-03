import { useState, useMemo } from 'react';
import { pickCategoryColumn, pickNumericColumn, resolveColumnChoice, looksLikeRate } from '../../../utils/chartDefaults';
import { ChartContainer } from '../shared/ChartContainer';
import { AggregatedDataHint } from '../shared/AggregatedDataHint';
import { findCountColumn } from '../../../utils/countColumn';
import { CHART_ROW_CLASS, SETTINGS_COLUMN_CLASS, CHART_COLUMN_CLASS, type ChartProps } from '../shared/ChartLayout';
import { chartTitle as titleFor, statisticPhrase } from '../../../utils/chartTitles';
import { VariableMapper } from '../shared/VariableMapper';
import {
  getDefaultDimensions,
  svgWrapper,
  svgHeader,
  svgFooter,
  svgText,
  svgAxisLine,
  svgGridLine,
  fitText,
  type ExcelExportData,
} from '../../../utils/chartExport';
import { getChartColor, type ChartColorScheme } from '../../../utils/chartColors';
import {
  categoryColumns,
  categoryOf,
  numberOf,
  orderCategories,
  hasNaturalOrder,
  byCategoryOrder,
  recordCount,
} from '../../../utils/chartCategories';
import { niceScale, formatTick, formatFixed, decimalsForValues, median } from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

type ValueMode = 'count' | 'numeric';
type SortMode = 'value-desc' | 'value-asc' | 'category';
type ValueFormat = 'number' | 'percent';
type Aggregation = 'mean' | 'sum' | 'median';

interface LollipopDataPoint {
  category: string;
  value: number;
  n: number;
}

interface LollipopData {
  points: LollipopDataPoint[];
  excluded: number;
  /** Records counted, the denominator of a percentage. */
  included: number;
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

export function LollipopChart({ dataset, filterNote = '' }: ChartProps) {
  const { config: locale } = useLocale();
  const [categoryColChoice, setCategoryColChoice] = useState('');
  // null means "follow the data": see countColumn below.
  const [valueModeChoice, setValueMode] = useState<ValueMode | null>(null);
  const [numericColChoice, setNumericColChoice] = useState('');
  // null means "follow the data": categories with an order of their own keep
  // it, and the rest are ranked by value.
  const [sortChoice, setSortChoice] = useState<SortMode | null>(null);
  const [aggregationChoice, setAggregation] = useState<Aggregation | null>(null);
  const [valueFormat, setValueFormat] = useState<ValueFormat>('number');
  const [highlightCat, setHighlightCat] = useState('');
  // null means "follow the data": flagged for a percentage or a rate, where a
  // small denominator makes the value unstable, and not for a plain count.
  const [flagSmallCountsChoice, setFlagSmallCounts] = useState<boolean | null>(null);
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
  // Aggregated data (one row per report, with a column of cases) starts as
  // the total of that column, as the bar chart does. Counting its rows drew
  // the same value for every category.
  const countColumn = useMemo(() => findCountColumn(dataset.columns, dataset.records), [dataset.columns, dataset.records]);
  const valueMode: ValueMode = valueModeChoice ?? (countColumn ? 'numeric' : 'count');
  const numericCol = resolveColumnChoice(
    dataset, numericColChoice,
    useMemo(() => countColumn?.key ?? pickNumericColumn(dataset), [countColumn, dataset]),
    true
  );
  const aggregation: Aggregation = aggregationChoice ?? (countColumn?.key === numericCol ? 'sum' : 'mean');

  const categoryColumn = useMemo(
    () => dataset.columns.find(c => c.key === categoryCol),
    [dataset.columns, categoryCol]
  );
  const numericLabel = dataset.columns.find(c => c.key === numericCol)?.label || '';
  // A total of cases is called by the column's own name, not "Sum of".
  const isCaseTotal = valueMode === 'numeric' && aggregation === 'sum' && countColumn?.key === numericCol;
  const statistic = valueMode === 'count' ? ''
    : isCaseTotal ? numericLabel
      : `${aggregation[0].toUpperCase()}${aggregation.slice(1)} of ${numericLabel}`;
  const flagSmallCounts = flagSmallCountsChoice
    ?? (valueFormat === 'percent' || (valueMode !== 'count' && looksLikeRate(numericLabel)));

  const axisTitle = useMemo(() => {
    if (axisTitleOverride !== null) return axisTitleOverride;
    if (valueMode === 'count') {
      return valueFormat === 'percent' ? 'Percent of records' : 'Number of records';
    }
    // Outside count mode the values are not converted to percentages: the
    // aggregate is only a percentage if the column already was one. Name the
    // statistic and the variable, and mark the unit.
    return valueFormat === 'percent' ? `${statistic} (%)` : statistic;
  }, [axisTitleOverride, valueMode, statistic, valueFormat]);

  const defaultTitle = !categoryCol
    ? 'Lollipop Chart'
    : titleFor(
      statisticPhrase({ statistic: valueMode === 'count' ? 'count' : aggregation, valueLabel: numericLabel, isCountColumn: isCaseTotal }),
      categoryColumn?.label || categoryCol
    );
  const title = titleOverride ?? defaultTitle;

  const referenceValue = useMemo(() => {
    if (referenceLine.trim() === '') return null;
    const v = Number(referenceLine);
    return isNaN(v) ? null : v;
  }, [referenceLine]);

  // Build lollipop data
  const { points: unsortedData, excluded, included } = useMemo((): LollipopData => {
    if (!categoryCol) return { points: [], excluded: 0, included: 0 };

    let points: LollipopDataPoint[];
    let excluded = 0;
    let included = 0;

    if (valueMode === 'count') {
      const counts = new Map<string, number>();
      for (const record of dataset.records) {
        const key = categoryOf(record[categoryCol]);
        if (key === null) {
          excluded++;
          continue;
        }
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      points = Array.from(counts.entries()).map(([category, count]) => ({
        category,
        value: count,
        n: count,
      }));
      included = points.reduce((s, p) => s + p.n, 0);

      // In count mode with percent format, plot each category's share of the included records
      if (valueFormat === 'percent' && included > 0) {
        for (const p of points) p.value = (p.n / included) * 100;
      }
    } else {
      if (!numericCol) return { points: [], excluded: 0, included: 0 };
      const grouped = new Map<string, number[]>();

      for (const record of dataset.records) {
        const key = categoryOf(record[categoryCol]);
        const num = numberOf(record[numericCol]);
        if (key === null || num === null) {
          excluded++;
          continue;
        }
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(num);
        included++;
      }

      const aggregate = (values: number[]): number => {
        switch (aggregation) {
          case 'sum':
            return values.reduce((a, b) => a + b, 0);
          case 'median':
            return median(values);
          default:
            return values.reduce((a, b) => a + b, 0) / values.length;
        }
      };

      points = Array.from(grouped.entries()).map(([category, vals]) => ({
        category,
        value: aggregate(vals),
        n: vals.length,
      }));
    }

    return { points, excluded, included };
  }, [categoryCol, valueMode, numericCol, aggregation, valueFormat, dataset.records]);

  // Category order: the column's declared order, then numeric-aware, so age
  // bands run 0-4, 5-9, 10-14. The old "Alphabetical" put 10-14 before 5-9.
  const categoryOrder = useMemo(
    () => orderCategories(unsortedData.map(d => d.category), categoryColumn),
    [unsortedData, categoryColumn]
  );
  const sortMode: SortMode = sortChoice
    ?? (hasNaturalOrder(categoryOrder, categoryColumn) ? 'category' : 'value-desc');

  const lollipopData = useMemo(() => {
    const inOrder = [...unsortedData].sort(byCategoryOrder(categoryOrder, d => d.category));
    if (sortMode === 'value-desc') return inOrder.sort((a, b) => b.value - a.value);
    if (sortMode === 'value-asc') return inOrder.sort((a, b) => a.value - b.value);
    return inOrder;
  }, [unsortedData, categoryOrder, sortMode]);

  // Categories available for the highlight selector
  const categoryOptions = categoryOrder;

  // A highlight left over from a previous category variable or dataset matches
  // no category, which turned every dot grey while the selector read "None".
  // Derive the effective value rather than syncing state in an effect.
  const activeHighlight = categoryOptions.includes(highlightCat) ? highlightCat : '';

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;
    const columns = [
      { header: categoryCol ? colLabel(categoryCol) : 'Category', key: 'category' },
      // In count+percent mode lollipopData overwrites value with a share of records,
      // so the header must not claim 'Count'.
      {
        header: valueMode === 'numeric' && numericCol
          ? statistic
          : (valueFormat === 'percent' ? 'Percent of records' : 'Count'),
        key: 'value',
      },
      { header: 'Records', key: 'n' },
    ];
    const rows = lollipopData.map(d => ({
      category: d.category,
      value: d.value,
      n: d.n,
    }));
    return {
      title,
      subtitle: subtitle || undefined,
      source: source || undefined,
      columns,
      rows,
    };
  }, [lollipopData, title, subtitle, source, dataset, categoryCol, valueMode, numericCol, valueFormat, statistic]);

  // Generate SVG
  const svgContent = useMemo(() => {
    if (lollipopData.length === 0) return '';

    const dims = getDefaultDimensions('lollipop');
    const { width } = dims;

    // Wrap category labels (max 2 lines) and widen the left margin to fit the longest line
    const wrappedLabels = lollipopData.map(d => wrapCategoryLabel(d.category));
    const maxLabelChars = wrappedLabels.reduce((m, lines) => Math.max(m, ...lines.map(l => l.length)), 0);
    const margin = { left: Math.min(260, Math.max(60, Math.ceil(maxLabelChars * 6.8) + 16)), right: dims.margin.right };

    // Fit rows within the default plot height (capped at 28px per row, floor 12px;
    // the SVG grows only if rows would drop below the floor)
    const defaultPlotH = dims.height - dims.margin.top - dims.margin.bottom;
    const rowHeight = Math.max(Math.min(defaultPlotH / lollipopData.length, 28), 12);
    const actualPlotH = rowHeight * lollipopData.length;
    const plotW = width - margin.left - margin.right;

    const header = svgHeader(width, title, subtitle || undefined);
    const plotTop = header.bottom + 14;
    const axisY = plotTop + actualPlotH;

    // The value axis runs through zero and covers the data and the reference
    // line on both sides of it. It used to assume positive values, so negative
    // means were drawn off the left edge of the canvas, and a negative
    // reference line across the category names.
    const values = lollipopData.map(d => d.value);
    const isRecordCount = valueMode === 'count' && valueFormat !== 'percent';
    const scale = niceScale(
      Math.min(...values, referenceValue ?? 0),
      Math.max(...values, referenceValue ?? 0),
      { integer: isRecordCount }
    );
    const suffix = valueFormat === 'percent' ? '%' : '';
    const decimals = isRecordCount ? 0 : valueMode === 'count' ? 1 : decimalsForValues(values);

    const xScale = (v: number) => margin.left + ((v - scale.min) / (scale.max - scale.min)) * plotW;
    const yScale = (i: number) => plotTop + (i + 0.5) * rowHeight;
    const zeroX = xScale(0);

    const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;

    // Single scheme color; highlight mode uses an accent against muted gray
    const schemeColor = getChartColor(0, colorScheme);
    const HIGHLIGHT_COLOR = '#E57A3A';
    const MUTED_COLOR = '#D1D5DB';

    let svg = header.svg;

    // Vertical gridlines and tick labels
    for (const tick of scale.ticks) {
      const x = xScale(tick);
      svg += svgGridLine(x, plotTop, x, axisY);
      svg += svgText(x, axisY + 18, formatTick(tick, scale, locale, suffix), {
        anchor: 'middle', fontSize: 11, fill: '#666',
      });
    }

    // Zero baseline the sticks grow from
    svg += svgAxisLine(zeroX, plotTop, zeroX, axisY);

    // Bottom axis line
    svg += svgAxisLine(margin.left, axisY, margin.left + plotW, axisY);

    // Reference line
    if (referenceValue !== null) {
      const refX = xScale(referenceValue);
      svg += `<line x1="${refX}" y1="${plotTop}" x2="${refX}" y2="${axisY}" stroke="#6B7280" stroke-width="1.5" stroke-dasharray="5,4"/>`;
      if (referenceLabel) {
        const onRight = refX < margin.left + plotW * 0.7;
        svg += svgText(refX + (onRight ? 4 : -4), plotTop - 5, referenceLabel, { anchor: onRight ? 'start' : 'end', fontSize: 10, fill: '#555' });
      }
    }

    // Draw lollipops
    const dotRadius = 6;
    for (let i = 0; i < lollipopData.length; i++) {
      const point = lollipopData[i];
      const y = yScale(i);
      const xEnd = xScale(point.value);
      const color = activeHighlight
        ? (point.category === activeHighlight ? HIGHLIGHT_COLOR : MUTED_COLOR)
        : schemeColor;

      // Category label on the left (wrapped to at most 2 lines)
      const lines = wrappedLabels[i];
      if (lines.length === 1 || rowHeight < 24) {
        svg += svgText(margin.left - 8, y, fitText(point.category, margin.left - 14, 11), { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
      } else {
        svg += svgText(margin.left - 8, y - 7, lines[0], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
        svg += svgText(margin.left - 8, y + 7, lines[1], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
      }

      // Stick (thin line from the zero line to the dot)
      svg += `<line x1="${zeroX}" y1="${y}" x2="${xEnd}" y2="${y}" stroke="${color}" stroke-width="2" stroke-opacity="0.7"/>`;

      // Dot at the end (hollow when the small-count flag applies)
      const hollow = flagSmallCounts && point.n < 20;
      svg += hollow
        ? `<circle cx="${xEnd}" cy="${y}" r="${dotRadius}" fill="white" stroke="${color}" stroke-width="1.5"/>`
        : `<circle cx="${xEnd}" cy="${y}" r="${dotRadius}" fill="${color}"/>`;

      // Value label past the dot, away from the zero line
      if (showLabels) {
        const outward = point.value >= 0 ? 1 : -1;
        svg += svgText(xEnd + outward * (dotRadius + 4), y, `${formatFixed(point.value, decimals, locale)}${suffix}`, {
          anchor: outward === 1 ? 'start' : 'end', fontSize: 10, fill: '#444', dy: '0.35em',
        });
      }
    }

    // Bottom area: axis title, then footnotes and the source line
    let cursorY = axisY + 24;
    if (axisTitle) {
      cursorY += 14;
      svg += svgText(margin.left + plotW / 2, cursorY, fitText(axisTitle, plotW + margin.right, 12), { fontSize: 12, fill: '#444' });
    }

    const footnotes: string[] = [];
    if (valueMode === 'count') {
      footnotes.push(valueFormat === 'percent'
        ? `Values show the percent of the ${recordCount(included)} with ${colLabel(categoryCol)} recorded.`
        : `Values show the number of records per ${colLabel(categoryCol)}.`);
    } else {
      footnotes.push(`Values show the ${aggregation} of ${colLabel(numericCol)} per ${colLabel(categoryCol)}.`);
    }
    if (flagSmallCounts && lollipopData.some(d => d.n < 20)) {
      footnotes.push('Hollow dots indicate categories based on fewer than 20 records. Interpret with caution.');
    }
    if (excluded > 0) {
      footnotes.push(`${recordCount(excluded)} excluded due to missing values.`);
    }
    if (filterNote) footnotes.push(filterNote);

    const footer = svgFooter(width, cursorY + 4, footnotes, source || undefined);
    return svgWrapper(width, footer.height, svg + footer.svg);
  }, [lollipopData, excluded, included, showLabels, flagSmallCounts, colorScheme, activeHighlight, valueFormat, referenceValue, referenceLabel, axisTitle, title, subtitle, source, valueMode, categoryCol, numericCol, aggregation, dataset, locale, filterNote]);

  return (
    <div className={CHART_ROW_CLASS}>
      {/* Config panel */}
      <div className={SETTINGS_COLUMN_CLASS}>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          <VariableMapper
            label="Category"
            description="Categorical variable for each row"
            columns={catColumns}
            value={categoryCol}
            onChange={setCategoryColChoice}
            required
          />

          {/* Value mode */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setValueMode('count')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  valueMode === 'count'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Count
              </button>
              <button
                onClick={() => setValueMode('numeric')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  valueMode === 'numeric'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Numeric Column
              </button>
            </div>
          </div>

          {valueMode === 'count' && countColumn && (
            <AggregatedDataHint
              countLabel={countColumn.label}
              onUseCounts={() => { setValueMode('numeric'); setNumericColChoice(countColumn.key); setAggregation('sum'); }}
            />
          )}

          {valueMode === 'numeric' && (
            <VariableMapper
              label="Value Column"
              description="Numeric column aggregated per category"
              columns={dataset.columns}
              value={numericCol}
              onChange={setNumericColChoice}
              filterTypes={['number']}
              required
            />
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Options</h4>

          {/* Sort mode */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={sortMode}
              onChange={e => setSortChoice(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="value-desc">Value (high to low)</option>
              <option value="value-asc">Value (low to high)</option>
              <option value="category">Category order</option>
            </select>
          </div>

          {valueMode === 'numeric' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Aggregation</label>
              <select
                value={aggregation}
                onChange={e => setAggregation(e.target.value as Aggregation)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="mean">Mean</option>
                <option value="sum">Sum</option>
                <option value="median">Median</option>
              </select>
            </div>
          )}

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Value Format</label>
            <select
              value={valueFormat}
              onChange={e => setValueFormat(e.target.value as ValueFormat)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="number">Number</option>
              <option value="percent">Percent</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Highlight category</label>
            <select
              value={activeHighlight}
              onChange={e => setHighlightCat(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">None</option>
              {categoryOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Color scheme */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
            <select
              value={colorScheme}
              onChange={e => setColorScheme(e.target.value as ChartColorScheme)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="evergreen">Evergreen</option>
              <option value="colorblind">Colorblind-safe</option>
              <option value="grayscale">Grayscale</option>
              <option value="blue">Blue</option>
              <option value="warm">Warm</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference line (optional)</label>
            <input
              type="number"
              value={referenceLine}
              onChange={e => setReferenceLine(e.target.value)}
              placeholder="No reference line"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference label</label>
            <input
              type="text"
              value={referenceLabel}
              onChange={e => setReferenceLabel(e.target.value)}
              placeholder="e.g. National average"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={e => setShowLabels(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show value labels
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={flagSmallCounts}
              onChange={e => setFlagSmallCounts(e.target.checked)}
              className="rounded border-gray-300"
            />
            Flag small counts (n &lt; 20)
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Annotations</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitleOverride(e.target.value)}
              placeholder="Chart title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
            <input
              type="text"
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder="Optional subtitle"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Axis Title</label>
            <input
              type="text"
              value={axisTitle}
              onChange={e => {
                setAxisTitleOverride(e.target.value);
              }}
              placeholder="Defaults to the value being plotted"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="Data source"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className={CHART_COLUMN_CLASS}>
        {svgContent ? (
          <ChartContainer
            title={title}
            svgContent={svgContent}
            excelData={excelData}
            filename="lollipop-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-500 text-sm">
              Select a category variable to generate the lollipop chart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
