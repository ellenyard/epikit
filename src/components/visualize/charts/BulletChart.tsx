import { useState, useMemo, useCallback } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { getChartColor, type ChartColorScheme } from '../../../utils/chartColors';
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
import { aggregatePairByCategory, type AggregationMode } from '../../../utils/chartAggregation';
import { categoryColumns, categoriesInColumn, numberOf, orderCategories, byCategoryOrder } from '../../../utils/chartCategories';
import { niceScale, formatTick, formatFixed, decimalsForValues } from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

interface BulletChartProps {
  dataset: Dataset;
}

export function BulletChart({ dataset }: BulletChartProps) {
  const { config: locale } = useLocale();
  const [categoryVar, setCategoryVar] = useState('');
  const [actualVar, setActualVar] = useState('');
  const [targetVar, setTargetVar] = useState('');
  const [aggMode, setAggMode] = useState<AggregationMode>('mean');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showValueLabels, setShowValueLabels] = useState(true);
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

  const categoryColumn = useMemo(
    () => dataset.columns.find(c => c.key === categoryVar),
    [dataset.columns, categoryVar]
  );

  // Count unique categories for warning
  const uniqueCategories = useMemo(
    () => categoriesInColumn(dataset.records, categoryColumn).length,
    [categoryColumn, dataset.records]
  );

  // Detect negative source values (bullet charts can only draw from a zero baseline)
  const hasNegativeValues = useMemo(() => {
    if (!actualVar && !targetVar) return false;
    for (const rec of dataset.records) {
      for (const key of [actualVar, targetVar]) {
        if (!key) continue;
        const v = numberOf(rec[key]);
        if (v !== null && v < 0) return true;
      }
    }
    return false;
  }, [actualVar, targetVar, dataset.records]);

  // Rows in reading order: a declared order first, then numeric-aware. They
  // used to appear in whatever order their first record came.
  const rows = useMemo(() => {
    if (!categoryVar || !actualVar || !targetVar) return [];
    const aggregated = aggregatePairByCategory(dataset.records, categoryVar, actualVar, targetVar, aggMode);
    const order = orderCategories(aggregated.map(a => a.category), categoryColumn);
    return aggregated
      .map(a => ({ category: a.category, actual: a.valueA, target: a.valueB }))
      .sort(byCategoryOrder(order, r => r.category));
  }, [categoryVar, actualVar, targetVar, aggMode, categoryColumn, dataset.records]);

  const aggWord = aggMode === 'count' ? 'Number of values recorded' : `${aggMode[0].toUpperCase()}${aggMode.slice(1)}`;
  const defaultTitle = rows.length === 0
    ? 'Bullet Chart'
    : `${colLabel(actualVar)} against ${colLabel(targetVar)} by ${colLabel(categoryVar)}`;
  const title = titleOverride ?? defaultTitle;

  const svgContent = useMemo(() => {
    if (rows.length === 0) return '';

    const dims = getDefaultDimensions('bullet');
    const barHeight = 26;
    const barGap = 10;
    const totalBarArea = rows.length * (barHeight + barGap) - barGap;
    const width = dims.width;

    const labelFont = 12;
    const names = rows.map(r => fitText(r.category, 220, labelFont));
    const plotLeft = Math.max(60, Math.max(...names.map(n => estimateTextWidth(n, labelFont))) + 20);
    const plotRight = width - 56;
    const plotWidth = plotRight - plotLeft;

    const header = svgHeader(width, title, subtitle || undefined);
    const legendY = header.bottom + 14;
    const plotTop = legendY + 20;

    // Value scale from zero, with round ticks
    const allValues = rows.flatMap(r => [r.actual, r.target]);
    const scale = niceScale(0, Math.max(...allValues, 0), { integer: aggMode === 'count' });
    const decimals = aggMode === 'count' ? 0 : decimalsForValues(allValues);
    const xScale = (v: number) => plotLeft + (Math.max(v, 0) / scale.max) * plotWidth;

    // One colour for every bar. Each row used to take the next palette colour,
    // which meant nothing and, in the grey and sequential schemes, left the
    // later rows paler than the track behind them.
    const barColor = getChartColor(0, colorScheme);

    let svg = header.svg;

    // Legend: what the bar is and what the marker is
    const actualLabel = fitText(colLabel(actualVar), 260, 11);
    svg += `<rect x="${plotLeft}" y="${legendY - 4}" width="18" height="8" fill="${barColor}" rx="2"/>`;
    svg += svgText(plotLeft + 24, legendY, actualLabel, { anchor: 'start', fontSize: 11, fill: '#444', dy: '0.35em' });
    const second = plotLeft + 24 + estimateTextWidth(actualLabel, 11) + 24;
    svg += `<line x1="${second}" y1="${legendY - 7}" x2="${second}" y2="${legendY + 7}" stroke="#111" stroke-width="2.5"/>`;
    svg += svgText(second + 8, legendY, fitText(`Target: ${colLabel(targetVar)}`, 280, 11), { anchor: 'start', fontSize: 11, fill: '#444', dy: '0.35em' });

    // X-axis gridlines and labels
    for (const tick of scale.ticks) {
      const x = xScale(tick);
      svg += svgGridLine(x, plotTop, x, plotTop + totalBarArea);
      svg += svgText(x, plotTop + totalBarArea + 18, formatTick(tick, scale, locale), {
        anchor: 'middle',
        fontSize: 11,
        fill: '#666',
      });
    }

    // Bottom axis line
    svg += svgAxisLine(plotLeft, plotTop + totalBarArea, plotRight, plotTop + totalBarArea);

    // Draw each bullet row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const y = plotTop + i * (barHeight + barGap);

      // Category label on left
      svg += svgText(plotLeft - 10, y + barHeight / 2, names[i], {
        anchor: 'end',
        fontSize: labelFont,
        fill: '#333',
        dy: '0.35em',
      });

      // A plain track across the full range. There was a darker band inside it
      // ending at three quarters of the axis maximum; it looked like a
      // threshold and was only an artefact of where the axis happened to stop.
      svg += `<rect x="${plotLeft}" y="${y}" width="${plotWidth}" height="${barHeight}" fill="#EEF0F2" rx="3"/>`;

      // Actual value bar (clamp negatives to the zero baseline)
      const actualEnd = xScale(row.actual);
      const innerBarHeight = barHeight * 0.46;
      const innerBarY = y + (barHeight - innerBarHeight) / 2;
      svg += `<rect x="${plotLeft}" y="${innerBarY}" width="${actualEnd - plotLeft}" height="${innerBarHeight}" fill="${barColor}" rx="2"/>`;

      // Target marker line
      const targetX = xScale(row.target);
      svg += `<line x1="${targetX}" y1="${y + 2}" x2="${targetX}" y2="${y + barHeight - 2}" stroke="#111" stroke-width="2.5"/>`;

      // Value labels: the actual value, and the target it is measured against
      if (showValueLabels) {
        const actualText = formatFixed(row.actual, decimals, locale);
        // Keep the label clear of the target marker when the two are close.
        const labelX = actualEnd + 4;
        const collides = targetX > labelX - 2 && targetX < labelX + estimateTextWidth(actualText, 10, true) + 4;
        svg += svgText(collides ? targetX + 6 : labelX, innerBarY + innerBarHeight / 2, actualText, {
          anchor: 'start',
          fontSize: 10,
          fill: '#333',
          fontWeight: 'bold',
          dy: '0.35em',
        });
      }
    }

    // What the axis measures
    svg += svgText(plotLeft + plotWidth / 2, plotTop + totalBarArea + 38, fitText(`${aggWord} per ${colLabel(categoryVar)}`, plotWidth, 12), { fontSize: 12, fill: '#444' });

    const dropped = uniqueCategories - rows.length;
    const notes = [
      aggMode === 'count'
        ? `Bars and markers show how many records have a value in each column, per ${colLabel(categoryVar)}.`
        : `Bars show the ${aggMode} of ${colLabel(actualVar)} and markers the ${aggMode} of ${colLabel(targetVar)}, per ${colLabel(categoryVar)}.`,
    ];
    if (dropped > 0) {
      notes.push(`${dropped} ${dropped === 1 ? 'category is' : 'categories are'} not shown: no value in one of the two columns.`);
    }
    if (hasNegativeValues) notes.push('Negative values are drawn at zero.');
    const footer = svgFooter(width, plotTop + totalBarArea + 44, notes, source || undefined);

    return svgWrapper(width, footer.height, svg + footer.svg);
  }, [rows, uniqueCategories, hasNegativeValues, categoryVar, actualVar, targetVar, aggMode, aggWord, colorScheme, showValueLabels, title, subtitle, source, locale, colLabel]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    if (rows.length === 0) {
      return { columns: [], rows: [] };
    }
    const columns = [
      { header: colLabel(categoryVar), key: 'category' },
      { header: `${colLabel(actualVar)} (${aggWord.toLowerCase()})`, key: 'actual' },
      { header: `${colLabel(targetVar)} (${aggWord.toLowerCase()})`, key: 'target' },
    ];
    return {
      title,
      subtitle: subtitle || undefined,
      source: source || undefined,
      columns,
      rows: rows.map(r => ({ category: r.category, actual: r.actual, target: r.target })),
    };
  }, [rows, categoryVar, actualVar, targetVar, aggWord, title, subtitle, source, colLabel]);

  const isReady = categoryVar && actualVar && targetVar;

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <VisualizationTip
          tip="Bullet charts are ideal for comparing actual performance to a target. Data is automatically aggregated by category (e.g., mean per age group)."
          context="Try this: Category=Age Group, Actual=Vitamin A Coverage (%), Target=Target Vitamin A Coverage (%)"
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
              <p>• Comparing actual values against a target or benchmark</p>
              <p>• Showing how far each group is from where it should be</p>
              <p>• Monitoring vaccination coverage against WHO/national targets</p>
              <p>• Dashboard-style displays of key performance indicators</p>
              <p className="text-blue-500 italic mt-2">Useful for comparing actual surveillance metrics against established targets or benchmarks.</p>
            </div>
          )}
        </div>

        {/* Data point warning */}
        {uniqueCategories > 30 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <strong>{uniqueCategories} categories detected.</strong> Bullet charts work best with 3-15 categories. Consider using a column with fewer unique values.
            </p>
          </div>
        )}

        {/* Negative value warning */}
        {hasNegativeValues && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <strong>Negative values detected.</strong> Bullet charts draw from a zero baseline, so negative actual or target values are drawn at zero. A dumbbell chart shows them as they are.
            </p>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Variables</h4>

          <VariableMapper
            label="Category"
            description="Label for each bullet row"
            columns={catColumns}
            value={categoryVar}
            onChange={setCategoryVar}
            required
          />

          <VariableMapper
            label="Actual Value"
            description="The measured performance value"
            columns={dataset.columns}
            value={actualVar}
            onChange={setActualVar}
            filterTypes={['number']}
            required
          />

          <VariableMapper
            label="Target Value"
            description="The benchmark or goal value"
            columns={dataset.columns}
            value={targetVar}
            onChange={setTargetVar}
            filterTypes={['number']}
            required
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Styling</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Aggregation</label>
            <select
              value={aggMode}
              onChange={(e) => setAggMode(e.target.value as AggregationMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="mean">Mean (average)</option>
              <option value="sum">Sum (total)</option>
              <option value="count">Count (frequency)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">How to combine multiple records per category</p>
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
              <option value="blue">Blue</option>
              <option value="warm">Warm</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showValueLabels}
              onChange={(e) => setShowValueLabels(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show value labels
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Labels</h4>

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
              placeholder="Optional"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional"
            />
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-w-0">
        {isReady && svgContent ? (
          <ChartContainer
            title={title}
            svgContent={svgContent}
            excelData={excelData}
            filename="bullet-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure the chart</p>
            <p className="text-gray-400 text-sm mt-2">
              Select a category variable, an actual value column, and a target value column to generate the bullet chart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
