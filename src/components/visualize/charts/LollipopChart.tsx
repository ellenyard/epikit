import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { calculateFrequency } from '../../../utils/statistics';
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
import { getChartColor, type ChartColorScheme } from '../../../utils/chartColors';

interface LollipopChartProps {
  dataset: Dataset;
}

type ValueMode = 'count' | 'numeric';
type SortMode = 'value-desc' | 'value-asc' | 'alpha';

interface LollipopDataPoint {
  category: string;
  value: number;
}

export function LollipopChart({ dataset }: LollipopChartProps) {
  const [categoryCol, setCategoryCol] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [numericCol, setNumericCol] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('value-desc');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');

  // Build lollipop data
  const lollipopData = useMemo((): LollipopDataPoint[] => {
    if (!categoryCol) return [];

    let points: LollipopDataPoint[];

    if (valueMode === 'count') {
      const values = dataset.records.map(r => r[categoryCol]);
      const freq = calculateFrequency(values);
      points = freq.map(f => ({ category: f.value, value: f.count }));
    } else {
      if (!numericCol) return [];
      // Aggregate numeric values by category (use first occurrence or sum — use first for simplicity)
      const grouped = new Map<string, number[]>();
      for (const record of dataset.records) {
        const cat = record[categoryCol];
        const val = record[numericCol];
        if (cat == null || cat === '' || val == null) continue;
        const num = Number(val);
        if (isNaN(num)) continue;
        const key = String(cat);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(num);
      }
      // Use the mean for each category when multiple values exist
      points = Array.from(grouped.entries()).map(([category, vals]) => ({
        category,
        value: vals.reduce((a, b) => a + b, 0) / vals.length,
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

    return points;
  }, [categoryCol, valueMode, numericCol, sortMode, dataset.records]);

  // Generate SVG
  const svgContent = useMemo(() => {
    if (lollipopData.length === 0) return '';

    const dims = getDefaultDimensions('lollipop');
    // Adjust height if many categories
    const rowHeight = 28;
    const minPlotHeight = lollipopData.length * rowHeight;
    const adjustedHeight = Math.max(dims.height, minPlotHeight + dims.margin.top + dims.margin.bottom);
    const { width, margin } = dims;
    const height = adjustedHeight;
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Value scale
    const maxVal = Math.max(...lollipopData.map(d => d.value));
    const niceMax = getNiceMax(maxVal);

    const xScale = (v: number) => margin.left + (v / niceMax) * plotW;
    const yScale = (i: number) => margin.top + (i + 0.5) * (plotH / lollipopData.length);

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
      svg += svgGridLine(x, margin.top, x, margin.top + plotH);
      // Tick labels on bottom
      const label = Number.isInteger(tickVal) ? String(tickVal) : tickVal.toFixed(1);
      svg += svgText(x, margin.top + plotH + 18, label, {
        anchor: 'middle', fontSize: 11, fill: '#888',
      });
    }

    // Y-axis line
    svg += svgAxisLine(margin.left, margin.top, margin.left, margin.top + plotH);

    // Bottom axis line
    svg += svgAxisLine(margin.left, margin.top + plotH, margin.left + plotW, margin.top + plotH);

    // Draw lollipops
    const dotRadius = 6;
    for (let i = 0; i < lollipopData.length; i++) {
      const point = lollipopData[i];
      const y = yScale(i);
      const xEnd = xScale(point.value);
      const color = getChartColor(i, colorScheme);

      // Category label on the left
      svg += svgText(margin.left - 8, y, escapeXml(truncateLabel(point.category, 22)), {
        anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em',
      });

      // Stick (thin line from axis to dot)
      svg += `<line x1="${margin.left}" y1="${y}" x2="${xEnd}" y2="${y}" stroke="${color}" stroke-width="2" stroke-opacity="0.7"/>`;

      // Dot (solid circle at the end)
      svg += `<circle cx="${xEnd}" cy="${y}" r="${dotRadius}" fill="${color}"/>`;

      // Value label next to dot
      if (showLabels) {
        const labelVal = Number.isInteger(point.value)
          ? String(point.value)
          : point.value.toFixed(1);
        svg += svgText(xEnd + dotRadius + 4, y, labelVal, {
          anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em',
        });
      }
    }

    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [lollipopData, showLabels, colorScheme, title, subtitle, source]);

  const displayTitle = title || 'Lollipop Chart';

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Chart Configuration</h3>

          <VisualizationTip
            tip="Lollipop charts are a cleaner alternative to bar charts for ranking data. The dot-on-stick design reduces visual clutter while maintaining precise value communication."
            context="Horizontal layout makes category labels easy to read."
          />

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
              description="Numeric column (mean per category)"
              columns={dataset.columns}
              value={numericCol}
              onChange={setNumericCol}
              filterTypes={['number']}
              required
            />
          )}

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
            Show data labels
          </label>
        </div>

        {/* Text inputs */}
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
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
            title={displayTitle}
            subtitle={subtitle || undefined}
            source={source || undefined}
            svgContent={svgContent}
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

/** Truncate label to max characters with ellipsis */
function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + '\u2026';
}
