import { useState, useMemo, useCallback } from 'react';
import type { Dataset } from '../../../types/analysis';
import { pickCategoryColumn, pickNumericColumn, resolveColumnChoice } from '../../../utils/chartDefaults';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { AggregatedDataHint } from '../shared/AggregatedDataHint';
import { findCountColumn } from '../../../utils/countColumn';
import { FacetWrapper, FacetControl } from '../shared/FacetWrapper';
import { getChartColor } from '../../../utils/chartColors';
import type { ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgHeader,
  svgFooter,
  svgText,
  svgGridLine,
  svgAxisLine,
  fitText,
  fitRotatedLabel,
  estimateTextWidth,
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

interface BarChartProps {
  dataset: Dataset;
}

type SortMode = 'value' | 'category';
type ValueMode = 'count' | 'sum' | 'mean' | 'median';
type ValueFormat = 'number' | 'percent';
type Orientation = 'horizontal' | 'vertical';

interface BarData {
  label: string;
  value: number;
  n: number;
  /** No records in this panel for a category the other panels have. */
  empty?: boolean;
}

interface BarDataResult {
  data: BarData[];
  excluded: number;
  /** Records counted, the denominator of a percentage. */
  included: number;
}

interface BarSvgOptions {
  /** Facet panels share one set of footnotes under the grid, so they suppress their own. */
  suppressFootnotes?: boolean;
  sortedData: BarData[];
  excluded: number;
  included: number;
  width: number;
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
  if (opts.suppressFootnotes) return [];
  const { sortedData, excluded, included, valueMode, valueFormat, categoryVar, valueVar, flagSmallCounts, dataset } = opts;
  const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;

  const footnotes: string[] = [];
  if (valueMode === 'count') {
    // A percentage is only readable with its denominator beside it.
    footnotes.push(valueFormat === 'percent'
      ? `Values show the percent of the ${recordCount(included)} with ${colLabel(categoryVar)} recorded.`
      : `Values show the number of records per ${colLabel(categoryVar)}.`);
  } else {
    footnotes.push(`Values show the ${valueMode} of ${colLabel(valueVar)} per ${colLabel(categoryVar)}.`);
  }
  if (flagSmallCounts && sortedData.some(d => !d.empty && d.n < 20)) {
    // Under an active highlight every other bar is already gray, so "muted" would be ambiguous.
    footnotes.push(opts.highlightCat
      ? 'Outlined bars indicate categories based on fewer than 20 records. Interpret with caution.'
      : 'Muted bars indicate categories based on fewer than 20 records. Interpret with caution.');
  }
  if (excluded > 0) {
    footnotes.push(`${recordCount(excluded)} excluded due to missing values.`);
  }
  return footnotes;
}

/**
 * The value axis and the label formatting for one drawing.
 *
 * The axis runs through zero and covers the data on both sides of it. It used
 * to start at zero and assume everything was positive, so a chart of negative
 * means (a z-score by age group) had an axis from 0 to 10 and no bars.
 */
function valueAxis(opts: BarSvgOptions, maxIntervals: number) {
  const values = opts.sortedData.filter(d => !d.empty).map(d => d.value);
  const ref = opts.referenceValue;
  const isRecordCount = opts.valueMode === 'count' && opts.valueFormat !== 'percent';
  const scale = niceScale(
    Math.min(...values, ref ?? 0, opts.domain?.[0] ?? 0),
    Math.max(...values, ref ?? 0, opts.domain?.[1] ?? 0),
    { integer: isRecordCount, maxIntervals }
  );
  const suffix = opts.valueFormat === 'percent' ? '%' : '';
  // Percent shares keep one decimal; everything else takes what the values need.
  const decimals = isRecordCount ? 0
    : opts.valueMode === 'count' ? 1
    : decimalsForValues(values);
  return {
    scale,
    tick: (v: number) => formatTick(v, scale, opts.locale, suffix),
    label: (v: number) => `${formatFixed(v, decimals, opts.locale)}${suffix}`,
  };
}

/** Generate SVG for a horizontal bar chart from sorted data. */
function generateHorizontalBarSvg(opts: BarSvgOptions): string {
  const {
    sortedData,
    width,
    colorScheme,
    showDataLabels,
    title,
    subtitle,
    source,
    axisTitle,
    highlightCat,
    flagSmallCounts,
    referenceValue,
    referenceLabel,
  } = opts;

  const dims = getDefaultDimensions('bar');

  // Wrap category labels (max 2 lines) and widen the left margin to fit the longest line
  const wrappedLabels = sortedData.map(d => wrapCategoryLabel(d.label));
  const maxLabelChars = wrappedLabels.reduce((m, lines) => Math.max(m, ...lines.map(l => l.length)), 0);
  const margin = {
    left: Math.min(Math.min(260, width * 0.4), Math.max(60, Math.ceil(maxLabelChars * 6.8) + 16)),
    right: 48,
  };
  const plotWidth = width - margin.left - margin.right;

  const axis = valueAxis(opts, width < 700 ? 4 : 6);
  const { scale } = axis;
  const span = scale.max - scale.min;
  const xScale = (v: number) => margin.left + ((v - scale.min) / span) * plotWidth;
  const zeroX = xScale(0);

  const header = svgHeader(width, title, subtitle || undefined);
  const plotTop = header.bottom + 14;

  // Bars fill the default plot height when there are many and stop at 40px
  // when there are few; the canvas then fits the bars. It used to stay 500px
  // tall however few bars there were, leaving four bars above a blank half page.
  const barCount = sortedData.length;
  const barGap = 4;
  const defaultPlotHeight = dims.height - dims.margin.top - dims.margin.bottom;
  const fitBarHeight = (defaultPlotHeight - barGap * (barCount - 1)) / barCount;
  // The floor keeps one category label per bar readable; below it the labels overlap.
  const barHeight = Math.max(Math.min(fitBarHeight, 40), 13);
  const plotHeight = barCount * barHeight + (barCount - 1) * barGap;
  const axisY = plotTop + plotHeight + 6;

  const schemeColor = getChartColor(0, colorScheme);

  let svg = header.svg;

  for (const tick of scale.ticks) {
    const x = xScale(tick);
    if (tick !== 0) svg += svgGridLine(x, plotTop, x, axisY);
    svg += svgText(x, axisY + 16, axis.tick(tick), { anchor: 'middle', fontSize: 11, fill: '#666' });
  }

  // Reference line
  if (referenceValue !== null) {
    const refX = xScale(referenceValue);
    svg += `<line x1="${refX}" y1="${plotTop}" x2="${refX}" y2="${axisY}" stroke="#6B7280" stroke-width="1.5" stroke-dasharray="5,4"/>`;
    if (referenceLabel) {
      const onRight = refX < margin.left + plotWidth * 0.7;
      svg += svgText(refX + (onRight ? 4 : -4), plotTop - 5, referenceLabel, { anchor: onRight ? 'start' : 'end', fontSize: 10, fill: '#555' });
    }
  }

  sortedData.forEach((d, i) => {
    const barY = plotTop + i * (barHeight + barGap);
    const labelY = barY + barHeight / 2;

    // Category label on the left (wrapped to at most 2 lines)
    const lines = wrappedLabels[i];
    if (lines.length === 1 || barHeight < 24) {
      svg += svgText(margin.left - 8, labelY, fitText(d.label, margin.left - 14, 12), { anchor: 'end', fontSize: 12, fill: '#333', dy: '0.35em' });
    } else {
      svg += svgText(margin.left - 8, labelY - 7, lines[0], { anchor: 'end', fontSize: 12, fill: '#333', dy: '0.35em' });
      svg += svgText(margin.left - 8, labelY + 7, lines[1], { anchor: 'end', fontSize: 12, fill: '#333', dy: '0.35em' });
    }

    if (d.empty) {
      // A category this panel has no records for. No bar and no number, so it
      // cannot be read as a measured zero.
      svg += svgText(zeroX + 6, labelY, '–', { anchor: 'start', fontSize: 11, fill: '#9CA3AF', dy: '0.35em' });
      return;
    }

    const endX = xScale(d.value);
    const barW = Math.abs(endX - zeroX);
    const color = barColor(d.label, highlightCat, schemeColor);
    const muted = isMutedByHighlight(d.label, highlightCat);
    const smallCount = flagSmallCounts && d.n < 20;
    const opacity = smallCount ? smallCountAttrs(muted) : '';

    svg += `<rect x="${Math.min(zeroX, endX)}" y="${barY}" width="${barW}" height="${barHeight}" fill="${color}"${opacity} rx="2"/>`;

    if (showDataLabels) {
      const displayValue = axis.label(d.value);
      const labelWidth = estimateTextWidth(displayValue, 11, true) + 8;
      // White text needs a solid bar behind it. On a faded small-count bar or a
      // grey un-highlighted one it was close to invisible, so those are
      // labelled beside the bar in dark text instead.
      const solid = !muted && !smallCount;
      const towardPositive = d.value >= 0;
      if (solid && barW > labelWidth + 10 && barHeight >= 12) {
        svg += svgText(endX + (towardPositive ? -6 : 6), labelY, displayValue, {
          anchor: towardPositive ? 'end' : 'start', fontSize: 11, fontWeight: 'bold', fill: '#fff', dy: '0.35em',
        });
      } else if (towardPositive) {
        svg += svgText(endX + 6, labelY, displayValue, { anchor: 'start', fontSize: 11, fontWeight: 'bold', fill: '#333', dy: '0.35em' });
      } else {
        // A short negative bar: the label goes on the far side of the zero line,
        // clear of the category names on the left.
        svg += svgText(zeroX + 6, labelY, displayValue, { anchor: 'start', fontSize: 11, fontWeight: 'bold', fill: '#333', dy: '0.35em' });
      }
    }
  });

  // The line the bars grow from
  svg += svgAxisLine(zeroX, plotTop - 2, zeroX, axisY);

  // Bottom area: axis title, then footnotes and the source line
  let cursorY = axisY + 22;
  if (axisTitle) {
    cursorY += 16;
    svg += svgText(margin.left + plotWidth / 2, cursorY, fitText(axisTitle, plotWidth + margin.right, 12), { fontSize: 12, fill: '#444' });
  }

  const footer = svgFooter(width, cursorY + 4, buildFootnotes(opts), source || undefined);
  return svgWrapper(width, footer.height, svg + footer.svg);
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
    highlightCat,
    flagSmallCounts,
    referenceValue,
    referenceLabel,
  } = opts;

  const dims = getDefaultDimensions('bar');

  // Past roughly a dozen categories the default width gave bands narrower than
  // the bars drawn in them, so adjacent bars physically overlapped and labels
  // ran into each other. Grow the canvas instead, as horizontal mode grows its
  // height, and rotate labels once they no longer fit their band.
  const MIN_BAND_WIDTH = 18;
  const marginLeft = 64;
  const marginRight = 30;
  const naturalPlotWidth = opts.width - marginLeft - marginRight;
  const plotWidth = Math.max(naturalPlotWidth, sortedData.length * MIN_BAND_WIDTH);
  const width = plotWidth + marginLeft + marginRight;

  const barCount = sortedData.length;
  const bandW = plotWidth / barCount;
  const labels = sortedData.map(d => fitText(d.label, 150, 11));
  const widest = Math.max(...labels.map(l => estimateTextWidth(l, 11)));
  const rotateLabels = widest > bandW - 6;
  // Depth the category labels occupy under the axis. The footnotes start below
  // it; they used to start at a fixed offset and print across rotated labels.
  const labelDepth = rotateLabels ? Math.min(widest * 0.72 + 16, 130) : 24;

  const axis = valueAxis(opts, 6);
  const { scale } = axis;
  const span = scale.max - scale.min;

  const header = svgHeader(width, title, subtitle || undefined);
  const plotTop = header.bottom + 22;
  const plotHeight = opts.width < 700 ? 240 : dims.height - 170;
  const axisY = plotTop + plotHeight;
  const yScale = (v: number) => axisY - ((v - scale.min) / span) * plotHeight;
  const zeroY = yScale(0);

  const barWidth = Math.max(Math.min(bandW * 0.7, 40), 6);
  const schemeColor = getChartColor(0, colorScheme);

  let svg = header.svg;

  // Horizontal gridlines and value tick labels on the left
  for (const tick of scale.ticks) {
    const y = yScale(tick);
    if (tick !== 0) svg += svgGridLine(marginLeft, y, marginLeft + plotWidth, y);
    svg += svgText(marginLeft - 6, y, axis.tick(tick), { anchor: 'end', fontSize: 11, fill: '#666', dy: '0.35em' });
  }

  // Reference line (horizontal across the plot in vertical mode)
  if (referenceValue !== null) {
    const refY = yScale(referenceValue);
    svg += `<line x1="${marginLeft}" y1="${refY}" x2="${marginLeft + plotWidth}" y2="${refY}" stroke="#6B7280" stroke-width="1.5" stroke-dasharray="5,4"/>`;
    if (referenceLabel) {
      svg += svgText(marginLeft + plotWidth - 4, refY - 4, referenceLabel, { anchor: 'end', fontSize: 10, fill: '#555' });
    }
  }

  sortedData.forEach((d, i) => {
    const bandX = marginLeft + i * bandW;
    const cx = bandX + bandW / 2;

    // Category label below the plot
    if (rotateLabels) {
      svg += svgText(cx, axisY + 14, fitRotatedLabel(d.label, cx, 11), { fontSize: 11, fill: '#333', anchor: 'end', rotate: -40 });
    } else {
      svg += svgText(cx, axisY + 16, labels[i], { fontSize: 11, fill: '#333' });
    }

    if (d.empty) {
      svg += svgText(cx, zeroY - 5, '–', { fontSize: 11, fill: '#9CA3AF' });
      return;
    }

    const endY = yScale(d.value);
    const color = barColor(d.label, highlightCat, schemeColor);
    // Small-count bars render muted (highlight wins, but still at reduced opacity)
    const smallCount = flagSmallCounts && d.n < 20;
    const opacity = smallCount ? smallCountAttrs(isMutedByHighlight(d.label, highlightCat)) : '';

    svg += `<rect x="${bandX + (bandW - barWidth) / 2}" y="${Math.min(zeroY, endY)}" width="${barWidth}" height="${Math.abs(endY - zeroY)}" fill="${color}"${opacity} rx="2"/>`;

    // Value label past the end of the bar: above a positive one, below a negative one
    if (showDataLabels) {
      svg += svgText(cx, d.value >= 0 ? endY - 5 : endY + 13, axis.label(d.value), {
        fontSize: 11,
        fontWeight: 'bold',
        fill: '#333',
      });
    }
  });

  // The line the bars grow from
  svg += svgAxisLine(marginLeft, zeroY, marginLeft + plotWidth, zeroY);

  // Axis title rotated -90 degrees, centered along the y-axis
  if (axisTitle) {
    svg += svgText(16, plotTop + plotHeight / 2, fitText(axisTitle, plotHeight + 40, 12), { fontSize: 12, fill: '#444', rotate: -90 });
  }

  const footer = svgFooter(width, axisY + labelDepth, buildFootnotes(opts), source || undefined);
  return svgWrapper(width, footer.height, svg + footer.svg);
}

