import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { getChartColors } from '../../../utils/chartColors';
import type { ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgGridLine,
} from '../../../utils/chartExport';
import { calculateFrequency } from '../../../utils/statistics';

interface BarChartProps {
  dataset: Dataset;
}

type SortMode = 'value' | 'alpha' | 'custom';
type ValueMode = 'count' | 'sum' | 'mean';

interface BarData {
  label: string;
  value: number;
}

export function BarChart({ dataset }: BarChartProps) {
  // Config state
  const [categoryVar, setCategoryVar] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [valueVar, setValueVar] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('value');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showDataLabels, setShowDataLabels] = useState(true);
  const [chartTitle, setChartTitle] = useState('');
  const [chartSubtitle, setChartSubtitle] = useState('');
  const [chartSource, setChartSource] = useState('');

  // Check if selected category column has valueOrder for custom sorting
  const selectedColumn = useMemo(
    () => dataset.columns.find(c => c.key === categoryVar),
    [dataset.columns, categoryVar]
  );
  const hasCustomOrder = !!(selectedColumn?.valueOrder && selectedColumn.valueOrder.length > 0);

  // Compute bar data
  const barData: BarData[] = useMemo(() => {
    if (!categoryVar) return [];

    if (valueMode === 'count') {
      const values = dataset.records.map(r => r[categoryVar]);
      const freq = calculateFrequency(values);
      return freq.map(f => ({ label: f.value, value: f.count }));
    }

    // Sum or mean of a numeric column grouped by category
    if (!valueVar) return [];

    const groups = new Map<string, number[]>();
    for (const record of dataset.records) {
      const cat = record[categoryVar];
      if (cat === null || cat === undefined || cat === '') continue;
      const key = String(cat);
      const numVal = Number(record[valueVar]);
      if (isNaN(numVal)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(numVal);
    }

    const result: BarData[] = [];
    for (const [label, values] of groups) {
      if (valueMode === 'sum') {
        result.push({ label, value: values.reduce((a, b) => a + b, 0) });
      } else {
        // mean
        result.push({ label, value: values.reduce((a, b) => a + b, 0) / values.length });
      }
    }
    return result;
  }, [categoryVar, valueMode, valueVar, dataset.records]);

  // Sort bar data
  const sortedData = useMemo(() => {
    const data = [...barData];

    if (sortMode === 'value') {
      data.sort((a, b) => b.value - a.value);
    } else if (sortMode === 'alpha') {
      data.sort((a, b) => a.label.localeCompare(b.label));
    } else if (sortMode === 'custom' && selectedColumn?.valueOrder) {
      const order = selectedColumn.valueOrder;
      data.sort((a, b) => {
        const ia = order.indexOf(a.label);
        const ib = order.indexOf(b.label);
        // Items not in the order go to the end
        const posA = ia === -1 ? order.length : ia;
        const posB = ib === -1 ? order.length : ib;
        return posA - posB;
      });
    }

    return data;
  }, [barData, sortMode, selectedColumn]);

  // Generate SVG string
  const svgContent = useMemo(() => {
    if (sortedData.length === 0) return '';

    const dims = getDefaultDimensions('bar');
    const { width, height, margin } = dims;
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const maxValue = Math.max(...sortedData.map(d => d.value), 0);
    // Round up to a nice number for the axis
    const niceMax = maxValue === 0 ? 10 : getNiceMax(maxValue);
    const barCount = sortedData.length;
    const barGap = 4;
    const barHeight = Math.min(
      Math.max((plotHeight - barGap * (barCount - 1)) / barCount, 8),
      40
    );
    // Adjust total chart height if bars would overflow
    const totalBarsHeight = barCount * barHeight + (barCount - 1) * barGap;
    const adjustedHeight = Math.max(height, totalBarsHeight + margin.top + margin.bottom + 20);
    const adjustedPlotHeight = adjustedHeight - margin.top - margin.bottom;

    const colors = getChartColors(barCount, colorScheme);

    let svg = '';

    // Title and subtitle
    if (chartTitle) {
      svg += svgTitle(width, chartTitle, chartSubtitle || undefined);
    }

    // Vertical gridlines (light, minimal)
    const tickCount = 5;
    for (let i = 1; i <= tickCount; i++) {
      const x = margin.left + (i / tickCount) * plotWidth;
      svg += svgGridLine(x, margin.top, x, margin.top + adjustedPlotHeight);
    }

    // X-axis tick labels
    for (let i = 0; i <= tickCount; i++) {
      const x = margin.left + (i / tickCount) * plotWidth;
      const tickValue = (niceMax * i) / tickCount;
      const label = Number.isInteger(tickValue) ? String(tickValue) : tickValue.toFixed(1);
      svg += svgText(x, margin.top + adjustedPlotHeight + 20, label, {
        anchor: 'middle',
        fontSize: 11,
        fill: '#666',
      });
    }

    // Bars and labels
    sortedData.forEach((d, i) => {
      const barY = margin.top + i * (barHeight + barGap);
      const barW = maxValue > 0 ? (d.value / niceMax) * plotWidth : 0;
      const color = colors[i % colors.length];

      // Bar
      svg += `<rect x="${margin.left}" y="${barY}" width="${Math.max(barW, 0)}" height="${barHeight}" fill="${color}" rx="2"/>`;

      // Category label on the left
      const labelText = d.label.length > 22 ? d.label.substring(0, 20) + '...' : d.label;
      svg += svgText(margin.left - 8, barY + barHeight / 2, labelText, {
        anchor: 'end',
        fontSize: 12,
        fill: '#333',
        dy: '0.35em',
      });

      // Data label on the bar
      if (showDataLabels) {
        const displayValue = Number.isInteger(d.value) ? String(d.value) : d.value.toFixed(1);
        // Place label inside bar if bar is wide enough, otherwise outside
        const labelWidth = displayValue.length * 7 + 8;
        if (barW > labelWidth + 10) {
          // Inside bar, right-aligned
          svg += svgText(margin.left + barW - 6, barY + barHeight / 2, displayValue, {
            anchor: 'end',
            fontSize: 11,
            fontWeight: 'bold',
            fill: '#fff',
            dy: '0.35em',
          });
        } else {
          // Outside bar, right of the bar
          svg += svgText(margin.left + barW + 6, barY + barHeight / 2, displayValue, {
            anchor: 'start',
            fontSize: 11,
            fontWeight: 'bold',
            fill: '#333',
            dy: '0.35em',
          });
        }
      }
    });

    // Source
    if (chartSource) {
      svg += svgSource(width, adjustedHeight, chartSource);
    }

    return svgWrapper(width, adjustedHeight, svg);
  }, [sortedData, colorScheme, showDataLabels, chartTitle, chartSubtitle, chartSource]);

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Left Panel - Config */}
      <div className="w-full lg:w-72 flex-shrink-0 bg-gray-50 border-b lg:border-b-0 lg:border-r border-gray-200 p-4 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Bar Chart</h3>
            <p className="text-xs text-gray-500 mt-1">
              Compare categories with horizontal bars and direct labels.
            </p>
          </div>

          <VisualizationTip
            tip="Horizontal bars are easier to read than vertical bars because labels are left-aligned and the eye naturally compares lengths."
            context="Best practice: prefer horizontal bars for categorical data"
          />

          {/* Category variable */}
          <VariableMapper
            label="Category Variable"
            description="The categorical variable to display on the y-axis"
            columns={dataset.columns}
            value={categoryVar}
            onChange={setCategoryVar}
            filterTypes={['text', 'categorical', 'boolean']}
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
            </select>
          </div>

          {/* Numeric variable (when sum or mean is selected) */}
          {valueMode !== 'count' && (
            <VariableMapper
              label="Numeric Variable"
              description={`The numeric variable to ${valueMode} per category`}
              columns={dataset.columns}
              value={valueVar}
              onChange={setValueVar}
              filterTypes={['number']}
              required
              placeholder="Select numeric variable..."
            />
          )}

          {/* Sort */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="value">Value (descending)</option>
              <option value="alpha">Alphabetical</option>
              {hasCustomOrder && (
                <option value="custom">Custom order</option>
              )}
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

          {/* Display options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Display Options</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showDataLabels}
                onChange={(e) => setShowDataLabels(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">Show data labels</span>
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
        {sortedData.length > 0 ? (
          <ChartContainer
            title={chartTitle || 'Bar Chart'}
            subtitle={chartSubtitle || undefined}
            source={chartSource || undefined}
            svgContent={svgContent}
            filename={chartTitle ? chartTitle.replace(/\s+/g, '_') : 'bar_chart'}
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
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

/** Calculate a nice maximum value for the axis (rounds up to a clean number). */
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
