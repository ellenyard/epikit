import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Dataset, DataColumn } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { FacetWrapper, FacetControl } from '../shared/FacetWrapper';
import { getChartColor } from '../../../utils/chartColors';
import type { ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgGridLine,
  type ExcelExportData,
} from '../../../utils/chartExport';

interface BarChartProps {
  dataset: Dataset;
}

/** Upper bound on distinct values for a column to be auto-selected as the category axis. */
const MAX_AUTO_CATEGORIES = 30;

type SortMode = 'value' | 'alpha' | 'custom';
type ValueMode = 'count' | 'sum' | 'mean' | 'median';
type ValueFormat = 'number' | 'percent';
type Orientation = 'horizontal' | 'vertical';

interface BarData {
  label: string;
  value: number;
  n: number;
}

interface BarDataResult {
  data: BarData[];
  excluded: number;
}

interface BarSvgOptions {
  sortedData: BarData[];
  excluded: number;
  colorScheme: ChartColorScheme;
  showDataLabels: boolean;
  title: string;
  subtitle: string;
  source: string;
  axisTitle: string;
  valueFormat: ValueFormat;
  valueMode: ValueMode;
  categoryVar: string;
  valueVar: string;
  highlightCat: string;
  flagSmallCounts: boolean;
  referenceValue: number | null;
  referenceLabel: string;
  orientation: Orientation;
  dataset: Dataset;
}

/** Format a numeric value for tick and bar labels. */
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

/** Sort bar data by the selected mode (custom uses the column's valueOrder). */
function sortBarData(data: BarData[], sortMode: SortMode, valueOrder?: string[]): BarData[] {
  const sorted = [...data];

  if (sortMode === 'value') {
    sorted.sort((a, b) => b.value - a.value);
  } else if (sortMode === 'alpha') {
    sorted.sort((a, b) => a.label.localeCompare(b.label));
  } else if (sortMode === 'custom' && valueOrder) {
    const order = valueOrder;
    sorted.sort((a, b) => {
      const ia = order.indexOf(a.label);
      const ib = order.indexOf(b.label);
      // Items not in the order go to the end
      const posA = ia === -1 ? order.length : ia;
      const posB = ib === -1 ? order.length : ib;
      return posA - posB;
    });
  }

  return sorted;
}

/** Bar color for a category: single scheme color, or accent against muted gray when highlighting. */
function barColor(label: string, highlightCat: string, schemeColor: string): string {
  if (!highlightCat) return schemeColor;
  return label === highlightCat ? '#E57A3A' : '#D1D5DB';
}

/** True when a highlight is active and this bar is not the highlighted one. */
function isMutedByHighlight(label: string, highlightCat: string): boolean {
  return !!highlightCat && label !== highlightCat;
}

/**
 * Small-count styling. Stacking fill-opacity on top of the highlight gray renders the bar
 * effectively invisible, so already-muted bars are flagged with a dashed outline instead.
 */
function smallCountAttrs(muted: boolean): string {
  return muted
    ? ' stroke="#6B7280" stroke-width="1" stroke-dasharray="3,2"'
    : ' fill-opacity="0.4"';
}

/** Footnote lines stacked at the bottom left of the chart. */
function buildFootnotes(opts: BarSvgOptions): string[] {
  const { sortedData, excluded, valueMode, valueFormat, categoryVar, valueVar, flagSmallCounts, dataset } = opts;
  const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;

  const footnotes: string[] = [];
  if (valueMode === 'count') {
    footnotes.push(valueFormat === 'percent'
      ? `Values show the percent of records per ${colLabel(categoryVar)}.`
      : `Values show the number of records per ${colLabel(categoryVar)}.`);
  } else {
    footnotes.push(`Values show the ${valueMode} of ${colLabel(valueVar)} per ${colLabel(categoryVar)}.`);
  }
  if (flagSmallCounts && sortedData.some(d => d.n < 20)) {
    // Under an active highlight every other bar is already gray, so "muted" would be ambiguous.
    footnotes.push(opts.highlightCat
      ? 'Outlined bars indicate categories based on fewer than 20 records. Interpret with caution.'
      : 'Muted bars indicate categories based on fewer than 20 records. Interpret with caution.');
  }
  if (excluded > 0) {
    footnotes.push(`${excluded} record${excluded === 1 ? '' : 's'} excluded due to missing values.`);
  }
  return footnotes;
}

