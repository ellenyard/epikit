import { useState, useMemo, useCallback } from 'react';
import { ChartContainer } from '../shared/ChartContainer';
import { CHART_ROW_CLASS, SETTINGS_COLUMN_CLASS, CHART_COLUMN_CLASS, type ChartProps } from '../shared/ChartLayout';
import { pickCategoryColumn, pickTargetPair, resolveColumnChoice } from '../../../utils/chartDefaults';
import { chartTitle } from '../../../utils/chartTitles';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
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
  estimateTextWidth,
  type ExcelExportData,
} from '../../../utils/chartExport';
import { aggregatePairByCategory } from '../../../utils/chartAggregation';
import { categoryColumns, categoriesInColumn, orderCategories, byCategoryOrder } from '../../../utils/chartCategories';
import { niceScale, formatTick, formatFixed, decimalsForValues } from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

type SortMode = 'gap-desc' | 'gap-asc' | 'value1' | 'category';
type DumbbellAggregation = 'mean' | 'sum';

interface DumbbellPoint {
  category: string;
  value1: number;
  value2: number;
  gap: number;
}

export function DumbbellChart({ dataset, filterNote = '' }: ChartProps) {
  const { config: locale } = useLocale();
  const [categoryColChoice, setCategoryCol] = useState('');
  const [value1ColChoice, setValue1Col] = useState('');
  const [value2ColChoice, setValue2Col] = useState('');
  // The dots were always a mean, though nothing on the chart said so.
  const [aggregation, setAggregation] = useState<DumbbellAggregation>('mean');
  const [sortMode, setSortMode] = useState<SortMode>('gap-desc');
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

  // The user's choices while they are valid for the dataset, else the first
  // drawing the data supports: a measured column against the column named
  // as its target. Without such a pair the chart waits to be told.
  const targetPair = useMemo(() => pickTargetPair(dataset), [dataset]);
  const autoCategory = useMemo(() => (targetPair.target ? pickCategoryColumn(dataset) : ''), [dataset, targetPair]);
  const categoryCol = resolveColumnChoice(dataset, categoryColChoice, autoCategory);
  const value1Col = resolveColumnChoice(dataset, value1ColChoice, targetPair.actual, true);
  const value2Col = resolveColumnChoice(dataset, value2ColChoice, targetPair.target, true);

  // Process data
  const dumbbell = useMemo((): { points: DumbbellPoint[]; dropped: number } => {
    if (!categoryCol || !value1Col || !value2Col) return { points: [], dropped: 0 };
    const categoryColumn = dataset.columns.find(c => c.key === categoryCol);

    // Each column is summarised over the records that have it. A record with
    // only one of the two values used to be dropped from both.
    const pairs = aggregatePairByCategory(dataset.records, categoryCol, value1Col, value2Col, aggregation);
    const points: DumbbellPoint[] = pairs.map(p => ({
      category: p.category,
      value1: p.valueA,
      value2: p.valueB,
      gap: Math.abs(p.valueB - p.valueA),
    }));

    // Reading order first, so ties in any other sort fall in that order too
    const order = orderCategories(points.map(p => p.category), categoryColumn);
    points.sort(byCategoryOrder(order, p => p.category));
    if (sortMode === 'gap-desc') points.sort((a, b) => b.gap - a.gap);
    else if (sortMode === 'gap-asc') points.sort((a, b) => a.gap - b.gap);
    else if (sortMode === 'value1') points.sort((a, b) => b.value1 - a.value1);

    const dropped = categoriesInColumn(dataset.records, categoryColumn).length - points.length;
    return { points, dropped };
  }, [dataset.records, dataset.columns, categoryCol, value1Col, value2Col, aggregation, sortMode]);

  const dumbbellData = dumbbell.points;

  const statistic = `${aggregation === 'sum' ? 'Sum' : 'Mean'} per ${colLabel(categoryCol)}`;
  const defaultTitle = dumbbellData.length === 0
    ? 'Dumbbell Chart'
    : chartTitle(`${colLabel(value1Col)} and ${colLabel(value2Col)}`, colLabel(categoryCol));
  const title = titleOverride ?? defaultTitle;

  // Generate SVG
  const svgContent = useMemo(() => {
    if (dumbbellData.length === 0) return '';

    const dims = getDefaultDimensions('dumbbell');
    const rowHeight = 28;
    const width = dims.width;
    const labelFont = 11;
    const names = dumbbellData.map(d => fitText(d.category, 210, labelFont));
    const margin = {
      left: Math.max(60, Math.max(...names.map(n => estimateTextWidth(n, labelFont))) + 18),
      right: dims.margin.right,
    };
    const plotW = width - margin.left - margin.right;
    const plotH = dumbbellData.length * rowHeight;

    // Value axis: round ticks through zero
    const allValues = dumbbellData.flatMap(d => [d.value1, d.value2]);
    const scale = niceScale(Math.min(...allValues), Math.max(...allValues));
    const decimals = decimalsForValues(allValues);
    const fmt = (v: number) => formatFixed(v, decimals, locale);

    const colors = getChartColors(2, colorScheme);
    const dotRadius = 6;

    // Legend under the title block. It used to sit at a fixed height that a
    // subtitle was printed straight through, with its second entry at a fixed
    // offset that a long first label overran.
    const header = svgHeader(width, title, subtitle || undefined);
    const legendY = header.bottom + 14;
    const plotTop = legendY + 22;
    const plotBottom = plotTop + plotH;

    const xScale = (v: number) => margin.left + ((v - scale.min) / (scale.max - scale.min)) * plotW;
    const yScale = (i: number) => plotTop + (i + 0.5) * rowHeight;

    let svg = header.svg;

    const col1Label = fitText(colLabel(value1Col), 280, 11);
    const col2Label = fitText(colLabel(value2Col), 280, 11);
    svg += `<circle cx="${margin.left + 4}" cy="${legendY}" r="4" fill="${colors[0]}"/>`;
    svg += svgText(margin.left + 12, legendY, col1Label, { anchor: 'start', fontSize: 11, fill: '#444', dy: '0.35em' });
    const second = margin.left + 12 + estimateTextWidth(col1Label, 11) + 24;
    svg += `<circle cx="${second}" cy="${legendY}" r="4" fill="${colors[1]}"/>`;
    svg += svgText(second + 8, legendY, col2Label, { anchor: 'start', fontSize: 11, fill: '#444', dy: '0.35em' });

    // Vertical gridlines
    for (const tick of scale.ticks) {
      const x = xScale(tick);
      svg += svgGridLine(x, plotTop, x, plotBottom);
      svg += svgText(x, plotBottom + 18, formatTick(tick, scale, locale), {
        anchor: 'middle', fontSize: 11, fill: '#666',
      });
    }

    // Axes
    svg += svgAxisLine(xScale(0), plotTop, xScale(0), plotBottom);
    svg += svgAxisLine(margin.left, plotBottom, margin.left + plotW, plotBottom);

    // Draw dumbbells
    for (let i = 0; i < dumbbellData.length; i++) {
      const point = dumbbellData[i];
      const y = yScale(i);
      const x1 = xScale(point.value1);
      const x2 = xScale(point.value2);

      // Category label
      svg += svgText(margin.left - 8, y, names[i], {
        anchor: 'end', fontSize: labelFont, fill: '#333', dy: '0.35em',
      });

      // Connecting line
      svg += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#BBBFC4" stroke-width="2.5"/>`;

      // Dot 1
      svg += `<circle cx="${x1}" cy="${y}" r="${dotRadius}" fill="${colors[0]}" stroke="white" stroke-width="1.5"/>`;

      // Dot 2
      svg += `<circle cx="${x2}" cy="${y}" r="${dotRadius}" fill="${colors[1]}" stroke="white" stroke-width="1.5"/>`;

      // Value labels
      if (showLabels) {
        const lab1 = fmt(point.value1);
        const lab2 = fmt(point.value2);
        // Position labels on the outer sides of each dot
        const leftDot = x1 < x2 ? x1 : x2;
        const rightDot = x1 < x2 ? x2 : x1;
        const leftLabel = x1 < x2 ? lab1 : lab2;
        const rightLabel = x1 < x2 ? lab2 : lab1;

        // A dot near the left edge has no room beside it: its label would be
        // printed over the category name. It goes above the dot instead.
        const leftRoom = leftDot - dotRadius - 3 - estimateTextWidth(leftLabel, 10) >= margin.left + 2;
        if (leftRoom) {
          svg += svgText(leftDot - dotRadius - 3, y, leftLabel, { anchor: 'end', fontSize: 10, fill: '#444', dy: '0.35em' });
        } else {
          svg += svgText(Math.max(leftDot, margin.left + estimateTextWidth(leftLabel, 10) / 2 + 2), y - dotRadius - 3, leftLabel, { anchor: 'middle', fontSize: 9, fill: '#444' });
        }
        svg += svgText(rightDot + dotRadius + 3, y, rightLabel, { anchor: 'start', fontSize: 10, fill: '#444', dy: '0.35em' });
      }
    }

    // What the dots measure
    svg += svgText(margin.left + plotW / 2, plotBottom + 38, fitText(statistic, plotW, 12), { fontSize: 12, fill: '#444' });

    const notes = [
      `Dots show the ${aggregation} of each column per ${colLabel(categoryCol)}.`,
    ];
    if (dumbbell.dropped > 0) {
      notes.push(`${dumbbell.dropped} ${dumbbell.dropped === 1 ? 'category is' : 'categories are'} not shown: no value in one of the two columns.`);
    }
    if (filterNote) notes.push(filterNote);
    const footer = svgFooter(width, plotBottom + 44, notes, source || undefined);

    return svgWrapper(width, footer.height, svg + footer.svg);
  }, [dumbbellData, dumbbell.dropped, aggregation, statistic, showLabels, colorScheme, title, subtitle, source, categoryCol, value1Col, value2Col, locale, colLabel, filterNote]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const columns = [
      { header: colLabel(categoryCol) || 'Category', key: 'category' },
      { header: colLabel(value1Col), key: 'value1' },
      { header: colLabel(value2Col), key: 'value2' },
      { header: 'Gap', key: 'gap' },
    ];
    const rows = dumbbellData.map(d => ({
      category: d.category,
      value1: d.value1,
      value2: d.value2,
      gap: d.gap,
    }));
    return {
      title,
      subtitle: subtitle ? `${subtitle} (${statistic})` : statistic,
      source: source || undefined,
      columns,
      rows,
    };
  }, [dumbbellData, title, subtitle, source, categoryCol, value1Col, value2Col, statistic, colLabel]);

  return (
    <div className={CHART_ROW_CLASS}>
      {/* Config panel */}
      <div className={SETTINGS_COLUMN_CLASS}>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Dumbbell Chart Configuration</h3>

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
                <p>{'\u2022'} Comparing two values per category (e.g., before/after, male/female, vaccinated/unvaccinated)</p>
                <p>{'\u2022'} Showing the gap or disparity between two groups across many categories</p>
                <p>{'\u2022'} When you have 5{'\u2013'}20+ categories and need a cleaner look than grouped bars</p>
                <p className="text-blue-500 italic mt-2">Aligns with CDC COVE principles for reducing visual clutter in comparisons.</p>
              </div>
            )}
          </div>

          <VisualizationTip
            tip="Dumbbell charts excel at showing the gap between two values. The connecting line makes disparities immediately visible, so viewers can quickly spot which categories have the largest or smallest gaps."
            context="Best for comparing exactly two values per category, such as pre/post intervention or between two demographic groups."
          />

          <VariableMapper
            label="Category"
            description="Categorical variable for each row"
            columns={catColumns}
            value={categoryCol}
            onChange={setCategoryCol}
            required
          />

          <VariableMapper
            label="Value 1"
            description="First numeric column (e.g., before, group A)"
            columns={dataset.columns}
            value={value1Col}
            onChange={setValue1Col}
            filterTypes={['number']}
            required
          />

          <VariableMapper
            label="Value 2"
            description="Second numeric column (e.g., after, group B)"
            columns={dataset.columns}
            value={value2Col}
            onChange={setValue2Col}
            filterTypes={['number']}
            required
          />

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Summarise As</label>
            <select
              value={aggregation}
              onChange={e => setAggregation(e.target.value as DumbbellAggregation)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="mean">Mean per category</option>
              <option value="sum">Sum per category</option>
            </select>
          </div>

          {/* Sort mode */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="gap-desc">Gap (largest first)</option>
              <option value="gap-asc">Gap (smallest first)</option>
              <option value="value1">Value 1 (high to low)</option>
              <option value="category">Category order</option>
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
        </div>

        {/* Display options */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Display Options</h4>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={e => setShowLabels(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Show value labels
          </label>
        </div>

        {/* Annotations */}
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
      <div className={CHART_COLUMN_CLASS}>
        {svgContent ? (
          <ChartContainer
            title={title}
            svgContent={svgContent}
            excelData={excelData}
            filename="dumbbell-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure the dumbbell chart</p>
            <p className="text-gray-400 text-sm mt-2">
              Select a category, and two numeric value columns to compare.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
