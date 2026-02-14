import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { EvergreenTip } from '../shared/EvergreenTip';
import { getChartColor, getChartColors } from '../../../utils/chartColors';
import type { ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgAxisLine,
  svgGridLine,
} from '../../../utils/chartExport';

interface LineChartProps {
  dataset: Dataset;
}

type ValueMode = 'count' | 'numeric';

interface SeriesPoint {
  x: number; // index position on x-axis
  y: number;
  label: string; // x-axis label for this point
}

interface Series {
  name: string;
  points: SeriesPoint[];
  color: string;
}

export function LineChart({ dataset }: LineChartProps) {
  // Config state
  const [xVar, setXVar] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [yVar, setYVar] = useState('');
  const [strataVar, setStrataVar] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showDataPoints, setShowDataPoints] = useState(true);
  const [showGridlines, setShowGridlines] = useState(true);
  const [chartTitle, setChartTitle] = useState('');
  const [chartSubtitle, setChartSubtitle] = useState('');
  const [chartSource, setChartSource] = useState('');

  // Derive x-axis values (sorted dates or ordered categories)
  const xValues = useMemo(() => {
    if (!xVar) return [];

    const col = dataset.columns.find(c => c.key === xVar);
    if (!col) return [];

    const rawValues = dataset.records
      .map(r => r[xVar])
      .filter(v => v !== null && v !== undefined && v !== '');

    if (col.type === 'date') {
      // Sort dates chronologically
      const dateSet = new Set(rawValues.map(v => String(v)));
      const sorted = Array.from(dateSet).sort((a, b) => {
        const da = new Date(a).getTime();
        const db = new Date(b).getTime();
        return da - db;
      });
      return sorted;
    }

    // For ordered categorical variables, use valueOrder if available
    if (col.valueOrder && col.valueOrder.length > 0) {
      return col.valueOrder.filter(v => rawValues.some(rv => String(rv) === v));
    }

    // Otherwise, use unique values in natural order
    const unique = new Set(rawValues.map(v => String(v)));
    return Array.from(unique).sort();
  }, [xVar, dataset.records, dataset.columns]);

  // Build series data
  const seriesData: Series[] = useMemo(() => {
    if (!xVar || xValues.length === 0) return [];

    const xIndexMap = new Map(xValues.map((v, i) => [v, i]));

    if (!strataVar) {
      // Single series
      const points = buildSeriesPoints(
        dataset.records,
        xVar,
        valueMode,
        yVar,
        xValues,
        xIndexMap
      );
      return [{
        name: 'All',
        points,
        color: getChartColor(0, colorScheme),
      }];
    }

    // Multiple series by strata
    const strataValues = new Set<string>();
    for (const record of dataset.records) {
      const sv = record[strataVar];
      if (sv !== null && sv !== undefined && sv !== '') {
        strataValues.add(String(sv));
      }
    }

    const strataList = Array.from(strataValues).sort();
    const colors = getChartColors(strataList.length, colorScheme);

    return strataList.map((strataValue, i) => {
      const filteredRecords = dataset.records.filter(
        r => String(r[strataVar] ?? '') === strataValue
      );
      const points = buildSeriesPoints(
        filteredRecords,
        xVar,
        valueMode,
        yVar,
        xValues,
        xIndexMap
      );
      return {
        name: strataValue,
        points,
        color: colors[i],
      };
    });
  }, [xVar, xValues, strataVar, valueMode, yVar, colorScheme, dataset.records]);

  // Generate SVG string
  const svgContent = useMemo(() => {
    if (seriesData.length === 0 || xValues.length === 0) return '';

    const dims = getDefaultDimensions('line');
    const { width, height, margin } = dims;
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // Find y range
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const series of seriesData) {
      for (const pt of series.points) {
        if (pt.y < yMin) yMin = pt.y;
        if (pt.y > yMax) yMax = pt.y;
      }
    }
    if (!isFinite(yMin)) yMin = 0;
    if (!isFinite(yMax)) yMax = 10;
    if (yMin === yMax) {
      yMin = Math.max(0, yMin - 1);
      yMax = yMax + 1;
    }
    // Start y-axis at 0 if all values are positive
    if (yMin >= 0) yMin = 0;

    const niceYMax = getNiceMax(yMax);
    const yRange = niceYMax - yMin;

    const xPointCount = xValues.length;
    const xStep = xPointCount > 1 ? plotWidth / (xPointCount - 1) : plotWidth / 2;

    // Convert data point to pixel coordinates
    const toPixelX = (index: number): number => {
      if (xPointCount === 1) return margin.left + plotWidth / 2;
      return margin.left + index * xStep;
    };

    const toPixelY = (value: number): number => {
      if (yRange === 0) return margin.top + plotHeight / 2;
      return margin.top + plotHeight - ((value - yMin) / yRange) * plotHeight;
    };

    let svg = '';

    // Title and subtitle
    if (chartTitle) {
      svg += svgTitle(width, chartTitle, chartSubtitle || undefined);
    }

    // Horizontal gridlines
    if (showGridlines) {
      const tickCount = 5;
      for (let i = 0; i <= tickCount; i++) {
        const yVal = yMin + (i / tickCount) * yRange;
        const py = toPixelY(yVal);
        svg += svgGridLine(margin.left, py, margin.left + plotWidth, py);
      }
    }

    // Y-axis line
    svg += svgAxisLine(margin.left, margin.top, margin.left, margin.top + plotHeight);

    // X-axis line
    svg += svgAxisLine(margin.left, margin.top + plotHeight, margin.left + plotWidth, margin.top + plotHeight);

    // Y-axis tick labels
    const yTickCount = 5;
    for (let i = 0; i <= yTickCount; i++) {
      const yVal = yMin + (i / yTickCount) * yRange;
      const py = toPixelY(yVal);
      const label = Number.isInteger(yVal) ? String(yVal) : yVal.toFixed(1);
      svg += svgText(margin.left - 10, py, label, {
        anchor: 'end',
        fontSize: 11,
        fill: '#666',
        dy: '0.35em',
      });
    }

    // X-axis tick labels
    // Determine if labels need rotation based on count and length
    const avgLabelLen = xValues.reduce((sum, v) => sum + formatXLabel(v).length, 0) / xValues.length;
    const labelSpacing = xPointCount > 1 ? xStep : plotWidth;
    const needsRotation = labelSpacing < avgLabelLen * 7 + 10;

    // Thin out labels if too many to fit
    const maxLabels = Math.floor(plotWidth / 50);
    const labelStep = xPointCount > maxLabels ? Math.ceil(xPointCount / maxLabels) : 1;

    xValues.forEach((xVal, i) => {
      if (i % labelStep !== 0 && i !== xPointCount - 1) return;
      const px = toPixelX(i);
      const label = formatXLabel(xVal);

      if (needsRotation) {
        svg += svgText(px, margin.top + plotHeight + 12, label, {
          anchor: 'end',
          fontSize: 11,
          fill: '#666',
          rotate: -45,
        });
      } else {
        svg += svgText(px, margin.top + plotHeight + 18, label, {
          anchor: 'middle',
          fontSize: 11,
          fill: '#666',
        });
      }
    });

    // Draw lines for each series
    for (const series of seriesData) {
      if (series.points.length < 2) {
        // Single point -- just draw a circle
        if (series.points.length === 1) {
          const pt = series.points[0];
          const px = toPixelX(pt.x);
          const py = toPixelY(pt.y);
          svg += `<circle cx="${px}" cy="${py}" r="4" fill="${series.color}"/>`;
        }
        continue;
      }

      // Build polyline points string
      const pointsStr = series.points
        .map(pt => `${toPixelX(pt.x)},${toPixelY(pt.y)}`)
        .join(' ');

      svg += `<polyline points="${pointsStr}" fill="none" stroke="${series.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

      // Data point circles
      if (showDataPoints) {
        for (const pt of series.points) {
          const px = toPixelX(pt.x);
          const py = toPixelY(pt.y);
          svg += `<circle cx="${px}" cy="${py}" r="3.5" fill="${series.color}" stroke="#fff" stroke-width="1.5"/>`;
        }
      }
    }

    // Legend (if multiple series)
    if (seriesData.length > 1) {
      const legendY = margin.top - 15;
      const itemWidth = 100;
      const totalLegendWidth = seriesData.length * itemWidth;
      const legendStartX = Math.max(margin.left, (width - totalLegendWidth) / 2);

      seriesData.forEach((series, i) => {
        const lx = legendStartX + i * itemWidth;
        const truncName = series.name.length > 12 ? series.name.substring(0, 10) + '...' : series.name;
        // Line swatch
        svg += `<line x1="${lx}" y1="${legendY}" x2="${lx + 16}" y2="${legendY}" stroke="${series.color}" stroke-width="2.5" stroke-linecap="round"/>`;
        if (showDataPoints) {
          svg += `<circle cx="${lx + 8}" cy="${legendY}" r="3" fill="${series.color}" stroke="#fff" stroke-width="1"/>`;
        }
        svg += svgText(lx + 22, legendY, truncName, {
          anchor: 'start',
          fontSize: 11,
          fill: '#333',
          dy: '0.35em',
        });
      });
    }

    // Source
    if (chartSource) {
      svg += svgSource(width, height, chartSource);
    }

    return svgWrapper(width, height, svg);
  }, [seriesData, xValues, showDataPoints, showGridlines, chartTitle, chartSubtitle, chartSource]);

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Left Panel - Config */}
      <div className="w-full lg:w-72 flex-shrink-0 bg-gray-50 border-b lg:border-b-0 lg:border-r border-gray-200 p-4 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Line Chart</h3>
            <p className="text-xs text-gray-500 mt-1">
              Show trends over time with connected data points.
            </p>
          </div>

          <EvergreenTip
            tip="Line charts imply continuity between data points. Use them for time series or ordered data, never for unrelated categories."
            context="Evergreen design: use lines only when a connection between points is meaningful"
          />

          {/* X-axis variable */}
          <VariableMapper
            label="X-Axis Variable"
            description="Date or ordered variable for the horizontal axis"
            columns={dataset.columns}
            value={xVar}
            onChange={setXVar}
            filterTypes={['date', 'text', 'categorical']}
            required
            placeholder="Select x-axis variable..."
          />

          {/* Value mode */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Y-Axis Value</label>
            <select
              value={valueMode}
              onChange={(e) => setValueMode(e.target.value as ValueMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="count">Count (frequency over x)</option>
              <option value="numeric">Numeric variable</option>
            </select>
          </div>

          {/* Y-axis variable (when numeric mode) */}
          {valueMode === 'numeric' && (
            <VariableMapper
              label="Y-Axis Variable"
              description="Numeric variable to plot"
              columns={dataset.columns}
              value={yVar}
              onChange={setYVar}
              filterTypes={['number']}
              required
              placeholder="Select numeric variable..."
            />
          )}

          {/* Strata / group-by */}
          <VariableMapper
            label="Group By (optional)"
            description="Split into multiple series by this variable"
            columns={dataset.columns}
            value={strataVar}
            onChange={setStrataVar}
            filterTypes={['text', 'categorical', 'boolean']}
            placeholder="None (single series)"
          />

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

          {/* Display options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Display Options</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showDataPoints}
                onChange={(e) => setShowDataPoints(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">Show data points</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showGridlines}
                onChange={(e) => setShowGridlines(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">Show gridlines</span>
            </label>
          </div>

          {/* Chart labels */}
          <div className="space-y-3 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Chart Labels</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title</label>
              <input
                type="text"
                value={chartTitle}
                onChange={(e) => setChartTitle(e.target.value)}
                placeholder="Chart title"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Subtitle</label>
              <input
                type="text"
                value={chartSubtitle}
                onChange={(e) => setChartSubtitle(e.target.value)}
                placeholder="Optional subtitle"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Source</label>
              <input
                type="text"
                value={chartSource}
                onChange={(e) => setChartSource(e.target.value)}
                placeholder="Data source"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Chart */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {seriesData.length > 0 && xValues.length > 0 ? (
          <ChartContainer
            title={chartTitle || 'Line Chart'}
            subtitle={chartSubtitle || undefined}
            source={chartSource || undefined}
            svgContent={svgContent}
            filename={chartTitle ? chartTitle.replace(/\s+/g, '_') : 'line_chart'}
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            {xVar
              ? 'No data available for the selected configuration'
              : 'Select an x-axis variable to generate the line chart'}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Build series points from filtered records.
 * For "count" mode: count occurrences of each x-value.
 * For "numeric" mode: average the numeric y-values for each x-value.
 */
function buildSeriesPoints(
  records: Dataset['records'],
  xVar: string,
  valueMode: ValueMode,
  yVar: string,
  xValues: string[],
  _xIndexMap: Map<string, number>
): SeriesPoint[] {
  if (valueMode === 'count') {
    // Count occurrences per x-value
    const counts = new Map<string, number>();
    for (const xVal of xValues) {
      counts.set(xVal, 0);
    }
    for (const record of records) {
      const xVal = record[xVar];
      if (xVal === null || xVal === undefined || xVal === '') continue;
      const key = String(xVal);
      if (counts.has(key)) {
        counts.set(key, counts.get(key)! + 1);
      }
    }

    return xValues.map((xVal, i) => ({
      x: i,
      y: counts.get(xVal) || 0,
      label: xVal,
    }));
  }

  // Numeric mode: average y-values per x-value
  if (!yVar) return [];

  const groups = new Map<string, number[]>();
  for (const xVal of xValues) {
    groups.set(xVal, []);
  }
  for (const record of records) {
    const xVal = record[xVar];
    if (xVal === null || xVal === undefined || xVal === '') continue;
    const key = String(xVal);
    const numVal = Number(record[yVar]);
    if (isNaN(numVal)) continue;
    if (groups.has(key)) {
      groups.get(key)!.push(numVal);
    }
  }

  return xValues
    .map((xVal, i) => {
      const vals = groups.get(xVal) || [];
      if (vals.length === 0) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return { x: i, y: avg, label: xVal };
    })
    .filter((pt): pt is SeriesPoint => pt !== null);
}

/** Format an x-axis label. For date strings, show a shorter format. */
function formatXLabel(value: string): string {
  // Try to parse as a date
  const date = new Date(value);
  if (!isNaN(date.getTime()) && value.includes('-')) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  // Truncate long labels
  if (value.length > 15) return value.substring(0, 13) + '...';
  return value;
}

/** Calculate a nice maximum value for the axis. */
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