/** Generate SVG for a horizontal bar chart from sorted data. */
function generateHorizontalBarSvg(opts: BarSvgOptions): string {
  const {
    sortedData,
    colorScheme,
    showDataLabels,
    title,
    subtitle,
    source,
    axisTitle,
    valueFormat,
    highlightCat,
    flagSmallCounts,
    referenceValue,
    referenceLabel,
  } = opts;

  const dims = getDefaultDimensions('bar');
  const { width } = dims;

  // Wrap category labels (max 2 lines) and widen the left margin to fit the longest line
  const wrappedLabels = sortedData.map(d => wrapCategoryLabel(d.label));
  const maxLabelChars = wrappedLabels.reduce((m, lines) => Math.max(m, ...lines.map(l => l.length)), 0);
  const margin = { ...dims.margin, left: Math.min(260, Math.max(60, Math.ceil(maxLabelChars * 6.8) + 16)) };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = dims.height - margin.top - margin.bottom;

  // Zero baseline; extend the nice max to cover the reference line
  const maxValue = Math.max(...sortedData.map(d => d.value), 0);
  const domainMax = Math.max(maxValue, referenceValue ?? 0);
  const niceMax = domainMax === 0 ? 10 : getNiceMax(domainMax);

  // Fit bars within the default plot height (capped at 40px, floor 6px;
  // the SVG grows only if bars would drop below the floor)
  const barCount = sortedData.length;
  const barGap = 4;
  const fitBarHeight = (plotHeight - barGap * (barCount - 1)) / barCount;
  const barHeight = Math.max(Math.min(fitBarHeight, 40), 6);
  const totalBarsHeight = barCount * barHeight + (barCount - 1) * barGap;
  const baseHeight = Math.max(dims.height, totalBarsHeight + margin.top + margin.bottom + 20);
  const adjustedPlotHeight = baseHeight - margin.top - margin.bottom;
  const axisY = margin.top + adjustedPlotHeight;

  const schemeColor = getChartColor(0, colorScheme);

  let svg = '';

  if (title) {
    svg += svgTitle(width, title, subtitle || undefined);
  }

  const tickCount = 5;
  for (let i = 1; i <= tickCount; i++) {
    const x = margin.left + (i / tickCount) * plotWidth;
    svg += svgGridLine(x, margin.top, x, axisY);
  }

  for (let i = 0; i <= tickCount; i++) {
    const x = margin.left + (i / tickCount) * plotWidth;
    const tickValue = (niceMax * i) / tickCount;
    svg += svgText(x, axisY + 20, formatValue(tickValue, valueFormat, true), {
      anchor: 'middle',
      fontSize: 11,
      fill: '#666',
    });
  }

  // Reference line
  if (referenceValue !== null) {
    const refX = margin.left + (referenceValue / niceMax) * plotWidth;
    svg += `<line x1="${refX}" y1="${margin.top}" x2="${refX}" y2="${axisY}" stroke="#9CA3AF" stroke-width="1.5" stroke-dasharray="5,4"/>`;
    if (referenceLabel) {
      svg += svgText(refX + 4, margin.top + 4, referenceLabel, { anchor: 'start', fontSize: 10, fill: '#777', dy: '0.35em' });
    }
  }

  sortedData.forEach((d, i) => {
    const barY = margin.top + i * (barHeight + barGap);
    const barW = maxValue > 0 ? (d.value / niceMax) * plotWidth : 0;
    const color = barColor(d.label, highlightCat, schemeColor);
    // Small-count bars render muted (highlight wins, but still at reduced opacity)
    const smallCount = flagSmallCounts && d.n < 20;
    const opacity = smallCount ? smallCountAttrs(isMutedByHighlight(d.label, highlightCat)) : '';

    svg += `<rect x="${margin.left}" y="${barY}" width="${Math.max(barW, 0)}" height="${barHeight}" fill="${color}"${opacity} rx="2"/>`;

    // Category label on the left (wrapped to at most 2 lines)
    const labelY = barY + barHeight / 2;
    const lines = wrappedLabels[i];
    if (lines.length === 1) {
      svg += svgText(margin.left - 8, labelY, lines[0], { anchor: 'end', fontSize: 12, fill: '#333', dy: '0.35em' });
    } else {
      svg += svgText(margin.left - 8, labelY - 7, lines[0], { anchor: 'end', fontSize: 12, fill: '#333', dy: '0.35em' });
      svg += svgText(margin.left - 8, labelY + 7, lines[1], { anchor: 'end', fontSize: 12, fill: '#333', dy: '0.35em' });
    }

    if (showDataLabels) {
      const displayValue = formatValue(d.value, valueFormat);
      const labelWidth = displayValue.length * 7 + 8;
      if (barW > labelWidth + 10) {
        svg += svgText(margin.left + barW - 6, labelY, displayValue, {
          anchor: 'end',
          fontSize: 11,
          fontWeight: 'bold',
          fill: '#fff',
          dy: '0.35em',
        });
      } else {
        svg += svgText(margin.left + barW + 6, labelY, displayValue, {
          anchor: 'start',
          fontSize: 11,
          fontWeight: 'bold',
          fill: '#333',
          dy: '0.35em',
        });
      }
    }
  });

  // Bottom area: axis title, then footnotes stacked at the bottom left, then the source line
  let cursorY = axisY + 36;
  if (axisTitle) {
    svg += svgText(margin.left + plotWidth / 2, cursorY, axisTitle, { fontSize: 12, fill: '#444' });
    cursorY += 4;
  }

  for (const note of buildFootnotes(opts)) {
    cursorY += 14;
    svg += svgText(10, cursorY, note, { anchor: 'start', fontSize: 10, fill: '#999' });
  }

  const height = Math.max(cursorY + 18, baseHeight);

  if (source) {
    svg += svgSource(width, height, source);
  }

  return svgWrapper(width, height, svg);
}

