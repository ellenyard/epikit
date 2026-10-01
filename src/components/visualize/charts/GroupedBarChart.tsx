import { useState, useMemo, useCallback } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { getChartColors, textColorOn, type ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgHeader,
  svgFooter,
  svgText,
  svgAxisLine,
  svgGridLine,
  fitText,
  fitRotatedLabel,
  estimateTextWidth,
  type ExcelExportData,
} from '../../../utils/chartExport';
import { crossAggregate, type CrossAggregationMode } from '../../../utils/chartAggregation';
import { categoryColumns, orderCategories, recordCount } from '../../../utils/chartCategories';
import { niceScale, formatTick, formatFixed, decimalsForValues } from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

interface GroupedBarChartProps {
  dataset: Dataset;
}

type DisplayMode = 'grouped' | 'stacked' | 'percent';

export function GroupedBarChart({ dataset }: GroupedBarChartProps) {
  const { config: locale } = useLocale();
  const [categoryVar, setCategoryVar] = useState('');
  const [groupVar, setGroupVar] = useState('');
  // What a bar measures. "Numeric column" used to mean a sum without saying
  // so, which on a column of rates adds percentages together.
  const [valueMode, setValueMode] = useState<CrossAggregationMode>('count');
  const [valueVar, setValueVar] = useState('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grouped');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showDataLabels, setShowDataLabels] = useState(true);
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

  // Build data structure: category -> group -> value
  const chartData = useMemo(() => {
    if (!categoryVar || !groupVar) return null;
    if (valueMode !== 'count' && !valueVar) return null;

    const table = crossAggregate(
      dataset.records, categoryVar, groupVar, valueMode === 'count' ? null : valueVar, valueMode
    );
    if (table.categories.length === 0) return null;

    const dataMap = new Map<string, Map<string, number>>();
    for (const [cat, row] of table.cells) {
      dataMap.set(cat, new Map(Array.from(row, ([grp, cell]) => [grp, cell.value])));
    }

    // Count negative aggregated values. A stack cannot hold them.
    let negativeCount = 0;
    for (const catGroups of dataMap.values()) {
      for (const v of catGroups.values()) {
        if (v < 0) negativeCount++;
      }
    }

    // Both axes in reading order: a declared order first, then numeric-aware.
    // Categories used to appear in the order their first record happened to
    // come, and groups in a bare sort.
    const categoryOrder = orderCategories(table.categories, dataset.columns.find(c => c.key === categoryVar));
    const groupValues = orderCategories(table.groups, dataset.columns.find(c => c.key === groupVar));
    return { dataMap, groupValues, categoryOrder, negativeCount, excluded: table.excludedMissing };
  }, [categoryVar, groupVar, valueMode, valueVar, dataset.records, dataset.columns]);

  // What a bar measures, for the axis and the notes
  const statistic = valueMode === 'count'
    ? 'Number of records'
    : `${valueMode === 'sum' ? 'Sum' : 'Mean'} of ${colLabel(valueVar)}`;
  // A mean cannot be stacked into a total or a share, so those modes fall back to side by side.
  const effectiveDisplay: DisplayMode = valueMode === 'mean' ? 'grouped' : displayMode;

  const defaultTitle = !categoryVar || !groupVar
    ? 'Grouped Bar Chart'
    : `${valueMode === 'count' ? 'Records' : statistic} by ${colLabel(categoryVar)} and ${colLabel(groupVar)}`;
  const title = titleOverride ?? defaultTitle;

  const svgContent = useMemo(() => {
    if (!chartData) return '';

    const { dataMap, groupValues, categoryOrder } = chartData;
    const colors = getChartColors(groupValues.length, colorScheme);

    const dims = getDefaultDimensions('grouped');
    const width = dims.width;
    const plotLeft = 72;
    const plotRight = width - 30;
    const plotWidth = plotRight - plotLeft;

    // Legend under the title block, wrapped to as many rows as it needs. It
    // used to be one fixed-pitch row at the bottom, which ran off both edges
    // with many groups and sat on top of the source line.
    const header = svgHeader(width, title, subtitle || undefined);
    const legendTitle = `${colLabel(groupVar)}:`;
    const legendRows: { text: string; index: number; x: number }[][] = [[]];
    let lx = plotLeft + estimateTextWidth(legendTitle, 11, true) + 10;
    groupValues.forEach((group, index) => {
      const text = fitText(group, 170, 11);
      const itemWidth = 18 + estimateTextWidth(text, 11) + 16;
      if (lx + itemWidth > width - 10 && legendRows[legendRows.length - 1].length > 0) {
        legendRows.push([]);
        lx = plotLeft;
      }
      legendRows[legendRows.length - 1].push({ text, index, x: lx });
      lx += itemWidth;
    });
    const legendTop = header.bottom + 10;
    const plotTop = legendTop + legendRows.length * 18 + 16;
    const plotHeight = dims.height - 170;
    const plotBottom = plotTop + plotHeight;

    // Value scale
    const allValues: number[] = [];
    for (const catGroups of dataMap.values()) {
      if (effectiveDisplay === 'grouped') {
        allValues.push(...catGroups.values());
      } else {
        let total = 0;
        for (const v of catGroups.values()) if (v > 0) total += v; // negative values are left out of a stack
        allValues.push(total);
      }
    }
    const scale = effectiveDisplay === 'percent'
      ? niceScale(0, 100, { maxIntervals: 5 })
      : niceScale(Math.min(...allValues, 0), Math.max(...allValues, 0), { integer: valueMode === 'count' });
    const span = scale.max - scale.min;
    const yScale = (v: number) => plotBottom - ((v - scale.min) / span) * plotHeight;
    const zeroY = yScale(0);
    const decimals = valueMode === 'count' ? 0 : decimalsForValues(allValues);
    const fmt = (v: number) => formatFixed(v, decimals, locale);

    // Compute bar widths
    const categoryCount = categoryOrder.length;
    const categoryWidth = plotWidth / categoryCount;
    const categoryPadding = categoryWidth * 0.15;
    const barAreaWidth = categoryWidth - categoryPadding * 2;

    let svg = header.svg;

    // Legend
    svg += svgText(plotLeft, legendTop + 9, legendTitle, { anchor: 'start', fontSize: 11, fontWeight: 'bold', fill: '#444', dy: '0.35em' });
    legendRows.forEach((row, r) => {
      const y = legendTop + 9 + r * 18;
      for (const item of row) {
        svg += `<rect x="${item.x}" y="${y - 6}" width="12" height="12" fill="${colors[item.index]}" rx="2"/>`;
        svg += svgText(item.x + 18, y, item.text, { anchor: 'start', fontSize: 11, fill: '#333', dy: '0.35em' });
      }
    });

    // Y-axis gridlines and labels
    for (const tick of scale.ticks) {
      const y = yScale(tick);
      svg += svgGridLine(plotLeft, y, plotRight, y);
      svg += svgText(plotLeft - 10, y, formatTick(tick, scale, locale, effectiveDisplay === 'percent' ? '%' : ''), {
        anchor: 'end',
        fontSize: 11,
        fill: '#666',
        dy: '0.35em',
      });
    }

    // Axes: the left edge, and the zero line the bars grow from
    svg += svgAxisLine(plotLeft, plotTop, plotLeft, plotBottom);
    svg += svgAxisLine(plotLeft, zeroY, plotRight, zeroY);

    // Draw bars
    categoryOrder.forEach((cat, ci) => {
      const groupMap = dataMap.get(cat);
      if (!groupMap) return;
      const x0 = plotLeft + ci * categoryWidth + categoryPadding;

      if (effectiveDisplay === 'grouped') {
        const barWidth = barAreaWidth / groupValues.length;
        const barPadding = Math.min(2, barWidth * 0.1);
        groupValues.forEach((grp, gi) => {
          const value = groupMap.get(grp);
          if (value === undefined) return;
          const x = x0 + gi * barWidth + barPadding;
          const w = barWidth - barPadding * 2;
          const endY = yScale(value);
          svg += `<rect x="${x}" y="${Math.min(zeroY, endY)}" width="${w}" height="${Math.abs(endY - zeroY)}" fill="${colors[gi]}" rx="2"/>`;
          // A label wider than its bar would run into its neighbours' labels.
          if (showDataLabels && estimateTextWidth(fmt(value), 10, true) <= barWidth + 2) {
            svg += svgText(x + w / 2, value >= 0 ? endY - 4 : endY + 12, fmt(value), {
              anchor: 'middle', fontSize: 10, fill: '#333', fontWeight: 'bold',
            });
          }
        });
        return;
      }

      // Stacked, as totals or as shares of the category
      let total = 0;
      for (const v of groupMap.values()) if (v > 0) total += v;
      if (total === 0) return;
      let cumulative = 0;
      groupValues.forEach((grp, gi) => {
        const value = groupMap.get(grp) || 0;
        if (value <= 0) return;
        const from = effectiveDisplay === 'percent' ? (cumulative / total) * 100 : cumulative;
        cumulative += value;
        const to = effectiveDisplay === 'percent' ? (cumulative / total) * 100 : cumulative;
        const top = yScale(to);
        const segH = yScale(from) - top;
        svg += `<rect x="${x0}" y="${top}" width="${barAreaWidth}" height="${segH}" fill="${colors[gi]}"/>`;

        const text = effectiveDisplay === 'percent'
          ? `${formatFixed((value / total) * 100, 1, locale)}%`
          : fmt(value);
        if (showDataLabels && segH > 14 && estimateTextWidth(text, 10, true) <= barAreaWidth) {
          // Dark text on a light segment, white on a dark one.
          svg += svgText(x0 + barAreaWidth / 2, top + segH / 2, text, {
            anchor: 'middle', fontSize: 10, fill: textColorOn(colors[gi]), fontWeight: 'bold', dy: '0.35em',
          });
        }
      });
      // Total on top of a stack; n on top of a 100% bar, the denominator of its shares
      if (showDataLabels) {
        const topY = yScale(effectiveDisplay === 'percent' ? 100 : total);
        const text = effectiveDisplay === 'percent'
          ? (valueMode === 'count' ? `n = ${fmt(total)}` : '')
          : fmt(total);
        if (text && estimateTextWidth(text, 10, true) <= categoryWidth) {
          svg += svgText(x0 + barAreaWidth / 2, topY - 6, text, { anchor: 'middle', fontSize: 10, fill: '#333', fontWeight: 'bold' });
        }
      }
    });

    // X-axis category labels, rotated once they no longer fit their slot
    const labels = categoryOrder.map(c => fitText(c, 150, 11));
    const widest = Math.max(...labels.map(l => estimateTextWidth(l, 11)));
    const shouldRotate = widest > categoryWidth - 8;
    const labelDepth = shouldRotate ? Math.min(widest * 0.72 + 16, 130) : 24;
    labels.forEach((label, i) => {
      const x = plotLeft + i * categoryWidth + categoryWidth / 2;
      if (shouldRotate) {
        svg += svgText(x, plotBottom + 14, fitRotatedLabel(categoryOrder[i], x, 11), { anchor: 'end', fontSize: 11, fill: '#333', rotate: -40 });
      } else {
        svg += svgText(x, plotBottom + 18, label, { anchor: 'middle', fontSize: 11, fill: '#333' });
      }
    });

    // Axis titles: what a bar measures, and the category variable
    const yTitle = effectiveDisplay === 'percent'
      ? (valueMode === 'count' ? `Percent of records in each ${colLabel(categoryVar)}` : `Percent of ${statistic.toLowerCase()}`)
      : statistic;
    svg += svgText(16, plotTop + plotHeight / 2, fitText(yTitle, plotHeight + 60, 12), { fontSize: 12, fill: '#444', rotate: -90 });
    svg += svgText(plotLeft + plotWidth / 2, plotBottom + labelDepth + 16, fitText(colLabel(categoryVar), plotWidth, 12), { fontSize: 12, fill: '#444' });

    const notes: string[] = [];
    if (effectiveDisplay === 'percent') {
      notes.push(valueMode === 'count'
        ? `Each bar shows the percent of that ${colLabel(categoryVar)}'s records in each ${colLabel(groupVar)}, among records with both recorded.`
        : `Each bar shows each ${colLabel(groupVar)}'s share of the ${statistic.toLowerCase()} within that ${colLabel(categoryVar)}.`);
    } else {
      notes.push(valueMode === 'count'
        ? `Bars show the number of records for each ${colLabel(categoryVar)} and ${colLabel(groupVar)}.`
        : `Bars show the ${valueMode} of ${colLabel(valueVar)} for each ${colLabel(categoryVar)} and ${colLabel(groupVar)}.`);
    }
    if (chartData.excluded > 0) {
      const fields = [colLabel(categoryVar), colLabel(groupVar), valueMode !== 'count' && colLabel(valueVar)].filter(Boolean);
      notes.push(`${recordCount(chartData.excluded)} excluded: no value for ${fields.join(' or ')}.`);
    }
    if (chartData.negativeCount > 0 && effectiveDisplay !== 'grouped') {
      notes.push(`${chartData.negativeCount} negative value${chartData.negativeCount === 1 ? ' is' : 's are'} left out: a stack cannot show them. Use Grouped mode.`);
    }

    const footer = svgFooter(width, plotBottom + labelDepth + 22, notes, source || undefined);
    return svgWrapper(width, footer.height, svg + footer.svg);
  }, [chartData, effectiveDisplay, valueMode, categoryVar, groupVar, valueVar, statistic, colorScheme, showDataLabels, title, subtitle, source, locale, colLabel]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    if (!chartData) {
      return { columns: [], rows: [] };
    }
    const { dataMap, groupValues, categoryOrder } = chartData;
    const columns = [
      { header: colLabel(categoryVar), key: '__category' },
      ...groupValues.map((gv, i) => ({ header: gv, key: `g${i}` })),
    ];
    const rows = categoryOrder.map(cat => {
      const row: Record<string, string | number | null> = { __category: cat };
      const groupMap = dataMap.get(cat);
      groupValues.forEach((gv, i) => {
        row[`g${i}`] = groupMap?.get(gv) ?? null;
      });
      return row;
    });
    return {
      title,
      subtitle: subtitle ? `${subtitle} (${statistic})` : statistic,
      source: source || undefined,
      columns,
      rows,
    };
  }, [chartData, categoryVar, statistic, title, subtitle, source, colLabel]);

  const isReady = categoryVar && groupVar && (valueMode === 'count' || valueVar);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
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
              <p>• <strong>Grouped:</strong> Compare sub-group values side by side (e.g., cases by age group and sex)</p>
              <p>• <strong>Stacked:</strong> Show how sub-groups contribute to category totals</p>
              <p>• <strong>100%:</strong> Show proportional composition across categories (e.g., case classification by district)</p>
              <p className="text-blue-500 italic mt-2">Keep to 2–4 groups for readability. 100% stacked bars are common in outbreak investigation reports.</p>
            </div>
          )}
        </div>

        <VisualizationTip
          tip="Use grouped bars to compare values across sub-groups; use stacked bars to show how parts contribute to totals. The 100% mode is ideal for showing proportional composition across categories."
          context="Grouped mode highlights comparison; stacked mode highlights composition; 100% mode highlights proportions."
        />

        {/* Negative value warning */}
        {chartData && chartData.negativeCount > 0 && effectiveDisplay !== 'grouped' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <strong>{chartData.negativeCount} negative value{chartData.negativeCount !== 1 ? 's' : ''} omitted.</strong> A stack cannot show a negative value. Switch to Grouped mode to see them.
            </p>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Variables</h4>

          <VariableMapper
            label="Category (X-axis)"
            description="The main grouping variable"
            columns={catColumns}
            value={categoryVar}
            onChange={setCategoryVar}
            required
          />

          <VariableMapper
            label="Group Variable"
            description="Sub-groups within each category"
            columns={catColumns}
            value={groupVar}
            onChange={setGroupVar}
            required
          />

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Value
              <span className="text-red-500 ml-1">*</span>
            </label>
            <select
              value={valueMode}
              onChange={(e) => setValueMode(e.target.value as CrossAggregationMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="count">Count (frequency)</option>
              <option value="sum">Sum of a numeric column</option>
              <option value="mean">Mean of a numeric column</option>
            </select>
          </div>

          {valueMode !== 'count' && (
            <VariableMapper
              label="Value Column"
              description={valueMode === 'sum' ? 'Numeric column to add up' : 'Numeric column to average'}
              columns={dataset.columns}
              value={valueVar}
              onChange={setValueVar}
              filterTypes={['number']}
              required
            />
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Display</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setDisplayMode('grouped')}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                  effectiveDisplay === 'grouped'
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Grouped
              </button>
              <button
                onClick={() => setDisplayMode('stacked')}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                  effectiveDisplay === 'stacked'
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Stacked
              </button>
              <button
                onClick={() => setDisplayMode('percent')}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                  effectiveDisplay === 'percent'
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                100%
              </button>
            </div>
            {valueMode === 'mean' && (
              <p className="text-xs text-gray-500 mt-1">Means are shown side by side: they cannot be stacked into a total.</p>
            )}
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
              checked={showDataLabels}
              onChange={(e) => setShowDataLabels(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show data labels
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
            filename="grouped-bar-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure the chart</p>
            <p className="text-gray-400 text-sm mt-2">
              Select a category variable, a group variable, and a value to generate the chart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
