import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { FacetWrapper, FacetControl } from '../shared/FacetWrapper';
import { getChartColors } from '../../../utils/chartColors';
import type { ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgGridLine,
  type ExcelExportData,
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
  lower?: number;
  upper?: number;
}

/** Generate SVG for bar chart from sorted data. */
function generateBarSvg(
  sortedData: BarData[],
  colorScheme: ChartColorScheme,
  showDataLabels: boolean,
  chartTitle: string,
  chartSubtitle: string,
  chartSource: string
): string {
  if (sortedData.length === 0) return '';

  const dims = getDefaultDimensions('bar');
  const { width, height, margin } = dims;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const maxValue = Math.max(...sortedData.map(d => d.value), 0);
  const niceMax = maxValue === 0 ? 10 : getNiceMax(maxValue);
  const barCount = sortedData.length;
  const barGap = 4;
  const barHeight = Math.min(
    Math.max((plotHeight - barGap * (barCount - 1)) / barCount, 8),
    40
  );
  const totalBarsHeight = barCount * barHeight + (barCount - 1) * barGap;
  const adjustedHeight = Math.max(height, totalBarsHeight + margin.top + margin.bottom + 20);
  const adjustedPlotHeight = adjustedHeight - margin.top - margin.bottom;

  const colors = getChartColors(barCount, colorScheme);

  let svg = '';

  if (chartTitle) {
    svg += svgTitle(width, chartTitle, chartSubtitle || undefined);
  }

  const tickCount = 5;
  for (let i = 1; i <= tickCount; i++) {
    const x = margin.left + (i / tickCount) * plotWidth;
    svg += svgGridLine(x, margin.top, x, margin.top + adjustedPlotHeight);
  }

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

  sortedData.forEach((d, i) => {
    const barY = margin.top + i * (barHeight + barGap);
    const barW = maxValue > 0 ? (d.value / niceMax) * plotWidth : 0;
    const color = colors[i % colors.length];

    if (d.lower !== undefined && d.upper !== undefined) {
      const ciLowerX = maxValue > 0 ? margin.left + (d.lower / niceMax) * plotWidth : margin.left;
      const ciUpperX = maxValue > 0 ? margin.left + (d.upper / niceMax) * plotWidth : margin.left;
      const ciCenterY = barY + barHeight / 2;
      const capHeight = 3;

      svg += `<line x1="${Math.min(ciLowerX, ciUpperX)}" y1="${ciCenterY}" x2="${Math.max(ciLowerX, ciUpperX)}" y2="${ciCenterY}" stroke="#333" stroke-width="1.5"/>`;
      svg += `<line x1="${Math.min(ciLowerX, ciUpperX)}" y1="${ciCenterY - capHeight}" x2="${Math.min(ciLowerX, ciUpperX)}" y2="${ciCenterY + capHeight}" stroke="#333" stroke-width="1.5"/>`;
      svg += `<line x1="${Math.max(ciLowerX, ciUpperX)}" y1="${ciCenterY - capHeight}" x2="${Math.max(ciLowerX, ciUpperX)}" y2="${ciCenterY + capHeight}" stroke="#333" stroke-width="1.5"/>`;
    }

    svg += `<rect x="${margin.left}" y="${barY}" width="${Math.max(barW, 0)}" height="${barHeight}" fill="${color}" rx="2"/>`;

    const labelText = d.label.length > 22 ? d.label.substring(0, 20) + '...' : d.label;
    svg += svgText(margin.left - 8, barY + barHeight / 2, labelText, {
      anchor: 'end',
      fontSize: 12,
      fill: '#333',
      dy: '0.35em',
    });

    if (showDataLabels) {
      const displayValue = Number.isInteger(d.value) ? String(d.value) : d.value.toFixed(1);
      const labelWidth = displayValue.length * 7 + 8;
      if (barW > labelWidth + 10) {
        svg += svgText(margin.left + barW - 6, barY + barHeight / 2, displayValue, {
          anchor: 'end',
          fontSize: 11,
          fontWeight: 'bold',
          fill: '#fff',
          dy: '0.35em',
        });
      } else {
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

  if (chartSource) {
    svg += svgSource(width, adjustedHeight, chartSource);
  }

  return svgWrapper(width, adjustedHeight, svg);
}

export function BarChart({ dataset }: BarChartProps) {
  // Config state
  const [categoryVar, setCategoryVar] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [valueVar, setValueVar] = useState('');
  const [lowerCICol, setLowerCICol] = useState('');
  const [upperCICol, setUpperCICol] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('value');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showDataLabels, setShowDataLabels] = useState(true);
  const [facetCol, setFacetCol] = useState('');
  const [chartTitle, setChartTitle] = useState('');
  const [chartSubtitle, setChartSubtitle] = useState('');
  const [chartSource, setChartSource] = useState('');
  const [showGuide, setShowGuide] = useState(false);

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
    const ciLowerGroups = new Map<string, number[]>();
    const ciUpperGroups = new Map<string, number[]>();

    for (const record of dataset.records) {
      const cat = record[categoryVar];
      if (cat === null || cat === undefined || cat === '') continue;
      const key = String(cat);
      const numVal = Number(record[valueVar]);
      if (isNaN(numVal)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(numVal);

      if (lowerCICol) {
        const ciLower = Number(record[lowerCICol]);
        if (!isNaN(ciLower)) {
          if (!ciLowerGroups.has(key)) ciLowerGroups.set(key, []);
          ciLowerGroups.get(key)!.push(ciLower);
        }
      }

      if (upperCICol) {
        const ciUpper = Number(record[upperCICol]);
        if (!isNaN(ciUpper)) {
          if (!ciUpperGroups.has(key)) ciUpperGroups.set(key, []);
          ciUpperGroups.get(key)!.push(ciUpper);
        }
      }
    }

    const result: BarData[] = [];
    for (const [label, values] of groups) {
      let barData: BarData;
      if (valueMode === 'sum') {
        barData = { label, value: values.reduce((a, b) => a + b, 0) };
      } else {
        // mean
        barData = { label, value: values.reduce((a, b) => a + b, 0) / values.length };
      }

      if (lowerCICol && ciLowerGroups.has(label) && ciLowerGroups.get(label)!.length > 0) {
        const ciLowerVals = ciLowerGroups.get(label)!;
        barData.lower = ciLowerVals.reduce((a, b) => a + b, 0) / ciLowerVals.length;
      }

      if (upperCICol && ciUpperGroups.has(label) && ciUpperGroups.get(label)!.length > 0) {
        const ciUpperVals = ciUpperGroups.get(label)!;
        barData.upper = ciUpperVals.reduce((a, b) => a + b, 0) / ciUpperVals.length;
      }

      result.push(barData);
    }
    return result;
  }, [categoryVar, valueMode, valueVar, lowerCICol, upperCICol, dataset.records]);

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
    return generateBarSvg(sortedData, colorScheme, showDataLabels, chartTitle, chartSubtitle, chartSource);
  }, [sortedData, colorScheme, showDataLabels, chartTitle, chartSubtitle, chartSource]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const hasCI = sortedData.some(d => d.lower !== undefined && d.upper !== undefined);
    const columns = [
      { header: 'Category', key: 'label' },
      { header: 'Value', key: 'value' },
    ];
    if (hasCI) {
      columns.push({ header: 'Lower CI', key: 'lower' });
      columns.push({ header: 'Upper CI', key: 'upper' });
    }
    const rows = sortedData.map(d => ({
      label: d.label,
      value: d.value,
      ...(hasCI ? { lower: d.lower ?? null, upper: d.upper ?? null } : {}),
    }));
    return {
      title: chartTitle,
      subtitle: chartSubtitle || undefined,
      source: chartSource || undefined,
      columns,
      rows,
    };
  }, [sortedData, chartTitle, chartSubtitle, chartSource]);

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
            tip="Horizontal bars are easier to read than vertical bars because labels are left-aligned and the eye naturally compares lengths. Sort by value (descending) so the most important categories appear at the top."
            context="Best practice from CDC: prefer horizontal bars for categorical data. Consider a lollipop chart if you have many categories and want less visual weight."
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
                <p>• Comparing frequency, counts, or values across categories</p>
                <p>• Ranking items from highest to lowest (sort by value)</p>
                <p>• Showing attack rates, case counts, or proportions by group</p>
                <p>• When category labels are long (horizontal bars keep them readable)</p>
                <p className="text-blue-500 italic mt-2">CDC recommends horizontal bars when category labels are long. Sort by value (descending) to emphasize the most important categories. — CDC COVE Best Practices</p>
              </div>
            )}
          </div>

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

          {/* Confidence interval columns */}
          {valueMode !== 'count' && (
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

          {/* Small Multiples / Faceting */}
          <FacetControl
            columns={dataset.columns}
            value={facetCol}
            onChange={setFacetCol}
          />

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
          facetCol ? (
            <FacetWrapper
              dataset={dataset}
              facetCol={facetCol}
              renderChart={(fd) => {
                // Compute sorted data for this facet
                let facetBarData: BarData[] = [];
                if (valueMode === 'count') {
                  const values = fd.records.map(r => r[categoryVar]);
                  const freq = calculateFrequency(values);
                  facetBarData = freq.map(f => ({ label: f.value, value: f.count }));
                } else if (valueVar) {
                  const groups = new Map<string, number[]>();
                  const ciLowerGroups = new Map<string, number[]>();
                  const ciUpperGroups = new Map<string, number[]>();

                  for (const record of fd.records) {
                    const cat = record[categoryVar];
                    if (cat === null || cat === undefined || cat === '') continue;
                    const key = String(cat);
                    const numVal = Number(record[valueVar]);
                    if (isNaN(numVal)) continue;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(numVal);

                    if (lowerCICol) {
                      const ciLower = Number(record[lowerCICol]);
                      if (!isNaN(ciLower)) {
                        if (!ciLowerGroups.has(key)) ciLowerGroups.set(key, []);
                        ciLowerGroups.get(key)!.push(ciLower);
                      }
                    }

                    if (upperCICol) {
                      const ciUpper = Number(record[upperCICol]);
                      if (!isNaN(ciUpper)) {
                        if (!ciUpperGroups.has(key)) ciUpperGroups.set(key, []);
                        ciUpperGroups.get(key)!.push(ciUpper);
                      }
                    }
                  }

                  for (const [label, values] of groups) {
                    let barData: BarData;
                    if (valueMode === 'sum') {
                      barData = { label, value: values.reduce((a, b) => a + b, 0) };
                    } else {
                      barData = { label, value: values.reduce((a, b) => a + b, 0) / values.length };
                    }

                    if (lowerCICol && ciLowerGroups.has(label) && ciLowerGroups.get(label)!.length > 0) {
                      const ciLowerVals = ciLowerGroups.get(label)!;
                      barData.lower = ciLowerVals.reduce((a, b) => a + b, 0) / ciLowerVals.length;
                    }

                    if (upperCICol && ciUpperGroups.has(label) && ciUpperGroups.get(label)!.length > 0) {
                      const ciUpperVals = ciUpperGroups.get(label)!;
                      barData.upper = ciUpperVals.reduce((a, b) => a + b, 0) / ciUpperVals.length;
                    }

                    facetBarData.push(barData);
                  }
                }

                // Sort facet data
                let sortedFacetData = [...facetBarData];
                if (sortMode === 'value') {
                  sortedFacetData.sort((a, b) => b.value - a.value);
                } else if (sortMode === 'alpha') {
                  sortedFacetData.sort((a, b) => a.label.localeCompare(b.label));
                } else if (sortMode === 'custom' && selectedColumn?.valueOrder) {
                  const order = selectedColumn.valueOrder;
                  sortedFacetData.sort((a, b) => {
                    const ia = order.indexOf(a.label);
                    const ib = order.indexOf(b.label);
                    const posA = ia === -1 ? order.length : ia;
                    const posB = ib === -1 ? order.length : ib;
                    return posA - posB;
                  });
                }

                if (sortedFacetData.length === 0) {
                  return <div className="text-gray-400 text-xs p-2">No data</div>;
                }

                const facetSvg = generateBarSvg(sortedFacetData, colorScheme, showDataLabels, '', '', '');
                return <div dangerouslySetInnerHTML={{ __html: facetSvg }} />;
              }}
            />
          ) : (
            <ChartContainer
              title={chartTitle || 'Bar Chart'}
              subtitle={chartSubtitle || undefined}
              source={chartSource || undefined}
              svgContent={svgContent}
              excelData={excelData}
              filename={chartTitle ? chartTitle.replace(/\s+/g, '_') : 'bar_chart'}
            >
              <div dangerouslySetInnerHTML={{ __html: svgContent }} />
            </ChartContainer>
          )
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
