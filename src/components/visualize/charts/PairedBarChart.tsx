import { useState, useMemo, useCallback } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { getChartColors, type ChartColorScheme } from '../../../utils/chartColors';
import {
  svgWrapper,
  svgHeader,
  svgFooter,
  svgText,
  svgAxisLine,
  svgGridLine,
  fitText,
  estimateTextWidth,
  type ExcelExportData,
} from '../../../utils/chartExport';
import { crossAggregate, aggregatePairByCategory } from '../../../utils/chartAggregation';
import { categoryColumns, categoriesInColumn, orderCategories, recordCount } from '../../../utils/chartCategories';
import { niceScale, formatTick, formatFixed, decimalsForValues } from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

interface PairedBarChartProps {
  dataset: Dataset;
}

type InputMode = 'two-columns' | 'group-split';
type PairedAggMode = 'mean' | 'sum' | 'count';
type RowOrder = 'auto' | 'top' | 'bottom';

interface PairedRow {
  category: string;
  /** null when the side has no records to aggregate, which is not the same as zero. */
  leftVal: number | null;
  rightVal: number | null;
}

export function PairedBarChart({ dataset }: PairedBarChartProps) {
  const { config: locale } = useLocale();
  const [categoryCol, setCategoryCol] = useState('');
  // A pyramid counts records by a two-group variable, so that is the mode the
  // chart opens in. It used to open asking for two numeric columns, and Count
  // still demanded a numeric column it never read.
  const [inputMode, setInputMode] = useState<InputMode>('group-split');

  // Two-column mode
  const [leftValueCol, setLeftValueCol] = useState('');
  const [rightValueCol, setRightValueCol] = useState('');

  // Group-split mode
  const [numericCol, setNumericCol] = useState('');
  const [groupCol, setGroupCol] = useState('');
  const [leftGroupChoice, setLeftGroupChoice] = useState('');
  const [rightGroupChoice, setRightGroupChoice] = useState('');

  const [aggMode, setAggMode] = useState<PairedAggMode>('count');
  const [rowOrder, setRowOrder] = useState<RowOrder>('auto');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
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

  // Counting two numeric columns means nothing, so two-column mode falls back to the mean.
  const effectiveAgg: PairedAggMode = inputMode === 'two-columns' && aggMode === 'count' ? 'mean' : aggMode;

  // The values of the group variable, in reading order
  const groupValues = useMemo(() => {
    if (inputMode !== 'group-split' || !groupCol) return [];
    return categoriesInColumn(dataset.records, dataset.columns.find(c => c.key === groupCol));
  }, [inputMode, groupCol, dataset]);

  // The two groups drawn. A variable with a third value (Unknown, say) used to
  // be refused outright; now two are chosen and the rest are reported as left out.
  const leftGroup = groupValues.includes(leftGroupChoice) ? leftGroupChoice : (groupValues[0] ?? '');
  const rightGroup = groupValues.includes(rightGroupChoice) && rightGroupChoice !== leftGroup
    ? rightGroupChoice
    : (groupValues.find(v => v !== leftGroup) ?? '');

  // Build paired data
  const paired = useMemo(() => {
    if (!categoryCol) return null;
    const categoryColumn = dataset.columns.find(c => c.key === categoryCol);

    let rows: PairedRow[];
    const notes: string[] = [];

    if (inputMode === 'two-columns') {
      if (!leftValueCol || !rightValueCol) return null;
      const pairs = aggregatePairByCategory(
        dataset.records, categoryCol, leftValueCol, rightValueCol, effectiveAgg === 'sum' ? 'sum' : 'mean'
      );
      rows = pairs.map(p => ({ category: p.category, leftVal: p.valueA, rightVal: p.valueB }));
      const dropped = categoriesInColumn(dataset.records, categoryColumn).length - rows.length;
      if (dropped > 0) {
        notes.push(`${dropped} ${dropped === 1 ? 'category is' : 'categories are'} not shown: no value in one of the two columns.`);
      }
    } else {
      if (!groupCol || !leftGroup || !rightGroup) return null;
      if (effectiveAgg !== 'count' && !numericCol) return null;
      const table = crossAggregate(
        dataset.records, categoryCol, groupCol,
        effectiveAgg === 'count' ? null : numericCol, effectiveAgg, [leftGroup, rightGroup]
      );
      rows = table.categories.map(category => ({
        category,
        leftVal: table.cells.get(category)?.get(leftGroup)?.value ?? (effectiveAgg === 'count' ? 0 : null),
        rightVal: table.cells.get(category)?.get(rightGroup)?.value ?? (effectiveAgg === 'count' ? 0 : null),
      }));
      if (table.excludedMissing > 0) {
        const what = effectiveAgg === 'count'
          ? `${colLabel(categoryCol)} or ${colLabel(groupCol)}`
          : `${colLabel(categoryCol)}, ${colLabel(groupCol)} or ${colLabel(numericCol)}`;
        notes.push(`${recordCount(table.excludedMissing)} excluded: no value for ${what}.`);
      }
      if (table.excludedOtherGroup > 0) {
        const others = groupValues.filter(v => v !== leftGroup && v !== rightGroup);
        notes.push(`${recordCount(table.excludedOtherGroup)} with ${colLabel(groupCol)} of ${others.join(', ')} not shown.`);
      }
    }

    if (rows.length === 0) return null;

    // Reading order: a declared order, then numeric-aware, so age bands run
    // 0-4, 5-9, 10-14 rather than 0-4, 10-14, 15-19, 5-9.
    const order = orderCategories(rows.map(r => r.category), categoryColumn);
    const byName = new Map(rows.map(r => [r.category, r]));
    const ordered = order.map(category => byName.get(category)!);

    return { rows: ordered, notes };
  }, [categoryCol, inputMode, leftValueCol, rightValueCol, numericCol, groupCol, leftGroup, rightGroup, groupValues, effectiveAgg, dataset, colLabel]);

  const pairedRows = paired?.rows ?? null;

  // Labels for the two sides
  const leftLabel = inputMode === 'two-columns' ? colLabel(leftValueCol) : leftGroup;
  const rightLabel = inputMode === 'two-columns' ? colLabel(rightValueCol) : rightGroup;

  // What the bars measure, stated on the axis
  const statistic = useMemo(() => {
    if (inputMode === 'two-columns') return effectiveAgg === 'sum' ? 'Sum' : 'Mean';
    if (effectiveAgg === 'count') return 'Number of records';
    return `${effectiveAgg === 'sum' ? 'Sum' : 'Mean'} of ${colLabel(numericCol)}`;
  }, [inputMode, effectiveAgg, numericCol, colLabel]);

  const defaultTitle = useMemo(() => {
    const label = colLabel;
    if (!categoryCol) return 'Paired Bar Chart';
    if (inputMode === 'two-columns') {
      return leftValueCol && rightValueCol
        ? `${label(leftValueCol)} and ${label(rightValueCol)} by ${label(categoryCol)}`
        : 'Paired Bar Chart';
    }
    if (!groupCol) return 'Paired Bar Chart';
    return effectiveAgg === 'count'
      ? `Records by ${label(categoryCol)} and ${label(groupCol)}`
      : `${statistic} by ${label(categoryCol)} and ${label(groupCol)}`;
  }, [categoryCol, inputMode, leftValueCol, rightValueCol, groupCol, effectiveAgg, statistic, colLabel]);
  const title = titleOverride ?? defaultTitle;

  // A pyramid is read with the youngest band at the bottom. Follow that when
  // every category opens with a number, and leave other categories reading
  // from the top like every other chart.
  const firstAtBottom = rowOrder === 'bottom'
    || (rowOrder === 'auto' && !!pairedRows && pairedRows.every(r => /^[<>~]?\s*\d/.test(r.category)));

  const svgContent = useMemo(() => {
    if (!pairedRows) return '';

    const rows = firstAtBottom ? [...pairedRows].reverse() : pairedRows;
    const isCount = inputMode === 'group-split' && effectiveAgg === 'count';

    const values = rows.flatMap(r => [r.leftVal, r.rightVal]).filter((v): v is number => v !== null);
    // One scale for both sides, through zero. A mean can be negative (a z-score
    // is, for most groups in a nutrition survey), and those bars must still be drawn.
    const scale = niceScale(Math.min(...values, 0), Math.max(...values, 0), { integer: isCount, maxIntervals: 4 });
    const decimals = isCount ? 0 : decimalsForValues(values);

    const width = 800;
    const sideMargin = 56;
    const categoryFont = 11;
    // The category names sit in a gutter between the two halves. They were
    // drawn on the centre line and then both bars were painted over them.
    const longest = Math.max(
      ...rows.map(r => estimateTextWidth(r.category, categoryFont)),
      estimateTextWidth(colLabel(categoryCol), 10),
      30
    );
    const gutter = Math.min(Math.max(longest + 20, 60), 220);
    const halfW = (width - sideMargin * 2 - gutter) / 2;
    const leftEnd = sideMargin + halfW;          // inner edge of the left half
    const rightStart = leftEnd + gutter;         // inner edge of the right half

    const span = scale.max - scale.min;
    // Mirrored: on the left a larger value lies further left.
    const xLeft = (v: number) => leftEnd - ((v - scale.min) / span) * halfW;
    const xRight = (v: number) => rightStart + ((v - scale.min) / span) * halfW;

    const header = svgHeader(width, title, subtitle || undefined);
    const plotTop = header.bottom + 32;
    const rowHeight = Math.max(Math.min(390 / rows.length, 34), 16);
    const barHeight = Math.min(rowHeight - 6, 22);
    const plotH = rowHeight * rows.length;
    const plotBottom = plotTop + plotH;
    const colors = getChartColors(2, colorScheme);

    let svg = header.svg;

    // Side headings, with the size of each group when the bars are counts
    const total = (side: 'leftVal' | 'rightVal') => rows.reduce((s, r) => s + (r[side] ?? 0), 0);
    const leftHeading = isCount ? `${leftLabel} (n = ${formatFixed(total('leftVal'), 0, locale)})` : leftLabel;
    const rightHeading = isCount ? `${rightLabel} (n = ${formatFixed(total('rightVal'), 0, locale)})` : rightLabel;
    svg += svgText(sideMargin + halfW / 2, plotTop - 12, fitText(leftHeading, halfW, 12, true), { fontSize: 12, fontWeight: 'bold', fill: colors[0] });
    svg += svgText(rightStart + halfW / 2, plotTop - 12, fitText(rightHeading, halfW, 12, true), { fontSize: 12, fontWeight: 'bold', fill: colors[1] });
    svg += svgText(leftEnd + gutter / 2, plotTop - 12, fitText(colLabel(categoryCol), gutter - 8, 10), { fontSize: 10, fill: '#6B7280' });

    // Grid lines and tick labels, the same values on both sides
    for (const tick of scale.ticks) {
      const label = formatTick(tick, scale, locale);
      for (const x of [xLeft(tick), xRight(tick)]) {
        svg += svgGridLine(x, plotTop, x, plotBottom);
        svg += svgText(x, plotBottom + 16, label, { fontSize: 10, fill: '#666' });
      }
    }

    // Bottom axes and the zero line each side's bars grow from
    svg += svgAxisLine(sideMargin, plotBottom, leftEnd, plotBottom);
    svg += svgAxisLine(rightStart, plotBottom, rightStart + halfW, plotBottom);
    svg += svgAxisLine(xLeft(0), plotTop, xLeft(0), plotBottom);
    svg += svgAxisLine(xRight(0), plotTop, xRight(0), plotBottom);

    rows.forEach((row, i) => {
      const cy = plotTop + i * rowHeight + rowHeight / 2;

      svg += svgText(leftEnd + gutter / 2, cy, fitText(row.category, gutter - 12, categoryFont), {
        fontSize: categoryFont, fill: '#333', dy: '0.35em',
      });

      const drawBar = (value: number | null, x: (v: number) => number, color: string, mirrored: boolean) => {
        if (value === null) return;
        const x0 = x(0);
        const x1 = x(value);
        if (value !== 0) {
          svg += `<rect x="${Math.min(x0, x1)}" y="${cy - barHeight / 2}" width="${Math.abs(x1 - x0)}" height="${barHeight}" fill="${color}" rx="2"/>`;
        }
        if (showLabels) {
          const text = formatFixed(value, decimals, locale);
          // +1 where larger x is away from the gutter, -1 where it is toward it.
          const away = mirrored ? -1 : 1;
          if (value >= 0) {
            // Past the end of the bar, on the outer side.
            svg += svgText(x1 + away * 4, cy, text, {
              anchor: mirrored ? 'end' : 'start', fontSize: 10, fill: '#444', dy: '0.35em',
            });
          } else if (Math.abs(x1 - x0) > estimateTextWidth(text, 10, true) + 10) {
            // A negative bar grows toward the gutter, where the category names
            // are, so its label goes inside the bar's end rather than past it.
            svg += svgText(x1 + away * 4, cy, text, {
              anchor: mirrored ? 'end' : 'start', fontSize: 10, fontWeight: 'bold', fill: '#fff', dy: '0.35em',
            });
          } else {
            svg += svgText(x0 + away * 4, cy, text, {
              anchor: mirrored ? 'end' : 'start', fontSize: 10, fill: '#444', dy: '0.35em',
            });
          }
        }
      };
      drawBar(row.leftVal, xLeft, colors[0], true);
      drawBar(row.rightVal, xRight, colors[1], false);
    });

    // What the bars measure
    svg += svgText(width / 2, plotBottom + 36, statistic, { fontSize: 12, fill: '#444' });

    const notes = [
      inputMode === 'two-columns'
        ? `Bars show the ${effectiveAgg} of each column per ${colLabel(categoryCol)}.`
        : isCount
          ? `Bars show the number of records in each ${colLabel(categoryCol)}, for ${colLabel(groupCol)} ${leftLabel} and ${rightLabel}.`
          : `Bars show the ${effectiveAgg} of ${colLabel(numericCol)} in each ${colLabel(categoryCol)}, for ${colLabel(groupCol)} ${leftLabel} and ${rightLabel}.`,
      ...(paired?.notes ?? []),
    ];
    const footer = svgFooter(width, plotBottom + 44, notes, source || undefined);

    return svgWrapper(width, footer.height, svg + footer.svg);
  }, [pairedRows, paired, firstAtBottom, inputMode, effectiveAgg, categoryCol, groupCol, numericCol, leftLabel, rightLabel, statistic, colorScheme, showLabels, title, subtitle, source, locale, colLabel]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    if (!pairedRows) {
      return { columns: [], rows: [] };
    }
    const columns = [
      { header: colLabel(categoryCol) || 'Category', key: 'category' },
      { header: `${leftLabel} (${statistic})`, key: 'leftVal' },
      { header: `${rightLabel} (${statistic})`, key: 'rightVal' },
    ];
    const rows = pairedRows.map(r => ({
      category: r.category,
      leftVal: r.leftVal,
      rightVal: r.rightVal,
    }));
    return {
      title,
      subtitle: subtitle || undefined,
      source: source || undefined,
      columns,
      rows,
    };
  }, [pairedRows, categoryCol, leftLabel, rightLabel, statistic, title, subtitle, source, colLabel]);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          <VariableMapper
            label="Category"
            description="Rows of the chart, such as age group"
            columns={catColumns}
            value={categoryCol}
            onChange={setCategoryCol}
            required
          />

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Input Mode</label>
            <select
              value={inputMode}
              onChange={(e) => setInputMode(e.target.value as InputMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="group-split">Split by a two-group variable</option>
              <option value="two-columns">Two numeric columns</option>
            </select>
          </div>

          {inputMode === 'two-columns' ? (
            <>
              <VariableMapper
                label="Left Value"
                description="Numeric column for left-side bars"
                columns={dataset.columns}
                value={leftValueCol}
                onChange={setLeftValueCol}
                filterTypes={['number']}
                required
              />
              <VariableMapper
                label="Right Value"
                description="Numeric column for right-side bars"
                columns={dataset.columns}
                value={rightValueCol}
                onChange={setRightValueCol}
                filterTypes={['number']}
                required
              />
            </>
          ) : (
            <>
              <VariableMapper
                label="Group Variable"
                description="The two sides of the chart, such as sex"
                columns={catColumns}
                value={groupCol}
                onChange={setGroupCol}
                required
              />
              {groupCol && groupValues.length < 2 && (
                <p className="text-xs text-red-600 -mt-2 mb-3">
                  This column has {groupValues.length} value{groupValues.length === 1 ? '' : 's'}. Two are needed.
                </p>
              )}
              {groupValues.length >= 2 && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Left side</label>
                    <select
                      value={leftGroup}
                      onChange={(e) => setLeftGroupChoice(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      {groupValues.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Right side</label>
                    <select
                      value={rightGroup}
                      onChange={(e) => setRightGroupChoice(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      {groupValues.filter(v => v !== leftGroup).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {groupValues.length > 2 && (
                <p className="text-xs text-gray-500 -mt-1 mb-3">
                  Records with any other value are left out and counted in a note under the chart.
                </p>
              )}
            </>
          )}

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Bars show</label>
            <select
              value={effectiveAgg}
              onChange={(e) => setAggMode(e.target.value as PairedAggMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {inputMode === 'group-split' && <option value="count">Number of records</option>}
              <option value="mean">Mean of a numeric variable</option>
              <option value="sum">Sum of a numeric variable</option>
            </select>
          </div>

          {inputMode === 'group-split' && effectiveAgg !== 'count' && (
            <VariableMapper
              label="Numeric Value"
              description="Value to compare between the two groups"
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

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Row Order</label>
            <select
              value={rowOrder}
              onChange={(e) => setRowOrder(e.target.value as RowOrder)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="auto">Automatic (age bands from the bottom up)</option>
              <option value="top">First category at the top</option>
              <option value="bottom">First category at the bottom</option>
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

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show data labels
          </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <VisualizationTip
          tip="Paired bar charts (population pyramids) compare two groups across the same categories, such as an age-sex distribution."
          context="Try this: Category = Age Group, Group Variable = Sex. The chart counts the records in each."
        />

        <div className="border border-blue-100 rounded-lg overflow-hidden">
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
              <p>• Comparing two groups as mirrored bars (e.g., age-sex pyramids)</p>
              <p>• Displaying population structure by age and sex</p>
              <p>• Comparing disease burden between two demographic groups</p>
              <p>• When you have a binary grouping variable (male/female, exposed/unexposed)</p>
              <p className="text-blue-500 italic mt-2">Age-sex pyramids are standard tools in CDC field epidemiology for understanding population structure in outbreak contexts.</p>
            </div>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-w-0">
        {svgContent ? (
          <ChartContainer
            title={title}
            svgContent={svgContent}
            excelData={excelData}
            filename="paired-bar-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure data mapping to create a paired bar chart</p>
            <p className="text-gray-400 text-sm mt-2">Select a category and a variable with two groups using the panel on the left</p>
          </div>
        )}
      </div>
    </div>
  );
}
