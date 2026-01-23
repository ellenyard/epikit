import { useState, useMemo, useRef, useCallback } from 'react';
import type { Dataset } from '../../types/analysis';
import { calculateDescriptiveStats, calculateFrequency } from '../../utils/statistics';
import type { DescriptiveStats as DescStats, FrequencyItem } from '../../utils/statistics';
import { ResultsActions, ExportIcons, AdvancedOptions } from '../shared';

interface SingleVariableProps {
  dataset: Dataset;
}

interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
  label: string;
}

type ChartType = 'histogram' | 'boxplot' | 'density';
type SortOrder = 'count' | 'alphabet' | 'original';

// Format number to specified significant figures
const formatSigFigs = (n: number, sigFigs: number = 2): string => {
  if (!isFinite(n) || n === 0) return '0';
  const magnitude = Math.floor(Math.log10(Math.abs(n)));
  const precision = sigFigs - 1 - magnitude;
  if (precision < 0) {
    return Math.round(n / Math.pow(10, -precision)) * Math.pow(10, -precision) + '';
  }
  return n.toFixed(Math.max(0, precision));
};

// Format percentage based on sample size
const formatPercent = (value: number, sampleSize: number): string => {
  const sigFigs = sampleSize >= 1000 ? 3 : 2;
  return formatSigFigs(value, sigFigs);
};

