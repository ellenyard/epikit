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
  lower?: number;
  upper?: number;
}

export function LollipopChart({ dataset }: LollipopChartProps) {
  const [categoryCol, setCategoryCol] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [numericCol, setNumericCol] = useState('');
  const [lowerCICol, setLowerCICol] = useState('');
  const [upperCICol, setUpperCICol] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('value-desc');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');
  const [showGuide, setShowGuide] = useState(false);

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
      const ciLowerGrouped = new Map<string, number[]>();
      const ciUpperGrouped = new Map<string, number[]>();

      for (const record of dataset.records) {
        const cat = record[categoryCol];
        const val = record[numericCol];
        if (cat == null || cat === '' || val == null) continue;
        const num = Number(val);
        if (isNaN(num)) continue;
        const key = String(cat);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(num);

        if (lowerCICol) {
          const ciLower = Number(record[lowerCICol]);
          if (!isNaN(ciLower)) {
            if (!ciLowerGrouped.has(key)) ciLowerGrouped.set(key, []);
            ciLowerGrouped.get(key)!.push(ciLower);
          }
        }

        if (upperCICol) {
          const ciUpper = Number(record[upperCICol]);
          if (!isNaN(ciUpper)) {
            if (!ciUpperGrouped.has(key)) ciUpperGrouped.set(key, []);
            ciUpperGrouped.get(key)!.push(ciUpper);
          }
        }
      }

      // Use the mean for each category when multiple values exist
      points = Array.from(grouped.entries()).map(([category, vals]) => {
        const point: LollipopDataPoint = {
          category,
          value: vals.reduce((a, b) => a + b, 0) / vals.length,
        };

        if (lowerCICol && ciLowerGrouped.has(category) && ciLowerGrouped.get(category)!.length > 0) {
          const ciLowerVals = ciLowerGrouped.get(category)!;
          point.lower = ciLowerVals.reduce((a, b) => a + b, 0) / ciLowerVals.length;
        }

        if (upperCICol && ciUpperGrouped.has(category) && ciUpperGrouped.get(category)!.length > 0) {
          const ciUpperVals = ciUpperGrouped.get(category)!;
          point.upper = ciUpperVals.reduce((a, b) => a + b, 0) / ciUpperVals.length;
        }

        return point;
      });
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
  }, [categoryCol, valueMode, numericCol, lowerCICol, upperCICol, sortMode, dataset.records]);

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

      // Confidence interval
      if (point.lower !== undefined && point.upper !== undefined) {
        const ciLowerX = xScale(point.lower);
        const ciUpperX = xScale(point.upper);
        const capHeight = 3;

        // CI horizontal line
        svg += `<line x1="${Math.min(ciLowerX, ciUpperX)}" y1="${y}" x2="${Math.max(ciLowerX, ciUpperX)}" y2="${y}" stroke="#555" stroke-width="1.5"/>`;

        // Left cap
        svg += `<line x1="${Math.min(ciLowerX, ciUpperX)}" y1="${y - capHeight}" x2="${Math.min(ciLowerX, ciUpperX)}" y2="${y + capHeight}" stroke="#555" stroke-width="1.5"/>`;

        // Right cap
        svg += `<line x1="${Math.max(ciLowerX, ciUpperX)}" y1="${y - capHeight}" x2="${Math.max(ciLowerX, ciUpperX)}" y2="${y + capHeight}" stroke="#555" stroke-width="1.5"/>`;
      }

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
            tip="Lollipop charts are a cleaner alternative to bar charts, reducing visual clutter while maintaining precise value communication. The dot-on-stick design draws the eye to exact values."
            context="Featured in CDC COVE. Best for ranking data with many categories — horizontal layout keeps labels readable."
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
                <p>• Ranking or comparing values across many categories (10–20+)</p>
                <p>• When you want a cleaner, more modern alternative to bar charts</p>
                <p>• Displaying incidence rates, coverage rates, or proportions by group</p>
                <p>• When visual weight should be minimized for cleaner reports</p>
                <p className="text-blue-500 italic mt-2">Featured in CDC COVE as "Lollipop Bar Chart" — an accepted alternative to traditional bar charts for cleaner presentations.</p>
              </div>
            )}
          </div>

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

          {valueMode === 'numeric' && (
            <div className="mt-2 pl-2 border-l-2 border-gray-200">
              <p className="text-xs text-gray-500 mb-2">Optional: Confidence Intervals</p>
              <VariableMapper
                label="Lower CI"
                description="Lower confidence limit"
                columns={dataset.columns}
                value={lowerCICol}
                onChange={setLowerCICol}
                filterTypes={['number']}
                placeholder="None"
              />
              <VariableMapper
                label="Upper CI"
                description="Upper confidence limit"
                columns={dataset.columns}
                value={upperCICol}
                onChange={setUpperCICol}
                filterTypes={['number']}
                placeholder="None"
              />
            </div>
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