/** Generate SVG for a vertical bar chart from sorted data. */
function generateVerticalBarSvg(opts: BarSvgOptions): string {
  const {
    sortedData,
    colorScheme,
    showDataLabels,
    title,
    subtitle,
    source,
    axisTitle,
    valueFormat,
    highlightCat,
    flagSmallCounts,
    referenceValue,
    referenceLabel,
  } = opts;

  const dims = getDefaultDimensions('bar');
  const { width } = dims;

  // Wrap category labels (max 2 lines) and deepen the bottom margin to fit them
  const wrappedLabels = sortedData.map(d => wrapCategoryLabel(d.label));
  const maxLines = wrappedLabels.reduce((m, lines) => Math.max(m, lines.length), 1);
  const margin = { top: dims.margin.top, right: 40, bottom: maxLines > 1 ? 62 : 46, left: 56 };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = dims.height - margin.top - margin.bottom;
  const axisY = margin.top + plotHeight;

  // Zero baseline; extend the nice max to cover the reference line
  const maxValue = Math.max(...sortedData.map(d => d.value), 0);
  const domainMax = Math.max(maxValue, referenceValue ?? 0);
  const niceMax = domainMax === 0 ? 10 : getNiceMax(domainMax);

  const yScale = (v: number) => axisY - (v / niceMax) * plotHeight;

  // Fit bars within the default plot width (capped at 40px wide, floor 6px, gap proportional)
  const barCount = sortedData.length;
  const bandW = plotWidth / barCount;
  const barWidth = Math.max(Math.min(bandW * 0.7, 40), 6);

  const schemeColor = getChartColor(0, colorScheme);

  let svg = '';

  if (title) {
    svg += svgTitle(width, title, subtitle || undefined);
  }

  // Horizontal gridlines and value tick labels on the left
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const tickValue = (niceMax * i) / tickCount;
    const y = yScale(tickValue);
    if (i > 0) {
      svg += svgGridLine(margin.left, y, margin.left + plotWidth, y);
    }
    svg += svgText(margin.left - 6, y, formatValue(tickValue, valueFormat, true), {
      anchor: 'end',
      fontSize: 11,
      fill: '#666',
      dy: '0.35em',
    });
  }

  // Reference line (horizontal across the plot in vertical mode)
  if (referenceValue !== null) {
    const refY = yScale(referenceValue);
    svg += `<line x1="${margin.left}" y1="${refY}" x2="${margin.left + plotWidth}" y2="${refY}" stroke="#9CA3AF" stroke-width="1.5" stroke-dasharray="5,4"/>`;
    if (referenceLabel) {
      svg += svgText(margin.left + 4, refY - 4, referenceLabel, { anchor: 'start', fontSize: 10, fill: '#777' });
    }
  }

  sortedData.forEach((d, i) => {
    const bandX = margin.left + i * bandW;
    const barX = bandX + (bandW - barWidth) / 2;
    const barTop = maxValue > 0 ? yScale(d.value) : axisY;
    const barH = axisY - barTop;
    const color = barColor(d.label, highlightCat, schemeColor);
    // Small-count bars render muted (highlight wins, but still at reduced opacity)
    const smallCount = flagSmallCounts && d.n < 20;
    const opacity = smallCount ? smallCountAttrs(isMutedByHighlight(d.label, highlightCat)) : '';

    svg += `<rect x="${barX}" y="${barTop}" width="${barWidth}" height="${Math.max(barH, 0)}" fill="${color}"${opacity} rx="2"/>`;

    // Category label below the axis, centered under the bar (wrapped to at most 2 lines)
    const cx = bandX + bandW / 2;
    const lines = wrappedLabels[i];
    if (lines.length === 1) {
      svg += svgText(cx, axisY + 16, lines[0], { fontSize: 11, fill: '#333' });
    } else {
      svg += svgText(cx, axisY + 12, lines[0], { fontSize: 11, fill: '#333' });
      svg += svgText(cx, axisY + 25, lines[1], { fontSize: 11, fill: '#333' });
    }

    // Value label centered above the bar
    if (showDataLabels) {
      svg += svgText(cx, barTop - 5, formatValue(d.value, valueFormat), {
        fontSize: 11,
        fontWeight: 'bold',
        fill: '#333',
      });
    }
  });

  // Axis title rotated -90 degrees, centered along the y-axis
  if (axisTitle) {
    svg += svgText(16, margin.top + plotHeight / 2, axisTitle, { fontSize: 12, fill: '#444', rotate: -90 });
  }

  // Bottom area: footnotes stacked at the bottom left, then the source line
  let cursorY = axisY + (maxLines > 1 ? 40 : 30);
  for (const note of buildFootnotes(opts)) {
    cursorY += 14;
    svg += svgText(10, cursorY, note, { anchor: 'start', fontSize: 10, fill: '#999' });
  }

  const height = Math.max(cursorY + 18, dims.height);

  if (source) {
    svg += svgSource(width, height, source);
  }

  return svgWrapper(width, height, svg);
}

