import { useState, useMemo, useCallback } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import {
  getDefaultDimensions,
  svgWrapper,
  svgHeader,
  svgFooter,
  svgText,
  svgAxisLine,
  fitText,
  estimateTextWidth,
  spreadPositions,
  type ExcelExportData,
} from '../../../utils/chartExport';
import { INCREASE_COLOR, DECREASE_COLOR, NEUTRAL_COLOR } from '../../../utils/chartColors';
import { aggregatePairByCategory, crossAggregate, type AggregationMode } from '../../../utils/chartAggregation';
import { categoryColumns, categoriesInColumn, orderCategories, orderPeriods, recordCount } from '../../../utils/chartCategories';
import { formatFixed, decimalsForValues } from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

interface SlopeChartProps {
  dataset: Dataset;
}

type InputMode = 'two-columns' | 'single-column';

interface SlopeDataPoint {
  category: string;
  startValue: number;
  endValue: number;
}

export function SlopeChart({ dataset }: SlopeChartProps) {
  const { config: locale } = useLocale();
  const [categoryCol, setCategoryCol] = useState('');
  const [startCol, setStartCol] = useState('');
  const [endCol, setEndCol] = useState('');
  const [valueCol, setValueCol] = useState('');
  const [groupCol, setGroupCol] = useState('');
  const [startGroupChoice, setStartGroupChoice] = useState('');
  const [endGroupChoice, setEndGroupChoice] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('two-columns');
  const [aggMode, setAggMode] = useState<AggregationMode>('mean');
  const [showValues, setShowValues] = useState(true);
  // null means "follow the data"; a string is what the user typed.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const catColumns = useMemo(() => categoryColumns(dataset), [dataset]);
  const colLabel = useCallback(
    (key: string) => dataset.columns.find(c => c.key === key)?.label || key,
    [dataset.columns]
  );

  // The values of the group variable, earlier period first: Before then After,
  // not the alphabetical After then Before.
  const groupValues = useMemo(() => {
    const column = dataset.columns.find(c => c.key === groupCol);
    if (!column) return [];
    return orderPeriods(categoriesInColumn(dataset.records, column), column);
  }, [dataset.records, dataset.columns, groupCol]);

  // The two groups compared. Which is the start is the user's to change.
  const startGroup = groupValues.includes(startGroupChoice) ? startGroupChoice : (groupValues[0] ?? '');
  const endGroup = groupValues.includes(endGroupChoice) && endGroupChoice !== startGroup
    ? endGroupChoice
    : (groupValues.find(v => v !== startGroup) ?? '');
  const hasTwoGroups = !!startGroup && !!endGroup;

  // Counting needs no value column in Value + Group mode: it counts the records in each group.
  const needsValueCol = inputMode === 'two-columns' || aggMode !== 'count';

  // Build slope data — always aggregates by category
  const slope = useMemo((): { points: SlopeDataPoint[]; notes: string[] } => {
    const empty = { points: [], notes: [] };
    if (!categoryCol) return empty;
    const categoryColumn = dataset.columns.find(c => c.key === categoryCol);
    const allCategories = categoriesInColumn(dataset.records, categoryColumn);
    const notes: string[] = [];
    let points: SlopeDataPoint[];

    if (inputMode === 'two-columns') {
      if (!startCol || !endCol) return empty;
      const pairs = aggregatePairByCategory(dataset.records, categoryCol, startCol, endCol, aggMode);
      points = pairs.map(p => ({ category: p.category, startValue: p.valueA, endValue: p.valueB }));
    } else {
      // single-column mode: pivot on group column
      if (!groupCol || !hasTwoGroups) return empty;
      const mode = aggMode === 'count' ? 'count' : aggMode === 'sum' ? 'sum' : 'mean';
      if (mode !== 'count' && !valueCol) return empty;
      const table = crossAggregate(
        dataset.records, categoryCol, groupCol, mode === 'count' ? null : valueCol, mode, [startGroup, endGroup]
      );
      points = [];
      for (const category of table.categories) {
        const s = table.cells.get(category)?.get(startGroup);
        const e = table.cells.get(category)?.get(endGroup);
        // A count of nobody is a real zero; a mean of nobody does not exist.
        if (mode === 'count') points.push({ category, startValue: s?.value ?? 0, endValue: e?.value ?? 0 });
        else if (s && e) points.push({ category, startValue: s.value, endValue: e.value });
      }
      if (table.excludedOtherGroup > 0) {
        const others = groupValues.filter(v => v !== startGroup && v !== endGroup);
        notes.push(`${recordCount(table.excludedOtherGroup)} with ${colLabel(groupCol)} of ${others.join(', ')} not shown.`);
      }
    }

    // A line needs both ends. Say how many categories had only one.
    const dropped = allCategories.length - points.length;
    if (dropped > 0) {
      notes.push(`${dropped} ${dropped === 1 ? 'category is' : 'categories are'} not shown: no value at one of the two ends.`);
    }

    // Reading order, used for the export and for breaking ties between labels
    const order = orderCategories(points.map(p => p.category), categoryColumn);
    const byName = new Map(points.map(p => [p.category, p]));
    return { points: order.map(c => byName.get(c)!), notes };
  }, [categoryCol, startCol, endCol, valueCol, groupCol, inputMode, aggMode, dataset.records, dataset.columns, groupValues, startGroup, endGroup, hasTwoGroups, colLabel]);

  const slopeData = slope.points;

  // Column header labels
  const startLabel = inputMode === 'two-columns' ? (colLabel(startCol) || 'Start') : (startGroup || 'Start');
  const endLabel = inputMode === 'two-columns' ? (colLabel(endCol) || 'End') : (endGroup || 'End');

  // What a point measures
  const statistic = useMemo(() => {
    const word = aggMode[0].toUpperCase() + aggMode.slice(1);
    if (inputMode === 'two-columns') return aggMode === 'count' ? 'Number of values recorded' : `${word} per ${colLabel(categoryCol)}`;
    return aggMode === 'count' ? 'Number of records' : `${word} of ${colLabel(valueCol)}`;
  }, [aggMode, inputMode, categoryCol, valueCol, colLabel]);

  const defaultTitle = !categoryCol || slopeData.length === 0
    ? 'Slope Chart'
    : inputMode === 'two-columns'
      ? `${startLabel} to ${endLabel} by ${colLabel(categoryCol)}`
      : `${statistic} by ${colLabel(categoryCol)}: ${startLabel} to ${endLabel}`;
  const title = titleOverride ?? defaultTitle;

  // Generate SVG
  const svgContent = useMemo(() => {
    if (slopeData.length === 0) return '';

    const dims = getDefaultDimensions('slope');
    const labelFont = 11;
    const allValues = slopeData.flatMap(d => [d.startValue, d.endValue]);
    const decimals = decimalsForValues(allValues);
    const fmt = (v: number) => formatFixed(v, decimals, locale);

    // Each end is labelled with the category and its value. The margins are
    // sized to the longest label instead of a fixed 120px, which clipped
    // anything longer than about 18 characters at both edges of the canvas.
    const names = slopeData.map(d => fitText(d.category, 190, labelFont));
    const leftTexts = slopeData.map((d, i) => (showValues ? `${names[i]}  ${fmt(d.startValue)}` : names[i]));
    const rightTexts = slopeData.map((d, i) => (showValues ? `${fmt(d.endValue)}  ${names[i]}` : names[i]));
    const side = Math.max(...[...leftTexts, ...rightTexts].map(t => estimateTextWidth(t, labelFont)), 60) + 22;
    const gap = 340; // distance between the two axes
    const width = Math.ceil(Math.max(dims.width, side * 2 + gap));
    const leftX = (width - gap) / 2;
    const rightX = leftX + gap;

    const header = svgHeader(width, title, subtitle || undefined);
    const plotTop = header.bottom + 48;
    // Room for every label at a readable spacing
    const plotH = Math.max(dims.height - 150, slopeData.length * 15);
    const plotBottom = plotTop + plotH;

    // Compute scale
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const valueRange = maxVal - minVal || 1;
    const yScale = (v: number) => plotBottom - 10 - ((v - minVal) / valueRange) * (plotH - 20);

    let svg = header.svg;

    // Direction legend. Colour repeats what the slope already shows, so it is
    // never the only cue.
    const legendY = header.bottom + 12;
    const legend: [string, string][] = [['Increase', INCREASE_COLOR], ['Decrease', DECREASE_COLOR], ['No change', NEUTRAL_COLOR]];
    let lx = width / 2 - 150;
    for (const [text, color] of legend) {
      svg += `<line x1="${lx}" y1="${legendY}" x2="${lx + 18}" y2="${legendY}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
      svg += svgText(lx + 24, legendY, text, { anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em' });
      lx += 100;
    }

    // Left and right axis lines
    svg += svgAxisLine(leftX, plotTop, leftX, plotBottom);
    svg += svgAxisLine(rightX, plotTop, rightX, plotBottom);

    svg += svgText(leftX, plotTop - 10, fitText(startLabel, gap - 20, 13, true), {
      anchor: 'middle', fontSize: 13, fontWeight: 'bold', fill: '#444',
    });
    svg += svgText(rightX, plotTop - 10, fitText(endLabel, gap - 20, 13, true), {
      anchor: 'middle', fontSize: 13, fontWeight: 'bold', fill: '#444',
    });

    // Labels are moved apart where two ends fall close together, each joined
    // to its point by a short tick so it is still clear which is which.
    const leftYs = spreadPositions(slopeData.map(d => yScale(d.startValue)), 13, plotTop, plotBottom);
    const rightYs = spreadPositions(slopeData.map(d => yScale(d.endValue)), 13, plotTop, plotBottom);

    slopeData.forEach((point, i) => {
      const y1 = yScale(point.startValue);
      const y2 = yScale(point.endValue);

      // Determine color based on direction
      let color: string;
      if (point.endValue > point.startValue) {
        color = INCREASE_COLOR;
      } else if (point.endValue < point.startValue) {
        color = DECREASE_COLOR;
      } else {
        color = NEUTRAL_COLOR;
      }

      // Slope line
      svg += `<line x1="${leftX}" y1="${y1}" x2="${rightX}" y2="${y2}" stroke="${color}" stroke-width="2" stroke-opacity="0.85"/>`;

      // Dots at endpoints
      svg += `<circle cx="${leftX}" cy="${y1}" r="4" fill="${color}"/>`;
      svg += `<circle cx="${rightX}" cy="${y2}" r="4" fill="${color}"/>`;

      // Leader ticks from each point to its label
      svg += `<line x1="${leftX - 5}" y1="${y1}" x2="${leftX - 12}" y2="${leftYs[i]}" stroke="#9CA3AF" stroke-width="1"/>`;
      svg += `<line x1="${rightX + 5}" y1="${y2}" x2="${rightX + 12}" y2="${rightYs[i]}" stroke="#9CA3AF" stroke-width="1"/>`;

      svg += svgText(leftX - 15, leftYs[i], leftTexts[i], { anchor: 'end', fontSize: labelFont, fill: '#333', dy: '0.35em' });
      svg += svgText(rightX + 15, rightYs[i], rightTexts[i], { anchor: 'start', fontSize: labelFont, fill: '#333', dy: '0.35em' });
    });

    const labelsBottom = Math.max(plotBottom, ...leftYs, ...rightYs);
    const notes = [
      inputMode === 'two-columns'
        ? `Points show the ${aggMode} of each column per ${colLabel(categoryCol)}.`
        : aggMode === 'count'
          ? `Points show the number of records per ${colLabel(categoryCol)} at each ${colLabel(groupCol)}.`
          : `Points show the ${aggMode} of ${colLabel(valueCol)} per ${colLabel(categoryCol)} at each ${colLabel(groupCol)}.`,
      'The vertical scale covers the range of the values plotted; it does not start at zero.',
      ...slope.notes,
    ];
    const footer = svgFooter(width, labelsBottom + 10, notes, source || undefined);

    return svgWrapper(width, footer.height, svg + footer.svg);
  }, [slopeData, slope.notes, showValues, title, subtitle, source, startLabel, endLabel, inputMode, aggMode, categoryCol, groupCol, valueCol, locale, colLabel]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const columns = [
      { header: colLabel(categoryCol) || 'Category', key: 'category' },
      { header: startLabel, key: 'startValue' },
      { header: endLabel, key: 'endValue' },
    ];
    const rows = slopeData.map(d => ({
      category: d.category,
      startValue: d.startValue,
      endValue: d.endValue,
    }));
    return {
      title,
      subtitle: subtitle ? `${subtitle} (${statistic})` : statistic,
      source: source || undefined,
      columns,
      rows,
    };
  }, [slopeData, categoryCol, startLabel, endLabel, statistic, title, subtitle, source, colLabel]);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Chart Configuration</h3>

          <VisualizationTip
            tip="Slope charts excel at showing change between exactly two time points. Each line is coloured by its direction (blue for an increase, orange for a decrease), so rises and falls stand out across many categories."
            context="Best for comparing before/after or two-period data. If you need more than two time points, use a line chart instead."
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
                <p>• Comparing values between exactly two time points or conditions</p>
                <p>• Highlighting which categories increased vs. decreased</p>
                <p>• Showing pre/post intervention results across multiple groups</p>
                <p>• When you want to emphasize direction and magnitude of change</p>
                <p className="text-blue-500 italic mt-2">CDC training resources reference slopegraphs as effective for showing change over time. Best with 5–15 categories. — CDC Principles of Epidemiology</p>
              </div>
            )}
          </div>

          {/* Data point warning */}
          {slopeData.length > 50 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
              <p className="text-xs text-amber-800">
                <strong>{slopeData.length} categories detected.</strong> Slope charts work best with 3-15 categories. Consider using a column with fewer unique values.
              </p>
            </div>
          )}

          {/* Input mode toggle */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Input Mode</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setInputMode('two-columns')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  inputMode === 'two-columns'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Two Value Columns
              </button>
              <button
                onClick={() => setInputMode('single-column')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  inputMode === 'single-column'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Value + Group
              </button>
            </div>
          </div>

          <VariableMapper
            label="Category"
            description="Labels for each slope line"
            columns={catColumns}
            value={categoryCol}
            onChange={setCategoryCol}
            required
          />

          {inputMode === 'two-columns' ? (
            <>
              <VariableMapper
                label="Start Value"
                description="Numeric values for the left axis"
                columns={dataset.columns}
                value={startCol}
                onChange={setStartCol}
                filterTypes={['number']}
                required
              />
              <VariableMapper
                label="End Value"
                description="Numeric values for the right axis"
                columns={dataset.columns}
                value={endCol}
                onChange={setEndCol}
                filterTypes={['number']}
                required
              />
            </>
          ) : (
            <>
              {needsValueCol && (
                <VariableMapper
                  label="Value Column"
                  description="Numeric value for each data point"
                  columns={dataset.columns}
                  value={valueCol}
                  onChange={setValueCol}
                  filterTypes={['number']}
                  required
                />
              )}
              <VariableMapper
                label="Group Column"
                description="The two periods or conditions compared (e.g., Before/After)"
                columns={catColumns}
                value={groupCol}
                onChange={setGroupCol}
                required
              />
              {groupCol && groupValues.length < 2 && (
                <p className="text-xs text-red-600 -mt-1">
                  Found {groupValues.length} group{groupValues.length === 1 ? '' : 's'}. A slope chart needs two.
                </p>
              )}
              {groupValues.length >= 2 && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start (left)</label>
                    <select
                      value={startGroup}
                      onChange={(e) => setStartGroupChoice(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      {groupValues.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End (right)</label>
                    <select
                      value={endGroup}
                      onChange={(e) => setEndGroupChoice(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      {groupValues.filter(v => v !== startGroup).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Display options */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Display Options</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Aggregation</label>
            <select
              value={aggMode}
              onChange={e => setAggMode(e.target.value as AggregationMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="mean">Mean (average)</option>
              <option value="sum">Sum (total)</option>
              <option value="count">Count (frequency)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">How to combine multiple records per category</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showValues}
              onChange={e => setShowValues(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Show value labels
          </label>
        </div>

        {/* Text inputs */}
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitleOverride(e.target.value)}
              placeholder="Chart title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
            <input
              type="text"
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder="Optional subtitle"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
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
            title={title}
            svgContent={svgContent}
            excelData={excelData}
            filename="slope-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-500 text-sm">
              Select a category variable and value columns to generate the slope chart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
