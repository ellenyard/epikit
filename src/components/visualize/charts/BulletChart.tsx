import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { getChartColors, type ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgAxisLine,
  svgGridLine,
  escapeXml,
} from '../../../utils/chartExport';
import { aggregatePairByCategory, type AggregationMode } from '../../../utils/chartAggregation';

interface BulletChartProps {
  dataset: Dataset;
}

export function BulletChart({ dataset }: BulletChartProps) {
  const [categoryVar, setCategoryVar] = useState('');
  const [actualVar, setActualVar] = useState('');
  const [targetVar, setTargetVar] = useState('');
  const [aggMode, setAggMode] = useState<AggregationMode>('mean');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showValueLabels, setShowValueLabels] = useState(true);
  const [title, setTitle] = useState('Bullet Chart');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');

  // Count unique categories for warning
  const uniqueCategories = useMemo(() => {
    if (!categoryVar) return 0;
    const unique = new Set<string>();
    for (const rec of dataset.records) {
      const cat = rec[categoryVar];
      if (cat !== null && cat !== undefined && cat !== '') unique.add(String(cat));
    }
    return unique.size;
  }, [categoryVar, dataset.records]);

  const svgContent = useMemo(() => {
    if (!categoryVar || !actualVar || !targetVar) return '';

    // Extract data with aggregation by category
    const aggregated = aggregatePairByCategory(dataset.records, categoryVar, actualVar, targetVar, aggMode);
    const rows = aggregated.map(a => ({
      category: a.category,
      actual: a.valueA,
      target: a.valueB,
    }));

    if (rows.length === 0) return '';

    const dims = getDefaultDimensions('bullet');
    const barHeight = 30;
    const barGap = 10;
    const totalBarArea = rows.length * (barHeight + barGap) - barGap;

    // Adjust height to fit all rows
    const neededHeight = dims.margin.top + totalBarArea + dims.margin.bottom;
    const height = Math.max(dims.height, neededHeight);
    const width = dims.width;

    const plotLeft = dims.margin.left;
    const plotRight = width - dims.margin.right;
    const plotWidth = plotRight - plotLeft;
    const plotTop = dims.margin.top;

    // Determine max value for scale
    const maxValue = Math.max(
      ...rows.map(r => Math.max(r.actual, r.target))
    );
    const niceMax = ceilToNice(maxValue);

    const colors = getChartColors(rows.length, colorScheme);

    let svg = '';

    // Title
    if (title) {
      svg += svgTitle(width, title, subtitle || undefined);
    }

    // X-axis gridlines and labels
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const val = (niceMax / tickCount) * i;
      const x = plotLeft + (val / niceMax) * plotWidth;
      // Gridline
      svg += svgGridLine(x, plotTop, x, plotTop + totalBarArea);
      // Tick label
      svg += svgText(x, plotTop + totalBarArea + 20, formatNumber(val), {
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
      const barColor = colors[i % colors.length];

      // Category label on left
      svg += svgText(plotLeft - 10, y + barHeight / 2, row.category, {
        anchor: 'end',
        fontSize: 12,
        fill: '#333',
        dy: '0.35em',
      });

      // Background band (full range) - light gray
      const bandWidth = plotWidth;
      svg += `<rect x="${plotLeft}" y="${y}" width="${bandWidth}" height="${barHeight}" fill="#E5E7EB" rx="3"/>`;

      // 75% qualitative range - medium gray
      const qualWidth = (0.75 * niceMax / niceMax) * plotWidth;
      svg += `<rect x="${plotLeft}" y="${y + 4}" width="${qualWidth}" height="${barHeight - 8}" fill="#D1D5DB" rx="2"/>`;

      // Actual value bar - colored, narrower
      const actualWidth = (row.actual / niceMax) * plotWidth;
      const innerBarHeight = barHeight * 0.4;
      const innerBarY = y + (barHeight - innerBarHeight) / 2;
      svg += `<rect x="${plotLeft}" y="${innerBarY}" width="${actualWidth}" height="${innerBarHeight}" fill="${escapeXml(barColor)}" rx="2"/>`;

      // Target marker line
      const targetX = plotLeft + (row.target / niceMax) * plotWidth;
      svg += `<line x1="${targetX}" y1="${y + 2}" x2="${targetX}" y2="${y + barHeight - 2}" stroke="#111" stroke-width="2.5"/>`;

      // Value labels
      if (showValueLabels) {
        svg += svgText(plotLeft + actualWidth + 4, innerBarY + innerBarHeight / 2, formatNumber(row.actual), {
          anchor: 'start',
          fontSize: 10,
          fill: '#333',
          fontWeight: 'bold',
          dy: '0.35em',
        });
      }
    }

    // Legend for target marker
    const legendY = plotTop + totalBarArea + 40;
    svg += `<line x1="${plotLeft}" y1="${legendY - 4}" x2="${plotLeft}" y2="${legendY + 4}" stroke="#111" stroke-width="2.5"/>`;
    svg += svgText(plotLeft + 8, legendY, 'Target', {
      anchor: 'start',
      fontSize: 11,
      fill: '#666',
      dy: '0.35em',
    });

    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [categoryVar, actualVar, targetVar, aggMode, colorScheme, showValueLabels, title, subtitle, source, dataset.records]);

  const isReady = categoryVar && actualVar && targetVar;

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <VisualizationTip
          tip="Bullet charts are ideal for comparing actual performance to a target. Data is automatically aggregated by category (e.g., mean per age group)."
          context="Try this: Category=Age Group, Actual=Vitamin A Coverage (%), Target=Target Vitamin A Coverage (%)"
        />

        {/* Data point warning */}
        {uniqueCategories > 30 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <strong>{uniqueCategories} categories detected.</strong> Bullet charts work best with 3-15 categories. Consider using a column with fewer unique values.
            </p>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Variables</h4>

          <VariableMapper
            label="Category"
            description="Label for each bullet row"
            columns={dataset.columns}
            value={categoryVar}
            onChange={setCategoryVar}
            filterTypes={['text', 'categorical']}
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
            subtitle={subtitle || undefined}
            source={source || undefined}
            svgContent={svgContent}
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

/** Round up to a nice number for axis max */
function ceilToNice(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/** Format number for display */
function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
