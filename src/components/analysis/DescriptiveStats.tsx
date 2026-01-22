import { useState, useMemo } from 'react';
import type { Dataset } from '../../types/analysis';
import { calculateDescriptiveStats, calculateFrequency } from '../../utils/statistics';
import type { DescriptiveStats as DescStats, FrequencyItem } from '../../utils/statistics';
import { DescriptiveStatsTutorial } from '../tutorials/DescriptiveStatsTutorial';

interface DescriptiveStatsProps {
  dataset: Dataset;
}

interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
  label: string;
}

export function DescriptiveStats({ dataset }: DescriptiveStatsProps) {
  const [selectedVar, setSelectedVar] = useState<string>('');
  const [binWidth, setBinWidth] = useState<number | null>(null);

  const selectedColumn = dataset.columns.find(c => c.key === selectedVar);

  const values = useMemo(() => {
    if (!selectedVar) return [];
    return dataset.records.map(r => r[selectedVar]);
  }, [dataset.records, selectedVar]);

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

  // Calculate default bin width using Sturges' rule or similar
  const defaultBinWidth = useMemo(() => {
    if (!numericStats || numericValues.length === 0) return 1;
    const range = numericStats.max - numericStats.min;
    if (range === 0) return 1;
    // Sturges' rule for number of bins: k = ceil(log2(n) + 1)
    const numBins = Math.ceil(Math.log2(numericValues.length) + 1);
    const width = range / numBins;
    // Round to a nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(width)));
    const normalized = width / magnitude;
    let niceWidth;
    if (normalized <= 1) niceWidth = 1;
    else if (normalized <= 2) niceWidth = 2;
    else if (normalized <= 5) niceWidth = 5;
    else niceWidth = 10;
    return niceWidth * magnitude;
  }, [numericStats, numericValues]);

  // Use user-defined bin width or default
  const effectiveBinWidth = binWidth !== null ? binWidth : defaultBinWidth;

  // Calculate histogram bins
  const histogramBins: HistogramBin[] = useMemo(() => {
    if (!numericStats || numericValues.length === 0 || effectiveBinWidth <= 0) return [];

    const min = numericStats.min;
    const max = numericStats.max;
    const bins: HistogramBin[] = [];

    // Calculate bin start (round down to bin width)
    const binStart = Math.floor(min / effectiveBinWidth) * effectiveBinWidth;
    const binEnd = Math.ceil(max / effectiveBinWidth) * effectiveBinWidth;

    for (let start = binStart; start < binEnd; start += effectiveBinWidth) {
      const end = start + effectiveBinWidth;
      const count = numericValues.filter(v => v >= start && v < end).length;
      // Handle last bin to include max value
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

  const frequency: FrequencyItem[] = useMemo(() => {
    if (!selectedVar) return [];
    return calculateFrequency(values);
  }, [values, selectedVar]);

  const formatNumber = (n: number, decimals: number = 2): string => {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return n.toFixed(decimals);
  };

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

  // Format percentage based on sample size: 2 sig figs if n < 1000, 3 sig figs if n >= 1000
  const formatPercent = (value: number, sampleSize: number): string => {
    const sigFigs = sampleSize >= 1000 ? 3 : 2;
    return formatSigFigs(value, sigFigs);
  };

  // Calculate total sample size for percentage formatting
  const totalSampleSize = useMemo(() => {
    return frequency.reduce((sum, item) => sum + item.count, 0);
  }, [frequency]);

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Descriptive Statistics</h3>
        <p className="text-sm text-gray-600 mb-4">
          Select a variable to see frequency distributions and summary statistics.
        </p>
      </div>

      {/* Tutorial Component */}
      <DescriptiveStatsTutorial />

      {/* Variable Selection */}
      <div className="max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Variable</label>
        <select
          value={selectedVar}
          onChange={(e) => setSelectedVar(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select variable...</option>
          {dataset.columns.map(col => (
            <option key={col.key} value={col.key}>
              {col.label} ({col.type})
            </option>
          ))}
        </select>
      </div>

      {selectedVar && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Histogram (for numeric variables) - Top Left */}
            {numericStats && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-gray-900">Histogram</h4>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Bin width:</label>
                    <input
                      type="number"
                      value={binWidth !== null ? binWidth : defaultBinWidth}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          setBinWidth(val);
                        }
                      }}
                      step="any"
                      min="0.01"
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                    />
                    {binWidth !== null && (
                      <button
                        onClick={() => setBinWidth(null)}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Histogram Chart - Vertical */}
                {histogramBins.length > 0 && (
                  <div className="flex flex-col">
                    {/* Bars */}
                    <div className="flex items-end justify-between gap-1 h-48 mb-2">
                      {histogramBins.map((bin, index) => (
                        <div key={index} className="flex-1 flex flex-col items-center h-full">
                          <span className="text-xs text-gray-700 font-medium mb-1">
                            {bin.count > 0 ? bin.count : ''}
                          </span>
                          <div className="flex-1 w-full bg-gray-100 rounded-t overflow-hidden flex items-end">
                            <div
                              className="w-full bg-blue-500 transition-all rounded-t"
                              style={{ height: `${(bin.count / maxBinCount) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* X-axis labels */}
                    <div className="flex justify-between gap-1 border-t border-gray-300 pt-2">
                      {histogramBins.map((bin, index) => (
                        <div key={index} className="flex-1 text-center">
                          <span
                            className="text-xs text-gray-600 block truncate"
                            title={bin.label}
                          >
                            {bin.binStart.toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {histogramBins.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No data to display</p>
                )}
              </div>
            )}

            {/* Frequency Distribution - Bottom Left */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Frequency Distribution</h4>
                <p className="text-xs text-gray-500">{selectedColumn?.label}</p>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">%</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cum %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {frequency.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-900">{item.value}</td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">{item.count}</td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">{formatPercent(item.percent, totalSampleSize)}%</td>
                        <td className="px-4 py-2 text-sm text-gray-500 text-right">{formatPercent(item.cumPercent, totalSampleSize)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">Total</td>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">
                        {frequency.reduce((sum, item) => sum + item.count, 0)}
                      </td>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">100%</td>
                      <td className="px-4 py-2 text-sm text-gray-500 text-right">-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column - Summary Statistics (for numeric variables) */}
          {numericStats && (
            <div className="space-y-4">
              {/* Central Tendency */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Central Tendency</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-900">{formatNumber(numericStats.mean)}</p>
                    <p className="text-xs text-blue-700">Mean</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-900">{formatNumber(numericStats.median)}</p>
                    <p className="text-xs text-green-700">Median</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-900">
                      {numericStats.mode !== null ? formatNumber(numericStats.mode) : '-'}
                    </p>
                    <p className="text-xs text-purple-700">Mode</p>
                  </div>
                </div>
              </div>

              {/* Distribution */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Distribution</h4>

                {/* Five Number Summary */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.min)}</p>
                    <p className="text-xs text-gray-500">Min</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.q1)}</p>
                    <p className="text-xs text-gray-500">Q1 (25%)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-blue-600">{formatNumber(numericStats.median)}</p>
                    <p className="text-xs text-gray-500">Median</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.q3)}</p>
                    <p className="text-xs text-gray-500">Q3 (75%)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.max)}</p>
                    <p className="text-xs text-gray-500">Max</p>
                  </div>
                </div>

                {/* Box Plot Visualization */}
                <div className="relative h-8 bg-gray-100 rounded">
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
                        className="absolute top-1 bottom-1 bg-blue-200 border border-blue-400 rounded"
                        style={{
                          left: `${((numericStats.q1 - numericStats.min) / numericStats.range) * 100}%`,
                          right: `${((numericStats.max - numericStats.q3) / numericStats.range) * 100}%`,
                        }}
                      />
                      {/* Median line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-blue-600"
                        style={{
                          left: `${((numericStats.median - numericStats.min) / numericStats.range) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Dispersion */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Dispersion</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Standard Deviation</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.stdDev)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Variance</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.variance)}</p>
                  </div>
                </div>
              </div>

              {/* Count Info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
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
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Summary</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Total responses</span>
                  <span className="text-sm font-medium text-gray-900">
                    {frequency.reduce((sum, item) => sum + item.count, 0)}
                  </span>
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
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Missing</span>
                  <span className="text-sm font-medium text-gray-900">
                    {dataset.records.length - frequency.reduce((sum, item) => sum + item.count, 0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedVar && (
        <div className="text-center py-12 text-gray-400">
          <p>Select a variable to view statistics</p>
        </div>
      )}
    </div>
  );
}