export function SingleVariable({ dataset }: SingleVariableProps) {
  const [selectedVar, setSelectedVar] = useState<string>('');
  const [binWidth, setBinWidth] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [includeMissingInPercent, setIncludeMissingInPercent] = useState<boolean>(false);
  const [chartType, setChartType] = useState<ChartType>('histogram');
  const [sortOrder, setSortOrder] = useState<SortOrder>('count');
  const [topN, setTopN] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const selectedColumn = dataset.columns.find(c => c.key === selectedVar);

  // Filter columns for search while preserving original order
  const filteredColumns = useMemo(() => {
    if (!searchTerm) return dataset.columns;
    const lowerSearch = searchTerm.toLowerCase();
    return dataset.columns.filter(col =>
      col.label.toLowerCase().includes(lowerSearch) ||
      col.key.toLowerCase().includes(lowerSearch) ||
      col.type.toLowerCase().includes(lowerSearch)
    );
  }, [dataset.columns, searchTerm]);

  const values = useMemo(() => {
    if (!selectedVar) return [];
    return dataset.records.map(r => r[selectedVar]);
  }, [dataset.records, selectedVar]);

  // Calculate missing values count
  const missingCount = useMemo(() => {
    return values.filter(v => v === null || v === undefined || v === '').length;
  }, [values]);

  const validCount = values.length - missingCount;
  const totalCount = values.length;

  const numericValues = useMemo(() => {
    if (!selectedColumn || selectedColumn.type !== 'number') return [];
    return values
      .filter(v => v !== null && v !== undefined && !isNaN(Number(v)))
      .map(v => Number(v));
  }, [values, selectedColumn]);

  const numericStats: DescStats | null = useMemo(() => {
    if (!selectedColumn || selectedColumn.type !== 'number') return null;
    return calculateDescriptiveStats(numericValues);
  }, [numericValues, selectedColumn]);

  // Detect outliers for numeric data
  const outliers = useMemo(() => {
    if (!selectedColumn || selectedColumn.type !== 'number') return [];
    const detected: { value: number; reason: string; index: number }[] = [];

    const varName = selectedColumn.label.toLowerCase();
    const isAge = varName.includes('age');
    const isLat = varName.includes('lat');
    const isLon = varName.includes('lon') || varName.includes('long');

    numericValues.forEach((val, idx) => {
      if (isAge && (val < 0 || val > 120)) {
        detected.push({ value: val, reason: 'Age outside valid range (0-120)', index: idx });
      } else if (isLat && (val < -90 || val > 90)) {
        detected.push({ value: val, reason: 'Latitude outside valid range (-90 to 90)', index: idx });
      } else if (isLon && (val < -180 || val > 180)) {
        detected.push({ value: val, reason: 'Longitude outside valid range (-180 to 180)', index: idx });
      }
    });

    return detected;
  }, [selectedColumn, numericValues]);

  // Calculate default bin width using Freedman-Diaconis rule
  const defaultBinWidth = useMemo(() => {
    if (!numericStats || numericValues.length === 0) return 1;
    const range = numericStats.max - numericStats.min;
    if (range === 0) return 1;

    const iqr = numericStats.iqr;
    if (iqr > 0) {
      const width = 2 * iqr / Math.pow(numericValues.length, 1/3);
      const magnitude = Math.pow(10, Math.floor(Math.log10(width)));
      const normalized = width / magnitude;
      let niceWidth;
      if (normalized <= 1) niceWidth = 1;
      else if (normalized <= 2) niceWidth = 2;
      else if (normalized <= 5) niceWidth = 5;
      else niceWidth = 10;
      return niceWidth * magnitude;
    }

    const numBins = Math.ceil(Math.log2(numericValues.length) + 1);
    const width = range / numBins;
    const magnitude = Math.pow(10, Math.floor(Math.log10(width)));
    const normalized = width / magnitude;
    let niceWidth;
    if (normalized <= 1) niceWidth = 1;
    else if (normalized <= 2) niceWidth = 2;
    else if (normalized <= 5) niceWidth = 5;
    else niceWidth = 10;
    return niceWidth * magnitude;
  }, [numericStats, numericValues]);

  const effectiveBinWidth = binWidth !== null ? binWidth : defaultBinWidth;

  // Calculate histogram bins
  const histogramBins: HistogramBin[] = useMemo(() => {
    if (!numericStats || numericValues.length === 0 || effectiveBinWidth <= 0) return [];

    const min = numericStats.min;
    const max = numericStats.max;
    const bins: HistogramBin[] = [];

    const binStart = Math.floor(min / effectiveBinWidth) * effectiveBinWidth;
    const binEnd = Math.ceil(max / effectiveBinWidth) * effectiveBinWidth;

    for (let start = binStart; start < binEnd; start += effectiveBinWidth) {
      const end = start + effectiveBinWidth;
      const count = numericValues.filter(v => v >= start && v < end).length;
      const adjustedCount = end >= max
        ? numericValues.filter(v => v >= start && v <= end).length
        : count;
      bins.push({
        binStart: start,
        binEnd: end,
        count: adjustedCount,
        label: `${start.toFixed(1)} - ${end.toFixed(1)}`,
      });
    }

    return bins;
  }, [numericStats, numericValues, effectiveBinWidth]);

  const maxBinCount = Math.max(...histogramBins.map(b => b.count), 1);

  // Calculate density plot data
  const densityData = useMemo(() => {
    if (!numericStats || numericValues.length === 0) return [];

    const bandwidth = numericStats.stdDev * Math.pow(numericValues.length, -1/5) * 1.06;
    const points: { x: number; y: number }[] = [];
    const min = numericStats.min;
    const max = numericStats.max;
    const range = max - min;
    const numPoints = 100;

    for (let i = 0; i <= numPoints; i++) {
      const x = min + (i / numPoints) * range;
      let density = 0;

      for (const val of numericValues) {
        const u = (x - val) / bandwidth;
        density += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
      }

      density = density / (numericValues.length * bandwidth);
      points.push({ x, y: density });
    }

    return points;
  }, [numericStats, numericValues]);

  const maxDensity = Math.max(...densityData.map(d => d.y), 1);

  // Calculate frequency with proper denominator handling
  const frequency: FrequencyItem[] = useMemo(() => {
    if (!selectedVar) return [];
    const baseFrequency = calculateFrequency(values);

    const denominator = includeMissingInPercent ? totalCount : validCount;
    let cumCount = 0;

    return baseFrequency.map(item => {
      cumCount += item.count;
      return {
        ...item,
        percent: denominator > 0 ? (item.count / denominator) * 100 : 0,
        cumPercent: denominator > 0 ? (cumCount / denominator) * 100 : 0,
      };
    });
  }, [values, selectedVar, includeMissingInPercent, totalCount, validCount]);

  // Sort and filter frequency data
  const displayedFrequency = useMemo(() => {
    let sorted = [...frequency];

    if (sortOrder === 'alphabet') {
      sorted.sort((a, b) => a.value.localeCompare(b.value));
    } else if (sortOrder === 'count') {
      sorted.sort((a, b) => b.count - a.count);
    }

    if (topN && topN > 0 && sorted.length > topN) {
      const topItems = sorted.slice(0, topN);
      const otherItems = sorted.slice(topN);
      const otherCount = otherItems.reduce((sum, item) => sum + item.count, 0);
      const denominator = includeMissingInPercent ? totalCount : validCount;

      return [
        ...topItems,
        {
          value: 'Other',
          count: otherCount,
          percent: denominator > 0 ? (otherCount / denominator) * 100 : 0,
          cumCount: topItems.reduce((sum, item) => sum + item.count, 0) + otherCount,
          cumPercent: 100,
        }
      ];
    }

    return sorted;
  }, [frequency, sortOrder, topN, includeMissingInPercent, totalCount, validCount]);

  const formatNumber = (n: number, decimals: number = 2): string => {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return n.toFixed(decimals);
  };

  const totalSampleSize = useMemo(() => {
    return frequency.reduce((sum, item) => sum + item.count, 0);
  }, [frequency]);

  // Export functionality
  const exportToCSV = useCallback(() => {
    if (!selectedVar || !selectedColumn) return;

    const timestamp = new Date().toISOString();
    let csv = `# Single Variable Analysis Export\n`;
    csv += `# Timestamp: ${timestamp}\n`;
    csv += `# Variable: ${selectedColumn.label}\n`;
    csv += `# Type: ${selectedColumn.type}\n`;
    csv += `# Denominator: ${includeMissingInPercent ? 'Total records' : 'Valid records only'}\n\n`;

    csv += `Summary\n`;
    csv += `Total Count,${totalCount}\n`;
    csv += `Valid Count,${validCount}\n`;
    csv += `Missing Count,${missingCount}\n\n`;

    if (numericStats) {
      csv += `Numeric Summary Statistics\n`;
      csv += `Mean,${numericStats.mean}\n`;
      csv += `Median,${numericStats.median}\n`;
      csv += `Mode,${numericStats.mode ?? 'N/A'}\n`;
      csv += `Std Dev,${numericStats.stdDev}\n`;
      csv += `Variance,${numericStats.variance}\n`;
      csv += `Min,${numericStats.min}\n`;
      csv += `Q1,${numericStats.q1}\n`;
      csv += `Q3,${numericStats.q3}\n`;
      csv += `Max,${numericStats.max}\n`;
      csv += `Range,${numericStats.range}\n`;
      csv += `IQR,${numericStats.iqr}\n`;
      csv += `Sum,${numericStats.sum}\n\n`;
    }

    csv += `Frequency Distribution\n`;
    csv += `Value,Count,Percent,Cumulative Percent\n`;
    displayedFrequency.forEach(item => {
      csv += `"${item.value}",${item.count},${item.percent.toFixed(2)},${item.cumPercent.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `single_variable_${selectedColumn.key}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedVar, selectedColumn, displayedFrequency, numericStats, totalCount, validCount, missingCount, includeMissingInPercent]);

  return (
    <div className="space-y-6">
      {/* Variable Selection with Search */}
      <div className="max-w-md space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Select Variable
        </label>
        <input
          type="text"
          placeholder="Search variables..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          aria-label="Search for variables"
        />
        <select
          value={selectedVar}
          onChange={(e) => setSelectedVar(e.target.value)}
          className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          aria-label="Select variable to analyze"
        >
          <option value="">Select variable...</option>
          {filteredColumns.map(col => (
            <option key={col.key} value={col.key}>
              {col.label} ({col.type})
            </option>
          ))}
        </select>
        {searchTerm && filteredColumns.length === 0 && (
          <p className="text-sm text-gray-500">
            No variables match your search.
          </p>
        )}
      </div>

      {selectedVar && (
        <div>
          {/* Outlier Warning */}
          {outliers.length > 0 && (
            <div className="mb-4 p-4 rounded-lg border bg-yellow-50 border-yellow-200 text-yellow-800" role="alert">
              <h4 className="font-semibold mb-2">Potential Outliers Detected</h4>
              <p className="text-sm mb-2">Found {outliers.length} value(s) that may be outliers:</p>
              <ul className="text-sm list-disc list-inside space-y-1">
                {outliers.slice(0, 5).map((outlier, idx) => (
                  <li key={idx}>{outlier.reason}: {outlier.value}</li>
                ))}
                {outliers.length > 5 && <li>...and {outliers.length - 5} more</li>}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Visualizations (for numeric variables) */}
              {numericStats && (
                <div ref={chartRef} className="border rounded-lg p-4 bg-white border-gray-200">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
                    <h4 className="text-sm font-semibold text-gray-900">
                      Distribution Visualization
                    </h4>
                    <select
                      value={chartType}
                      onChange={(e) => setChartType(e.target.value as ChartType)}
                      className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                      aria-label="Select chart type"
                    >
                      <option value="histogram">Histogram</option>
                      <option value="boxplot">Box Plot</option>
                      <option value="density">Density Plot</option>
                    </select>
                  </div>

                  {/* Bin width slider for histogram */}
                  {chartType === 'histogram' && (
                    <div className="mb-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-gray-600">
                          Bin width: {(binWidth !== null ? binWidth : defaultBinWidth).toFixed(2)}
                        </label>
                        {binWidth !== null && (
                          <button
                            onClick={() => setBinWidth(null)}
                            className="text-xs text-blue-600 hover:text-blue-700"
                          >
                            Reset to suggested
                          </button>
                        )}
                      </div>
                      <input
                        type="range"
                        min={defaultBinWidth * 0.1}
                        max={defaultBinWidth * 10}
                        step={defaultBinWidth * 0.1}
                        value={binWidth !== null ? binWidth : defaultBinWidth}
                        onChange={(e) => setBinWidth(parseFloat(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200"
                        aria-label="Adjust bin width for histogram"
                      />
                    </div>
                  )}

                  {/* Histogram Chart */}
                  {chartType === 'histogram' && histogramBins.length > 0 && (
                    <div className="flex flex-col">
                      <div className="flex items-end justify-between gap-1 h-48 mb-2">
                        {histogramBins.map((bin, index) => (
                          <div key={index} className="flex-1 flex flex-col items-center h-full">
                            <span className="text-xs font-medium mb-1 text-gray-700">
                              {bin.count > 0 ? bin.count : ''}
                            </span>
                            <div className="flex-1 w-full rounded-t overflow-hidden flex items-end bg-gray-100">
                              <div
                                className="w-full transition-all rounded-t bg-blue-500"
                                style={{ height: `${(bin.count / maxBinCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between gap-1 border-t pt-2 border-gray-300">
                        {histogramBins.map((bin, index) => (
                          <div key={index} className="flex-1 text-center">
                            <span className="text-xs block truncate text-gray-600" title={bin.label}>
                              {bin.binStart.toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Box Plot */}
                  {chartType === 'boxplot' && numericStats && (
                    <div className="py-8">
                      <div className="mb-4 flex justify-between text-xs text-gray-600">
                        <span>Min: {formatNumber(numericStats.min)}</span>
                        <span>Max: {formatNumber(numericStats.max)}</span>
                      </div>
                      <div className="relative h-16 rounded bg-gray-100">
                        {numericStats.range > 0 && (
                          <>
                            {/* Whiskers */}
                            <div
                              className="absolute top-1/2 h-0.5 bg-gray-400"
                              style={{
                                left: '0%',
                                right: `${100 - ((numericStats.max - numericStats.min) / numericStats.range) * 100}%`,
                                transform: 'translateY(-50%)',
                              }}
                            />
                            {/* Box */}
                            <div
                              className="absolute top-2 bottom-2 border-2 rounded bg-blue-200 border-blue-400"
                              style={{
                                left: `${((numericStats.q1 - numericStats.min) / numericStats.range) * 100}%`,
                                right: `${((numericStats.max - numericStats.q3) / numericStats.range) * 100}%`,
                              }}
                            />
                            {/* Median line */}
                            <div
                              className="absolute top-0 bottom-0 w-1 bg-blue-600"
                              style={{
                                left: `${((numericStats.median - numericStats.min) / numericStats.range) * 100}%`,
                              }}
                            />
                          </>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-5 gap-2 text-center">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatNumber(numericStats.min)}</p>
                          <p className="text-xs text-gray-500">Min</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatNumber(numericStats.q1)}</p>
                          <p className="text-xs text-gray-500">Q1</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-blue-600">{formatNumber(numericStats.median)}</p>
                          <p className="text-xs text-gray-500">Median</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatNumber(numericStats.q3)}</p>
                          <p className="text-xs text-gray-500">Q3</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatNumber(numericStats.max)}</p>
                          <p className="text-xs text-gray-500">Max</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Density Plot */}
                  {chartType === 'density' && densityData.length > 0 && (
                    <div className="flex flex-col">
                      <div className="relative h-48 border-l border-b border-gray-300">
                        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <path
                            d={
                              densityData.map((d, i) => {
                                const x = (i / (densityData.length - 1)) * 100;
                                const y = 100 - (d.y / maxDensity) * 100;
                                return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
                              }).join(' ') + ' L 100,100 L 0,100 Z'
                            }
                            fill="rgba(59, 130, 246, 0.3)"
                            stroke="#3b82f6"
                            strokeWidth="0.5"
                          />
                        </svg>
                      </div>
                      <p className="text-xs text-center mt-2 text-gray-500">
                        Kernel Density Estimate
                      </p>
                    </div>
                  )}

                  {histogramBins.length === 0 && chartType === 'histogram' && (
                    <p className="text-sm text-center py-4 text-gray-400">No data to display</p>
                  )}
                </div>
              )}

              {/* Categorical Bar Chart */}
              {selectedColumn && selectedColumn.type !== 'number' && displayedFrequency.length > 0 && (
                <div className="border rounded-lg p-4 bg-white border-gray-200">
                  <h4 className="text-sm font-semibold mb-4 text-gray-900">
                    Frequency Bar Chart
                  </h4>
                  <div className="space-y-2">
                    {displayedFrequency.slice(0, 10).map((item, index) => {
                      const maxCount = Math.max(...displayedFrequency.map(f => f.count));
                      const percentage = (item.count / maxCount) * 100;
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-xs w-24 truncate text-gray-700" title={item.value}>
                            {item.value}
                          </span>
                          <div className="flex-1 h-6 bg-gray-200 rounded overflow-hidden">
                            <div
                              className="h-full bg-green-500 transition-all flex items-center justify-end pr-2"
                              style={{ width: `${percentage}%` }}
                            >
                              <span className="text-xs text-white font-medium">
                                {item.count}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs w-12 text-right text-gray-600">
                            {formatPercent(item.percent, totalSampleSize)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {displayedFrequency.length > 10 && (
                    <p className="text-xs mt-2 text-gray-500">
                      Showing top 10 of {displayedFrequency.length} categories
                    </p>
                  )}
                </div>
              )}

              {/* Frequency Distribution Table */}
              <div className="border rounded-lg overflow-hidden bg-white border-gray-200">
                <div className="px-4 py-3 border-b bg-gray-50 border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">
                        Frequency Distribution
                      </h4>
                      <p className="text-xs text-gray-500">
                        {selectedColumn?.label}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                        className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                        aria-label="Sort frequency table"
                      >
                        <option value="count">Sort by count</option>
                        <option value="alphabet">Sort alphabetically</option>
                        <option value="original">Original order</option>
                      </select>

                      {selectedColumn && selectedColumn.type !== 'number' && frequency.length > 5 && (
                        <select
                          value={topN || ''}
                          onChange={(e) => setTopN(e.target.value ? parseInt(e.target.value) : null)}
                          className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                          aria-label="Show top N categories"
                        >
                          <option value="">Show all</option>
                          <option value="5">Top 5</option>
                          <option value="10">Top 10</option>
                          <option value="20">Top 20</option>
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="text-gray-600">
                      <strong>Total:</strong> {totalCount} | <strong>Valid:</strong> {validCount} | <strong>Missing:</strong> {missingCount}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeMissingInPercent}
                        onChange={(e) => setIncludeMissingInPercent(e.target.checked)}
                        className="rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-600">
                        Include missing in %
                      </span>
                    </label>
                    <span className="italic text-gray-500">
                      (% of {includeMissingInPercent ? 'total' : 'valid'})
                    </span>
                  </div>
                </div>

                <div className="max-h-96 overflow-auto">
                  <table className="border-collapse">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Value</th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Count</th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">%</th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Cum %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {displayedFrequency.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-900">{item.value}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-900">{item.count}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-900">{formatPercent(item.percent, totalSampleSize)}%</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-500">{formatPercent(item.cumPercent, totalSampleSize)}%</td>
                        </tr>
                      ))}
                      {missingCount > 0 && (
                        <tr className="font-medium bg-gray-100">
                          <td className="px-4 py-2 text-sm text-gray-700">(Missing)</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-900">{missingCount}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-900">
                            {includeMissingInPercent ? formatPercent((missingCount / totalCount) * 100, totalCount) : '-'}%
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-500">-</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">Total</td>
                        <td className="px-4 py-2 text-sm font-medium text-right text-gray-900">
                          {includeMissingInPercent ? totalCount : validCount}
                        </td>
                        <td className="px-4 py-2 text-sm font-medium text-right text-gray-900">100%</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-500">-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Export Actions */}
                <div className="px-4 pb-4">
                  <ResultsActions
                    actions={[
                      {
                        label: 'Export CSV',
                        onClick: exportToCSV,
                        icon: ExportIcons.csv,
                        variant: 'primary',
                      },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Right Column - Summary Statistics (for numeric variables) */}
            {numericStats && (
              <div className="space-y-4">
                {/* Central Tendency */}
                <div className="border rounded-lg p-4 bg-white border-gray-200">
                  <h4 className="text-sm font-semibold mb-4 text-gray-900">Central Tendency</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 rounded-lg bg-blue-50">
                      <p className="text-2xl font-bold text-blue-900">{formatNumber(numericStats.mean)}</p>
                      <p className="text-xs text-blue-700">Mean</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-green-50">
                      <p className="text-2xl font-bold text-green-900">{formatNumber(numericStats.median)}</p>
                      <p className="text-xs text-green-700">Median</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-purple-50">
                      <p className="text-2xl font-bold text-purple-900">
                        {numericStats.mode !== null ? formatNumber(numericStats.mode) : '-'}
                      </p>
                      <p className="text-xs text-purple-700">Mode</p>
                    </div>
                  </div>
                </div>

                {/* Distribution */}
                <div className="border rounded-lg p-4 bg-white border-gray-200">
                  <h4 className="text-sm font-semibold mb-4 text-gray-900">Distribution</h4>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.min)}</p>
                      <p className="text-xs text-gray-500">Min</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.q1)}</p>
                      <p className="text-xs text-gray-500">Q1</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-blue-600">{formatNumber(numericStats.median)}</p>
                      <p className="text-xs text-gray-500">Median</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.q3)}</p>
                      <p className="text-xs text-gray-500">Q3</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.max)}</p>
                      <p className="text-xs text-gray-500">Max</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-gray-500">Range</p>
                      <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.range)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">IQR</p>
                      <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.iqr)}</p>
                    </div>
                  </div>
                </div>

                {/* Dispersion */}
                <div className="border rounded-lg p-4 bg-white border-gray-200">
                  <h4 className="text-sm font-semibold mb-4 text-gray-900">Dispersion</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Std Dev</p>
                      <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.stdDev)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Variance</p>
                      <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.variance)}</p>
                    </div>
                  </div>
                </div>

                {/* Count Info */}
                <div className="border rounded-lg p-4 bg-gray-50 border-gray-200">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{numericStats.count}</p>
                      <p className="text-xs text-gray-500">Valid</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{numericStats.missing}</p>
                      <p className="text-xs text-gray-500">Missing</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{formatNumber(numericStats.sum, 0)}</p>
                      <p className="text-xs text-gray-500">Sum</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* For non-numeric variables, show summary */}
            {selectedColumn && selectedColumn.type !== 'number' && (
              <div className="border rounded-lg p-4 bg-white border-gray-200">
                <h4 className="text-sm font-semibold mb-4 text-gray-900">Categorical Summary</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Total observations</span>
                    <span className="text-sm font-medium text-gray-900">{totalCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Valid responses</span>
                    <span className="text-sm font-medium text-gray-900">{validCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Missing</span>
                    <span className="text-sm font-medium text-gray-900">{missingCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Unique values</span>
                    <span className="text-sm font-medium text-gray-900">{frequency.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Most common</span>
                    <span className="text-sm font-medium text-gray-900">
                      {frequency[0]?.value || '-'} ({frequency[0]?.count || 0})
                    </span>
                  </div>
                </div>

                <AdvancedOptions>
                  <div className="text-xs text-gray-600 space-y-2">
                    <p>
                      <strong>Data Quality Tips:</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Check for unexpected values or misspellings</li>
                      <li>Review missing data patterns</li>
                      <li>Consider grouping rare categories</li>
                    </ul>
                  </div>
                </AdvancedOptions>
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedVar && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Select a variable above to view statistics</p>
          <p className="text-sm mt-2">Choose any variable to see frequency distributions and summary metrics</p>
        </div>
      )}
    </div>
  );
}