/** Generate SVG for bar chart from sorted data. */
function generateBarSvg(opts: BarSvgOptions): string {
  if (opts.sortedData.length === 0) return '';
  return opts.orientation === 'vertical' ? generateVerticalBarSvg(opts) : generateHorizontalBarSvg(opts);
}

export function BarChart({ dataset }: BarChartProps) {
  // Config state
  const [categoryVar, setCategoryVar] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [valueVar, setValueVar] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('value');
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [valueFormat, setValueFormat] = useState<ValueFormat>('number');
  const [highlightCat, setHighlightCat] = useState('');
  const [flagSmallCounts, setFlagSmallCounts] = useState(true);
  const [referenceLine, setReferenceLine] = useState('');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showDataLabels, setShowDataLabels] = useState(true);
  const [facetCol, setFacetCol] = useState('');
  const [chartTitle, setChartTitle] = useState('');
  const [chartSubtitle, setChartSubtitle] = useState('');
  const [axisTitle, setAxisTitle] = useState('');
  const [axisTitleEdited, setAxisTitleEdited] = useState(false);
  const [chartSource, setChartSource] = useState('');

  // Pre-select sensible defaults so a chart renders immediately on dataset load or change.
  // Prefer a categorical column with 3-30 distinct values (a true grouping variable like
  // Case Status) over ID-like text columns and two-value columns like Sex.
  useEffect(() => {
    const catValid = categoryVar !== '' && dataset.columns.some(c => c.key === categoryVar);
    if (!catValid) {
      const distinct = (key: string) =>
        new Set(dataset.records.map(r => String(r[key] ?? '')).filter(v => v !== '')).size;
      const cats = dataset.columns.filter(c => c.type === 'categorical');
      const ideal = cats.find(c => { const n = distinct(c.key); return n >= 3 && n <= 30; });
      // The last-resort fallback must stay cardinality-bounded too. Columns often infer as
      // 'text', and the first text column is typically a record ID: auto-selecting it builds
      // one bar per record and produces an SVG tens of thousands of pixels tall.
      const plottable = (c: DataColumn) => {
        if (c.type !== 'text' && c.type !== 'categorical' && c.type !== 'boolean') return false;
        const n = distinct(c.key);
        return n >= 2 && n <= MAX_AUTO_CATEGORIES;
      };
      const fallback = cats.find(c => { const n = distinct(c.key); return n >= 2 && n <= MAX_AUTO_CATEGORIES; })
        ?? dataset.columns.find(plottable);
      const chosen = ideal ?? fallback;
      // No suitable column: leave categoryVar empty so the picker prompt shows.
      if (chosen) setCategoryVar(chosen.key);
    }
    const numValid = valueVar !== '' && dataset.columns.some(c => c.key === valueVar && c.type === 'number');
    if (!numValid) {
      const firstNum = dataset.columns.find(c => c.type === 'number');
      if (firstNum) setValueVar(firstNum.key);
    }
  }, [dataset, categoryVar, valueVar]);

  // Auto-fill the axis title from the numeric variable label and format (or count mode wording) until manually edited
  useEffect(() => {
    if (axisTitleEdited) return;
    if (valueFormat === 'percent') {
      setAxisTitle(valueMode === 'count' ? 'Percent of records' : 'Percent');
    } else if (valueMode === 'count') {
      setAxisTitle('Number of records');
    } else {
      const label = dataset.columns.find(c => c.key === valueVar)?.label;
      setAxisTitle(label || '');
    }
  }, [valueMode, valueVar, valueFormat, axisTitleEdited, dataset]);

  const referenceValue = useMemo(() => {
    if (referenceLine.trim() === '') return null;
    const v = Number(referenceLine);
    return isNaN(v) ? null : v;
  }, [referenceLine]);

  // Check if selected category column has valueOrder for custom sorting
  const selectedColumn = useMemo(
    () => dataset.columns.find(c => c.key === categoryVar),
    [dataset.columns, categoryVar]
  );
  const hasCustomOrder = !!(selectedColumn?.valueOrder && selectedColumn.valueOrder.length > 0);

  // Shared aggregation for the main chart and facets
  const computeBarData = useCallback((records: Dataset['records']): BarDataResult => {
    if (!categoryVar) return { data: [], excluded: 0 };

    let excluded = 0;

    if (valueMode === 'count') {
      const counts = new Map<string, number>();
      for (const record of records) {
        const cat = record[categoryVar];
        if (cat === null || cat === undefined || cat === '') {
          excluded++;
          continue;
        }
        const key = String(cat);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const data = Array.from(counts.entries()).map(([label, count]) => ({ label, value: count, n: count }));

      // In count mode with percent format, plot each category's share of the included records
      if (valueFormat === 'percent') {
        const total = data.reduce((s, d) => s + d.n, 0);
        if (total > 0) {
          for (const d of data) d.value = (d.n / total) * 100;
        }
      }
      return { data, excluded };
    }

    // Sum, mean, or median of a numeric column grouped by category
    if (!valueVar) return { data: [], excluded: 0 };

    const groups = new Map<string, number[]>();
    for (const record of records) {
      const cat = record[categoryVar];
      const rawVal = record[valueVar];
      const numVal = rawVal !== null && rawVal !== undefined && rawVal !== '' ? Number(rawVal) : NaN;
      if (cat === null || cat === undefined || cat === '' || isNaN(numVal)) {
        excluded++;
        continue;
      }
      const key = String(cat);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(numVal);
    }

    const aggregate = (values: number[]): number => {
      switch (valueMode) {
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

    const data: BarData[] = Array.from(groups.entries()).map(([label, values]) => ({
      label,
      value: aggregate(values),
      n: values.length,
    }));
    return { data, excluded };
  }, [categoryVar, valueMode, valueVar, valueFormat]);

  // Compute and sort bar data
  const { data: barData, excluded } = useMemo(
    () => computeBarData(dataset.records),
    [computeBarData, dataset.records]
  );

  const sortedData = useMemo(
    () => sortBarData(barData, sortMode, selectedColumn?.valueOrder),
    [barData, sortMode, selectedColumn]
  );

  // Categories available for the highlight selector (alphabetical)
  const categoryOptions = useMemo(
    () => [...new Set(sortedData.map(d => d.label))].sort((a, b) => a.localeCompare(b)),
    [sortedData]
  );

  // A highlight left over from a previous category variable or dataset matches no label, which
  // makes barColor mute every bar while the selector reads blank. Derive the effective value
  // rather than syncing state in an effect.
  const activeHighlight = categoryOptions.includes(highlightCat) ? highlightCat : '';

  const svgOptions = useMemo((): BarSvgOptions => ({
    sortedData,
    excluded,
    colorScheme,
    showDataLabels,
    title: chartTitle,
    subtitle: chartSubtitle,
    source: chartSource,
    axisTitle,
    valueFormat,
    valueMode,
    categoryVar,
    valueVar,
    highlightCat: activeHighlight,
    flagSmallCounts,
    referenceValue,
    referenceLabel,
    orientation,
    dataset,
  }), [sortedData, excluded, colorScheme, showDataLabels, chartTitle, chartSubtitle, chartSource, axisTitle, valueFormat, valueMode, categoryVar, valueVar, activeHighlight, flagSmallCounts, referenceValue, referenceLabel, orientation, dataset]);

  // Generate SVG string
  const svgContent = useMemo(() => generateBarSvg(svgOptions), [svgOptions]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;
    const columns = [
      { header: categoryVar ? colLabel(categoryVar) : 'Category', key: 'label' },
      // In count+percent mode computeBarData overwrites value with a share, so the header
      // must say so rather than claiming 'Count'.
      {
        header: valueMode !== 'count' && valueVar
          ? colLabel(valueVar)
          : (valueFormat === 'percent' ? 'Percent of records' : 'Count'),
        key: 'value',
      },
      { header: 'Records', key: 'n' },
    ];
    const rows = sortedData.map(d => ({
      label: d.label,
      value: d.value,
      n: d.n,
    }));
    return {
      title: chartTitle,
      subtitle: chartSubtitle || undefined,
      source: chartSource || undefined,
      columns,
      rows,
    };
  }, [sortedData, chartTitle, chartSubtitle, chartSource, dataset, categoryVar, valueMode, valueVar, valueFormat]);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Bar Chart</h3>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          {/* Category variable */}
          <VariableMapper
            label="Category Variable"
            description="The categorical variable to display"
            columns={dataset.columns}
            value={categoryVar}
            onChange={setCategoryVar}
            filterTypes={['text', 'categorical', 'boolean']}
            required
            placeholder="Select category..."
          />

          {/* Value mode */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
            <select
              value={valueMode}
              onChange={(e) => setValueMode(e.target.value as ValueMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="count">Count (frequency)</option>
              <option value="sum">Sum of numeric variable</option>
              <option value="mean">Mean of numeric variable</option>
              <option value="median">Median of numeric variable</option>
            </select>
          </div>

          {/* Numeric variable (when sum, mean, or median is selected) */}
          {valueMode !== 'count' && (
            <VariableMapper
              label="Numeric Variable"
              description="The numeric variable to aggregate per category"
              columns={dataset.columns}
              value={valueVar}
              onChange={setValueVar}
              filterTypes={['number']}
              required
              placeholder="Select numeric variable..."
            />
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Options</h4>

          {/* Orientation */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Orientation</label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as Orientation)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>

          {/* Sort */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="value">Value (descending)</option>
              <option value="alpha">Alphabetical</option>
              {hasCustomOrder && (
                <option value="custom">Custom order</option>
              )}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Highlight category</label>
            <select
              value={activeHighlight}
              onChange={(e) => setHighlightCat(e.target.value)}
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
              checked={showDataLabels}
              onChange={(e) => setShowDataLabels(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show data labels
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
              value={chartTitle}
              onChange={(e) => setChartTitle(e.target.value)}
              placeholder="Chart title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
            <input
              type="text"
              value={chartSubtitle}
              onChange={(e) => setChartSubtitle(e.target.value)}
              placeholder="Optional subtitle"
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
              placeholder="Defaults to the value being plotted"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={chartSource}
              onChange={(e) => setChartSource(e.target.value)}
              placeholder="Data source"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-w-0">
        {sortedData.length > 0 ? (
          facetCol ? (
            <FacetWrapper
              dataset={dataset}
              facetCol={facetCol}
              renderChart={(fd) => {
                const facet = computeBarData(fd.records);
                const sortedFacetData = sortBarData(facet.data, sortMode, selectedColumn?.valueOrder);
                if (sortedFacetData.length === 0) {
                  return <div className="text-gray-400 text-xs p-2">No data</div>;
                }
                const facetSvg = generateBarSvg({ ...svgOptions, sortedData: sortedFacetData, excluded: facet.excluded, title: '', subtitle: '', source: '' });
                return <div dangerouslySetInnerHTML={{ __html: facetSvg }} />;
              }}
            />
          ) : (
            <ChartContainer
              title={chartTitle || 'Bar Chart'}
              subtitle={chartSubtitle || undefined}
              source={chartSource || undefined}
              svgContent={svgContent}
              excelData={excelData}
              filename={chartTitle ? chartTitle.replace(/\s+/g, '_') : 'bar_chart'}
            >
              <div dangerouslySetInnerHTML={{ __html: svgContent }} />
            </ChartContainer>
          )
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            {categoryVar
              ? 'No data available for the selected configuration'
              : 'Select a category variable to generate the bar chart'}
          </div>
        )}
      </div>
    </div>
  );
}

/** Calculate a nice maximum value for the axis (rounds up to a clean number). */
function getNiceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  let niceNorm: number;
  if (normalized <= 1) niceNorm = 1;
  else if (normalized <= 2) niceNorm = 2;
  else if (normalized <= 5) niceNorm = 5;
  else niceNorm = 10;
  return niceNorm * magnitude;
}