/** Generate SVG for bar chart from sorted data. */
function generateBarSvg(opts: BarSvgOptions): string {
  if (opts.sortedData.length === 0) return '';
  return opts.orientation === 'vertical' ? generateVerticalBarSvg(opts) : generateHorizontalBarSvg(opts);
}

export function BarChart({ dataset }: BarChartProps) {
  const { config: locale } = useLocale();
  // Config state
  const [categoryVarChoice, setCategoryVarChoice] = useState('');
  // null means "follow the data": see countColumn below.
  const [valueModeChoice, setValueMode] = useState<ValueMode | null>(null);
  const [valueVarChoice, setValueVarChoice] = useState('');
  // null means "follow the data": categories with an order of their own keep
  // it, and the rest are ranked by value.
  const [sortChoice, setSortChoice] = useState<SortMode | null>(null);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [valueFormat, setValueFormat] = useState<ValueFormat>('number');
  const [highlightCat, setHighlightCat] = useState('');
  const [flagSmallCounts, setFlagSmallCounts] = useState(true);
  const [referenceLine, setReferenceLine] = useState('');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showDataLabels, setShowDataLabels] = useState(true);
  const [facetCol, setFacetCol] = useState('');
  const [sharedScale, setSharedScale] = useState(true);
  // null means "follow the data"; a string is an explicit override typed by the
  // user. Derived rather than synced in an effect, so the title cannot lag the
  // controls it describes.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [chartSubtitle, setChartSubtitle] = useState('');
  const [axisTitleOverride, setAxisTitleOverride] = useState<string | null>(null);
  const [chartSource, setChartSource] = useState('');

  const catColumns = useMemo(() => categoryColumns(dataset), [dataset]);

  // Effective selections: the user's choice while it remains valid for the
  // current dataset, otherwise an automatic pick. Derived rather than written
  // back through an effect.
  const categoryVar = resolveColumnChoice(dataset, categoryVarChoice, useMemo(() => pickCategoryColumn(dataset), [dataset]));
  // Aggregated data (one row per report, with a column of cases) starts as the
  // total of that column. Counting its rows drew the same bar for every
  // category, under an axis that read as cases.
  const countColumn = useMemo(() => findCountColumn(dataset.columns, dataset.records), [dataset.columns, dataset.records]);
  const valueMode: ValueMode = valueModeChoice ?? (countColumn ? 'sum' : 'count');
  const valueVar = resolveColumnChoice(
    dataset, valueVarChoice,
    useMemo(() => countColumn?.key ?? pickNumericColumn(dataset), [countColumn, dataset]),
    true
  );

  const selectedColumn = useMemo(
    () => dataset.columns.find(c => c.key === categoryVar),
    [dataset.columns, categoryVar]
  );
  const valueLabel = dataset.columns.find(c => c.key === valueVar)?.label || '';
  // A total of cases is called by the column's own name, not "Sum of".
  const statistic = valueMode === 'count' ? ''
    : valueMode === 'sum' && countColumn?.key === valueVar ? valueLabel
      : `${valueMode[0].toUpperCase()}${valueMode.slice(1)} of ${valueLabel}`;

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

  const defaultTitle = !categoryVar
    ? 'Bar Chart'
    : `${valueMode === 'count' ? 'Records' : statistic} by ${selectedColumn?.label || categoryVar}`;
  const chartTitle = titleOverride ?? defaultTitle;

  const referenceValue = useMemo(() => {
    if (referenceLine.trim() === '') return null;
    const v = Number(referenceLine);
    return isNaN(v) ? null : v;
  }, [referenceLine]);

  // Shared aggregation for the main chart and facets
  const computeBarData = useCallback((records: Dataset['records']): BarDataResult => {
    if (!categoryVar) return { data: [], excluded: 0, included: 0 };

    let excluded = 0;

    if (valueMode === 'count') {
      const counts = new Map<string, number>();
      for (const record of records) {
        const key = categoryOf(record[categoryVar]);
        if (key === null) {
          excluded++;
          continue;
        }
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const data = Array.from(counts.entries()).map(([label, count]) => ({ label, value: count, n: count }));
      const total = data.reduce((s, d) => s + d.n, 0);

      // In count mode with percent format, plot each category's share of the included records
      if (valueFormat === 'percent' && total > 0) {
        for (const d of data) d.value = (d.n / total) * 100;
      }
      return { data, excluded, included: total };
    }

    // Sum, mean, or median of a numeric column grouped by category
    if (!valueVar) return { data: [], excluded: 0, included: 0 };

    const groups = new Map<string, number[]>();
    let included = 0;
    for (const record of records) {
      const key = categoryOf(record[categoryVar]);
      const numVal = numberOf(record[valueVar]);
      if (key === null || numVal === null) {
        excluded++;
        continue;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(numVal);
      included++;
    }

    const aggregate = (values: number[]): number => {
      switch (valueMode) {
        case 'sum':
          return values.reduce((a, b) => a + b, 0);
        case 'median':
          return median(values);
        default:
          return values.reduce((a, b) => a + b, 0) / values.length;
      }
    };

    const data: BarData[] = Array.from(groups.entries()).map(([label, values]) => ({
      label,
      value: aggregate(values),
      n: values.length,
    }));
    return { data, excluded, included };
  }, [categoryVar, valueMode, valueVar, valueFormat]);

  // Compute and sort bar data
  const { data: barData, excluded, included } = useMemo(
    () => computeBarData(dataset.records),
    [computeBarData, dataset.records]
  );

  // Category order: the column's declared order, then numeric-aware, so age
  // bands run 0-4, 5-9, 10-14. The old "Alphabetical" put 10-14 before 5-9.
  const categoryOrder = useMemo(
    () => orderCategories(barData.map(d => d.label), selectedColumn),
    [barData, selectedColumn]
  );
  const sortMode: SortMode = sortChoice
    ?? (hasNaturalOrder(categoryOrder, selectedColumn) ? 'category' : 'value');

  const sortedData = useMemo(() => {
    const inOrder = [...barData].sort(byCategoryOrder(categoryOrder, d => d.label));
    return sortMode === 'value' ? inOrder.sort((a, b) => b.value - a.value) : inOrder;
  }, [barData, categoryOrder, sortMode]);

  // Categories available for the highlight selector
  const categoryOptions = categoryOrder;

  // A highlight left over from a previous category variable or dataset matches no label, which
  // makes barColor mute every bar while the selector reads blank. Derive the effective value
  // rather than syncing state in an effect.
  const activeHighlight = categoryOptions.includes(highlightCat) ? highlightCat : '';

  const svgOptions = useMemo((): BarSvgOptions => ({
    sortedData,
    excluded,
    included,
    width: getDefaultDimensions('bar').width,
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
    locale,
  }), [sortedData, excluded, included, colorScheme, showDataLabels, chartTitle, chartSubtitle, chartSource, axisTitle, valueFormat, valueMode, categoryVar, valueVar, activeHighlight, flagSmallCounts, referenceValue, referenceLabel, orientation, dataset, locale]);

  // Generate SVG string
  const svgContent = useMemo(() => generateBarSvg(svgOptions), [svgOptions]);

  // Stratified panels. Every panel lists the same categories in the same
  // order, so a row means the same thing wherever it is read; ranking each
  // panel by its own values put a different category first in each.
  const facetPanelData = useCallback((records: Dataset['records']): BarData[] => {
    const panel = computeBarData(records);
    const byLabel = new Map(panel.data.map(d => [d.label, d]));
    return sortedData.map(d => byLabel.get(d.label)
      ?? { label: d.label, value: 0, n: 0, empty: valueMode !== 'count' });
  }, [computeBarData, sortedData, valueMode]);

  // The value range every panel shares, taken from all of them
  const facetDomain = useMemo((): [number, number] | undefined => {
    if (!facetCol || !sharedScale) return undefined;
    let lo = 0;
    let hi = 0;
    const strata = new Set(dataset.records.map(r => categoryOf(r[facetCol])).filter((v): v is string => v !== null));
    for (const stratum of strata) {
      for (const d of facetPanelData(dataset.records.filter(r => categoryOf(r[facetCol]) === stratum))) {
        if (d.empty) continue;
        if (d.value < lo) lo = d.value;
        if (d.value > hi) hi = d.value;
      }
    }
    return [lo, hi];
  }, [facetCol, sharedScale, dataset.records, facetPanelData]);

  // Footnotes for the facet grid, built once from the full dataset rather than
  // repeated inside every panel.
  const facetFootnotes = useMemo(() => {
    const notes = buildFootnotes(svgOptions);
    if (valueMode === 'count' && valueFormat === 'percent') {
      notes[0] = `Values show the percent of each panel's records with ${selectedColumn?.label || categoryVar} recorded.`;
    }
    notes.push(sharedScale
      ? 'All panels share the same value axis.'
      : 'Each panel has its own value axis scale: compare within a panel, not between panels.');
    return notes;
  }, [svgOptions, valueMode, valueFormat, selectedColumn, categoryVar, sharedScale]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const colLabel = (key: string) => dataset.columns.find(c => c.key === key)?.label || key;
    const columns = [
      { header: categoryVar ? colLabel(categoryVar) : 'Category', key: 'label' },
      // In count+percent mode computeBarData overwrites value with a share, so the header
      // must say so rather than claiming 'Count'.
      {
        header: valueMode !== 'count' && valueVar
          ? statistic
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
  }, [sortedData, chartTitle, chartSubtitle, chartSource, dataset, categoryVar, valueMode, valueVar, valueFormat, statistic]);

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
            columns={catColumns}
            value={categoryVar}
            onChange={setCategoryVarChoice}
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
          {valueMode === 'count' && countColumn && (
            <AggregatedDataHint
              countLabel={countColumn.label}
              onUseCounts={() => { setValueMode('sum'); setValueVarChoice(countColumn.key); }}
            />
          )}

          {/* Numeric variable (when sum, mean, or median is selected) */}
          {valueMode !== 'count' && (
            <VariableMapper
              label="Numeric Variable"
              description="The numeric variable to aggregate per category"
              columns={dataset.columns}
              value={valueVar}
              onChange={setValueVarChoice}
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
              onChange={(e) => setSortChoice(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="value">Value (descending)</option>
              <option value="category">Category order</option>
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
              value={chartTitle}
              onChange={(e) => setTitleOverride(e.target.value)}
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
              title={chartTitle}
              subtitle={chartSubtitle || undefined}
              source={chartSource || undefined}
              notes={facetFootnotes}
              filename="bar_chart"
              renderPanel={(records) => generateBarSvg({
                ...svgOptions,
                sortedData: facetPanelData(records),
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
              title={chartTitle}
              svgContent={svgContent}
              excelData={excelData}
              filename="bar_chart"
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
