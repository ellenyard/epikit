import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { FacetWrapper, FacetControl } from '../shared/FacetWrapper';
import { getChartColors, type ChartColorScheme } from '../../../utils/chartColors';
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

interface DotPlotProps {
  dataset: Dataset;
}

type SortMode = 'value' | 'alphabetical';
type ValueFormat = 'number' | 'percent';
type Aggregation = 'mean' | 'sum' | 'count' | 'median';

interface DotPlotRow {
  category: string;
  val1: number;
  n: number;
}

interface DotPlotRows {
  rows: DotPlotRow[];
  excluded: number;
}

interface DotSvgOptions {
  rows: DotPlotRow[];
  excluded: number;
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
}

/** Format a numeric value for tick and dot labels. */
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

/** Generate SVG for dot plot from rows. */
function generateDotSvg(opts: DotSvgOptions): string {
  const {
    rows,
    excluded,
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
  } = opts;
  if (rows.length === 0) return '';

  const dims = getDefaultDimensions('dot');
  const { width } = dims;

  // Wrap category labels (max 2 lines) and widen the left margin to fit the longest line
  const wrappedLabels = rows.map(r => wrapCategoryLabel(r.category));
  const maxLabelChars = wrappedLabels.reduce((m, lines) => Math.max(m, ...lines.map(l => l.length)), 0);
  const margin = { ...dims.margin, left: Math.min(260, Math.max(60, Math.ceil(maxLabelChars * 6.8) + 16)) };

  const plotW = width - margin.left - margin.right;
  const plotH = dims.height - margin.top - margin.bottom;

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const r of rows) {
    if (r.val1 < minVal) minVal = r.val1;
    if (r.val1 > maxVal) maxVal = r.val1;
  }
  if (referenceValue !== null) {
    if (referenceValue < minVal) minVal = referenceValue;
    if (referenceValue > maxVal) maxVal = referenceValue;
  }

  const range = maxVal - minVal || 1;
  // Only clamp the domain floor to 0 when all values are non-negative
  const paddedMin = minVal >= 0 ? Math.max(0, minVal - range * 0.05) : minVal - range * 0.05;
  const paddedMax = maxVal + range * 0.1;
  const valRange = paddedMax - paddedMin || 1;

  const colors = getChartColors(1, colorScheme);
  const dotRadius = 5;
  const rowHeight = Math.min(plotH / rows.length, 30);
  const actualPlotH = rowHeight * rows.length;
  const axisY = margin.top + actualPlotH;

  const xScale = (val: number) => margin.left + ((val - paddedMin) / valRange) * plotW;
  const yScale = (i: number) => margin.top + i * rowHeight + rowHeight / 2;

  const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;

  let svg = '';

  svg += svgTitle(width, title, subtitle || undefined);

  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const val = paddedMin + (valRange * i) / tickCount;
    const x = xScale(val);
    svg += svgGridLine(x, margin.top, x, axisY);
    svg += svgText(x, axisY + 18, formatValue(val, valueFormat, true), { fontSize: 10, fill: '#666' });
  }

  svg += svgAxisLine(margin.left, axisY, margin.left + plotW, axisY);

  if (referenceValue !== null) {
    const refX = xScale(referenceValue);
    svg += `<line x1="${refX}" y1="${margin.top}" x2="${refX}" y2="${axisY}" stroke="#9CA3AF" stroke-width="1.5" stroke-dasharray="5,4"/>`;
    if (referenceLabel) {
      svg += svgText(refX + 4, margin.top + 4, referenceLabel, { anchor: 'start', fontSize: 10, fill: '#777', dy: '0.35em' });
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cy = yScale(i);

    const lines = wrappedLabels[i];
    if (lines.length === 1) {
      svg += svgText(margin.left - 8, cy, lines[0], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
    } else {
      svg += svgText(margin.left - 8, cy - 7, lines[0], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
      svg += svgText(margin.left - 8, cy + 7, lines[1], { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });
    }

    svg += `<line x1="${margin.left}" y1="${cy}" x2="${margin.left + plotW}" y2="${cy}" stroke="#E5E7EB" stroke-width="1"/>`;

    const hollow = flagSmallCounts && row.n < 20;
    const dot1X = xScale(row.val1);

    svg += hollow
      ? `<circle cx="${dot1X}" cy="${cy}" r="${dotRadius}" fill="white" stroke="${colors[0]}" stroke-width="1.5"/>`
      : `<circle cx="${dot1X}" cy="${cy}" r="${dotRadius}" fill="${colors[0]}" stroke="white" stroke-width="1"/>`;

    if (showLabels) {
      const labelVal1 = formatValue(row.val1, valueFormat);
      svg += svgText(dot1X + dotRadius + 4, cy, labelVal1, { anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em' });
    }
  }

  // Bottom area: axis title, then footnotes stacked at the bottom left, then the source line
  let cursorY = axisY + 34;
  if (axisTitle) {
    svg += svgText(margin.left + plotW / 2, cursorY, axisTitle, { fontSize: 12, fill: '#444' });
    cursorY += 4;
  }

  const footnotes: string[] = [];
  if (aggregation === 'count') {
    footnotes.push(valueFormat === 'percent'
      ? `Values show the percent of records per ${colLabel(categoryCol)}.`
      : `Values show the number of records per ${colLabel(categoryCol)}.`);
  } else {
    footnotes.push(`Values show the ${aggregation} of ${colLabel(valueCol)} per ${colLabel(categoryCol)}.`);
  }
  if (flagSmallCounts && rows.some(r => r.n < 20)) {
    footnotes.push('Hollow dots indicate categories based on fewer than 20 records. Interpret with caution.');
  }
  if (excluded > 0) {
    footnotes.push(`${excluded} record${excluded === 1 ? '' : 's'} excluded due to missing values.`);
  }
  for (const note of footnotes) {
    cursorY += 14;
    svg += svgText(10, cursorY, note, { anchor: 'start', fontSize: 10, fill: '#999' });
  }

  const adjustedHeight = Math.max(cursorY + 18, margin.top + actualPlotH + margin.bottom);

  if (source) {
    svg += svgSource(width, adjustedHeight, source);
  }

  return svgWrapper(width, adjustedHeight, svg);
}

export function DotPlot({ dataset }: DotPlotProps) {
  const [categoryCol, setCategoryCol] = useState('');
  const [valueCol, setValueCol] = useState('');
  const [facetCol, setFacetCol] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('value');
  const [aggregation, setAggregation] = useState<Aggregation>('mean');
  const [valueFormat, setValueFormat] = useState<ValueFormat>('number');
  const [flagSmallCounts, setFlagSmallCounts] = useState(true);
  const [referenceLine, setReferenceLine] = useState('');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  const [title, setTitle] = useState('Dot Plot');
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
    const valValid = valueCol !== '' && dataset.columns.some(c => c.key === valueCol && c.type === 'number');
    if (!valValid) {
      const firstNum = dataset.columns.find(c => c.type === 'number');
      if (firstNum) setValueCol(firstNum.key);
    }
  }, [dataset, categoryCol, valueCol]);

  // Auto-fill the axis title from the Value column label and format until the user edits it manually
  useEffect(() => {
    if (axisTitleEdited) return;
    if (valueFormat === 'percent') {
      setAxisTitle(aggregation === 'count' ? 'Percent of records' : 'Percent');
    } else if (aggregation === 'count') {
      setAxisTitle('Number of records');
    } else {
      const label = dataset.columns.find(c => c.key === valueCol)?.label;
      setAxisTitle(label || '');
    }
  }, [valueCol, valueFormat, aggregation, axisTitleEdited, dataset]);

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
    if (!categoryCol) return { rows: [], excluded: 0 };
    if (!countMode && !valueCol) return { rows: [], excluded: 0 };

    const categoryMap = new Map<string, { values1: number[] }>();
    let excluded = 0;

    for (const rec of records) {
      const cat = rec[categoryCol];
      if (cat === null || cat === undefined || cat === '') {
        excluded++;
        continue;
      }
      let v1 = 0;
      if (!countMode) {
        const raw1 = rec[valueCol];
        v1 = raw1 !== null && raw1 !== undefined && raw1 !== '' ? Number(raw1) : NaN;
        if (isNaN(v1)) {
          excluded++;
          continue;
        }
      }
      const catStr = String(cat);
      if (!categoryMap.has(catStr)) {
        categoryMap.set(catStr, { values1: [] });
      }
      const entry = categoryMap.get(catStr)!;
      entry.values1.push(v1);
    }

    const aggregate = (values: number[]): number => {
      switch (aggregation) {
        case 'sum':
          return values.reduce((a, b) => a + b, 0);
        case 'count':
          return values.length;
        case 'median': {
          const sorted = [...values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        }
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
    if (aggregation === 'count' && valueFormat === 'percent') {
      const total = computedRows.reduce((s, r) => s + r.n, 0);
      if (total > 0) {
        for (const r of computedRows) r.val1 = (r.n / total) * 100;
      }
    }

    if (sortMode === 'value') {
      computedRows.sort((a, b) => b.val1 - a.val1);
    } else {
      computedRows.sort((a, b) => a.category.localeCompare(b.category));
    }

    return { rows: computedRows, excluded };
  }, [categoryCol, valueCol, aggregation, valueFormat, sortMode]);

  const { rows, excluded } = useMemo(() => computeRows(dataset.records), [computeRows, dataset.records]);

  const svgOptions = useMemo((): DotSvgOptions => ({
    rows,
    excluded,
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
  }), [rows, excluded, categoryCol, valueCol, colorScheme, showLabels, title, subtitle, source, axisTitle, valueFormat, aggregation, flagSmallCounts, referenceValue, referenceLabel, dataset]);

  const svgContent = useMemo(() => generateDotSvg(svgOptions), [svgOptions]);

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
          : (valueCol ? colLabel(valueCol) : 'Value'),
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
  }, [rows, title, subtitle, source, dataset, categoryCol, valueCol, aggregation, valueFormat]);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          <VariableMapper
            label="Category"
            description="Groups shown on the y-axis"
            columns={dataset.columns}
            value={categoryCol}
            onChange={setCategoryCol}
            filterTypes={['text', 'categorical']}
            required
          />

          <VariableMapper
            label="Value"
            description="Numeric column plotted as dots"
            columns={dataset.columns}
            value={valueCol}
            onChange={setValueCol}
            filterTypes={['number']}
            required
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Options</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="value">By value (descending)</option>
              <option value="alphabetical">Alphabetical</option>
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
            columns={dataset.columns}
            value={facetCol}
            onChange={setFacetCol}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Annotations</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
                setAxisTitle(e.target.value);
                setAxisTitleEdited(true);
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
              renderChart={(fd) => {
                const facet = computeRows(fd.records);
                if (facet.rows.length === 0) {
                  return <div className="text-gray-400 text-xs p-2">No data</div>;
                }
                const facetSvg = generateDotSvg({ ...svgOptions, rows: facet.rows, excluded: facet.excluded, title: '', subtitle: '', source: '' });
                return <div dangerouslySetInnerHTML={{ __html: facetSvg }} />;
              }}
            />
          ) : (
            <ChartContainer
              title={title}
              subtitle={subtitle}
              source={source}
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
