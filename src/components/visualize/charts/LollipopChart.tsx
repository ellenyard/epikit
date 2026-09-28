import { useState, useMemo, useEffect } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgAxisLine,
  svgGridLine,
  type ExcelExportData,
} from '../../../utils/chartExport';
import { getChartColor, type ChartColorScheme } from '../../../utils/chartColors';

interface LollipopChartProps {
  dataset: Dataset;
}

/** Floor for the fitted canvas so a one- or two-row chart is not absurdly short. */
const MIN_CHART_HEIGHT = 240;

type ValueMode = 'count' | 'numeric';
type SortMode = 'value-desc' | 'value-asc' | 'alpha';
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
}

/** Format a numeric value for tick and value labels. */
function formatValue(val: number, format: ValueFormat, abbreviate = false): string {
  let base: string;
  if (abbreviate && Math.abs(val) >= 1000) base = `${(val / 1000).toFixed(1)}k`;
  else base = Number.isInteger(val) ? String(val) : val.toFixed(1);
  return format === 'percent' ? `${base}%` : base;
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

export function LollipopChart({ dataset }: LollipopChartProps) {
  const [categoryCol, setCategoryCol] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [numericCol, setNumericCol] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('value-desc');
  const [aggregation, setAggregation] = useState<Aggregation>('mean');
  const [valueFormat, setValueFormat] = useState<ValueFormat>('number');
  const [highlightCat, setHighlightCat] = useState('');
  const [flagSmallCounts, setFlagSmallCounts] = useState(true);
  const [referenceLine, setReferenceLine] = useState('');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [axisTitle, setAxisTitle] = useState('');
  const [axisTitleEdited, setAxisTitleEdited] = useState(false);
  const [source, setSource] = useState('');

  // Pre-select sensible defaults so a chart renders immediately on dataset load or change.
  // Prefer a categorical column with 3-30 distinct values (a true grouping variable like
  // Case Status) over ID-like text columns and two-value columns like Sex.
  useEffect(() => {
    const catValid = categoryCol !== '' && dataset.columns.some(c => c.key === categoryCol);
    if (!catValid) {
      const distinct = (key: string) =>
        new Set(dataset.records.map(r => String(r[key] ?? '')).filter(v => v !== '')).size;
      const cats = dataset.columns.filter(c => c.type === 'categorical');
      const ideal = cats.find(c => { const n = distinct(c.key); return n >= 3 && n <= 30; });
      const fallback = cats.find(c => { const n = distinct(c.key); return n >= 2 && n <= 30; })
        ?? dataset.columns.find(c => c.type === 'text' || c.type === 'categorical');
      const chosen = ideal ?? fallback;
      if (chosen) setCategoryCol(chosen.key);
    }
    const numValid = numericCol !== '' && dataset.columns.some(c => c.key === numericCol && c.type === 'number');
    if (!numValid) {
      const firstNum = dataset.columns.find(c => c.type === 'number');
      if (firstNum) setNumericCol(firstNum.key);
    }
  }, [dataset, categoryCol, numericCol]);

  // Auto-fill the axis title from the numeric column label and format (or count mode wording) until manually edited
  useEffect(() => {
    if (axisTitleEdited) return;
    if (valueFormat === 'percent') {
      setAxisTitle(valueMode === 'count' ? 'Percent of records' : 'Percent');
    } else if (valueMode === 'count') {
      setAxisTitle('Number of records');
    } else {
      const label = dataset.columns.find(c => c.key === numericCol)?.label;
      setAxisTitle(label || '');
    }
  }, [valueMode, numericCol, valueFormat, axisTitleEdited, dataset]);

  const referenceValue = useMemo(() => {
    if (referenceLine.trim() === '') return null;
    const v = Number(referenceLine);
    return isNaN(v) ? null : v;
  }, [referenceLine]);

  // Build lollipop data
  const { points: lollipopData, excluded } = useMemo((): LollipopData => {
    if (!categoryCol) return { points: [], excluded: 0 };

    let points: LollipopDataPoint[];
    let excluded = 0;

    if (valueMode === 'count') {
      const counts = new Map<string, number>();
      for (const record of dataset.records) {
        const cat = record[categoryCol];
        if (cat === null || cat === undefined || cat === '') {
          excluded++;
          continue;
        }
        const key = String(cat);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      points = Array.from(counts.entries()).map(([category, count]) => ({
        category,
        value: count,
        n: count,
      }));

      // In count mode with percent format, plot each category's share of the included records
      if (valueFormat === 'percent') {
        const total = points.reduce((s, p) => s + p.n, 0);
        if (total > 0) {
          for (const p of points) p.value = (p.n / total) * 100;
        }
      }
    } else {
      if (!numericCol) return { points: [], excluded: 0 };
      const grouped = new Map<string, number[]>();

      for (const record of dataset.records) {
        const cat = record[categoryCol];
        const raw = record[numericCol];
        const num = raw !== null && raw !== undefined && raw !== '' ? Number(raw) : NaN;
        if (cat === null || cat === undefined || cat === '' || isNaN(num)) {
          excluded++;
          continue;
        }
        const key = String(cat);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(num);
      }

      const aggregate = (values: number[]): number => {
        switch (aggregation) {
          case 'sum':
            return values.reduce((a, b) => a + b, 0);
          case 'median': {
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
          }
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

    // Sort
    if (sortMode === 'value-desc') {
      points.sort((a, b) => b.value - a.value);
    } else if (sortMode === 'value-asc') {
      points.sort((a, b) => a.value - b.value);
    } else {
      points.sort((a, b) => a.category.localeCompare(b.category));
    }

    return { points, excluded };
  }, [categoryCol, valueMode, numericCol, aggregation, valueFormat, sortMode, dataset.records]);

  // Categories available for the highlight selector (alphabetical)
  const categoryOptions = useMemo(
    () => [...new Set(lollipopData.map(p => p.category))].sort((a, b) => a.localeCompare(b)),
    [lollipopData]
  );

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;
    const columns = [
      { header: categoryCol ? colLabel(categoryCol) : 'Category', key: 'category' },
      // In count+percent mode lollipopData overwrites value with a share of records,
      // so the header must not claim 'Count'.
      {
        header: valueMode === 'numeric' && numericCol
          ? colLabel(numericCol)
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
  }, [lollipopData, title, subtitle, source, dataset, categoryCol, valueMode, numericCol, valueFormat]);

  // Generate SVG
  const svgContent = useMemo(() => {
    if (lollipopData.length === 0) return '';

    const dims = getDefaultDimensions('lollipop');
    const { width } = dims;

    // Wrap category labels (max 2 lines) and widen the left margin to fit the longest line
    const wrappedLabels = lollipopData.map(d => wrapCategoryLabel(d.category));
    const maxLabelChars = wrappedLabels.reduce((m, lines) => Math.max(m, ...lines.map(l => l.length)), 0);
    const margin = { ...dims.margin, left: Math.min(260, Math.max(60, Math.ceil(maxLabelChars * 6.8) + 16)) };

    // Fit rows within the default plot height (capped at 28px per row, floor 12px;
    // the SVG grows only if rows would drop below the floor)
    const defaultPlotH = dims.height - dims.margin.top - dims.margin.bottom;
    const rowHeight = Math.max(Math.min(defaultPlotH / lollipopData.length, 28), 12);
    const actualPlotH = rowHeight * lollipopData.length;
    // Fit the canvas to the rows actually drawn. Flooring at dims.height stranded short
    // charts in the top third of a 500px canvas with the source line orphaned at the bottom.
    const baseHeight = Math.max(
      MIN_CHART_HEIGHT,
      actualPlotH + dims.margin.top + dims.margin.bottom
    );
    const plotW = width - margin.left - margin.right;
    const axisY = margin.top + actualPlotH;

    // Value scale from a zero baseline; extend the nice max to cover the reference line
    const maxVal = Math.max(...lollipopData.map(d => d.value));
    const niceMax = getNiceMax(Math.max(maxVal, referenceValue ?? 0));

    const xScale = (v: number) => margin.left + (v / niceMax) * plotW;
    const yScale = (i: number) => margin.top + (i + 0.5) * rowHeight;

    const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;

    // Single scheme color; highlight mode uses an accent against muted gray
    const schemeColor = getChartColor(0, colorScheme);
    const HIGHLIGHT_COLOR = '#E57A3A';
    const MUTED_COLOR = '#D1D5DB';

    let svg = '';

    // Title
    if (title) {
      svg += svgTitle(width, title, subtitle || undefined);
    }

    // Vertical gridlines
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const tickVal = (niceMax / tickCount) * i;
      const x = xScale(tickVal);
      svg += svgGridLine(x, margin.top, x, axisY);
      // Tick labels on bottom
      svg += svgText(x, axisY + 18, formatValue(tickVal, valueFormat, true), {
        anchor: 'middle', fontSize: 11, fill: '#888',
      });
    }

    // Y-axis line (zero baseline the sticks grow from)
    svg += svgAxisLine(margin.left, margin.top, margin.left, axisY);

    // Bottom axis line
    svg += svgAxisLine(margin.left, axisY, margin.left + plotW, axisY);

    // Reference line
    if (referenceValue !== null) {
      const refX = xScale(referenceValue);
      svg += `<line x1="${refX}" y1="${margin.top}" x2="${refX}" y2="${axisY}" stroke="#9CA3AF" stroke-width="1.5" stroke-dasharray="5,4"/>`;
      if (referenceLabel) {
        svg += svgText(refX + 4, margin.top + 4, referenceLabel, { anchor: 'start', fontSize: 10, fill: '#777', dy: '0.35em' });
      }
    }

    // Draw lollipops
    const dotRadius = 6;
    for (let i = 0; i < lollipopData.length; i++) {
      const point = lollipopData[i];
      const y = yScale(i);
      const xEnd = xScale(point.value);
      const color = highlightCat
        ? (point.category === highlightCat ? HIGHLIGHT_COLOR : MUTED_COLOR)
        : schemeColor;

      // Category label on the left (wrapped to at most 2 lines)
      const lines = wrappedLabels[i];
      if (lines.length === 1) {
        svg += svgText(margin.left - 8, y, lines[0], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
      } else {
        svg += svgText(margin.left - 8, y - 7, lines[0], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
        svg += svgText(margin.left - 8, y + 7, lines[1], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
      }

      // Stick (thin line from axis to dot)
      svg += `<line x1="${margin.left}" y1="${y}" x2="${xEnd}" y2="${y}" stroke="${color}" stroke-width="2" stroke-opacity="0.7"/>`;

      // Dot at the end (hollow when the small-count flag applies)
      const hollow = flagSmallCounts && point.n < 20;
      svg += hollow
        ? `<circle cx="${xEnd}" cy="${y}" r="${dotRadius}" fill="white" stroke="${color}" stroke-width="1.5"/>`
        : `<circle cx="${xEnd}" cy="${y}" r="${dotRadius}" fill="${color}"/>`;

      // Value label next to dot
      if (showLabels) {
        svg += svgText(xEnd + dotRadius + 4, y, formatValue(point.value, valueFormat), {
          anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em',
        });
      }
    }

    // Bottom area: axis title, then footnotes stacked at the bottom left, then the source line
    let cursorY = axisY + 34;
    if (axisTitle) {
      svg += svgText(margin.left + plotW / 2, cursorY, axisTitle, { fontSize: 12, fill: '#444' });
      cursorY += 4;
    }

    const footnotes: string[] = [];
    if (valueMode === 'count') {
      footnotes.push(valueFormat === 'percent'
        ? `Values show the percent of records per ${colLabel(categoryCol)}.`
        : `Values show the number of records per ${colLabel(categoryCol)}.`);
    } else {
      footnotes.push(`Values show the ${aggregation} of ${colLabel(numericCol)} per ${colLabel(categoryCol)}.`);
    }
    if (flagSmallCounts && lollipopData.some(d => d.n < 20)) {
      footnotes.push('Hollow dots indicate categories based on fewer than 20 records. Interpret with caution.');
    }
    if (excluded > 0) {
      footnotes.push(`${excluded} record${excluded === 1 ? '' : 's'} excluded due to missing values.`);
    }
    for (const note of footnotes) {
      cursorY += 14;
      svg += svgText(10, cursorY, note, { anchor: 'start', fontSize: 10, fill: '#999' });
    }

    const height = Math.max(cursorY + 18, baseHeight);

    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [lollipopData, excluded, showLabels, flagSmallCounts, colorScheme, highlightCat, valueFormat, referenceValue, referenceLabel, axisTitle, title, subtitle, source, valueMode, categoryCol, numericCol, aggregation, dataset]);

  const displayTitle = title || 'Lollipop Chart';

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          <VariableMapper
            label="Category"
            description="Categorical variable for each row"
            columns={dataset.columns}
            value={categoryCol}
            onChange={setCategoryCol}
            filterTypes={['text', 'categorical']}
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

          {valueMode === 'numeric' && (
            <VariableMapper
              label="Value Column"
              description="Numeric column aggregated per category"
              columns={dataset.columns}
              value={numericCol}
              onChange={setNumericCol}
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
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="value-desc">Value (high to low)</option>
              <option value="value-asc">Value (low to high)</option>
              <option value="alpha">Alphabetical</option>
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
              value={highlightCat}
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
              onChange={e => setTitle(e.target.value)}
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
                setAxisTitle(e.target.value);
                setAxisTitleEdited(true);
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
      <div className="flex-1 min-w-0">
        {svgContent ? (
          <ChartContainer
            title={displayTitle}
            subtitle={subtitle || undefined}
            source={source || undefined}
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

/** Compute a "nice" maximum for axis scaling */
function getNiceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}
