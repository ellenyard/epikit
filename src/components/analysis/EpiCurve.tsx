import { useState, useMemo, useRef } from 'react';
import type { Dataset } from '../../types/analysis';
import {
  processEpiCurveData,
  getColorForStrata,
} from '../../utils/epiCurve';
import type { BinSize, ColorScheme, Annotation, EpiCurveData } from '../../utils/epiCurve';

interface EpiCurveProps {
  dataset: Dataset;
}

// Expandable refresher component
function Refresher({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-600 text-lg">💡</span>
          <span className="font-medium text-amber-900">{title}</span>
        </div>
        <svg
          className={`w-5 h-5 text-amber-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 py-4 bg-white border-t border-amber-200">
          {children}
        </div>
      )}
    </div>
  );
}

export function EpiCurve({ dataset }: EpiCurveProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Configuration state
  const [dateColumn, setDateColumn] = useState<string>('');
  const [binSize, setBinSize] = useState<BinSize>('daily');
  const [stratifyBy, setStratifyBy] = useState<string>('');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('default');

  // Filter state
  const [filterBy, setFilterBy] = useState<string>('');
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(new Set());
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);

  // Display options
  const [showGridLines, setShowGridLines] = useState(true);
  const [showCaseCounts, setShowCaseCounts] = useState(true);
  const [chartTitle, setChartTitle] = useState('Epidemic Curve');
  const [xAxisLabel, setXAxisLabel] = useState('Date of Onset');
  const [yAxisLabel, setYAxisLabel] = useState('Number of Cases');

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState({
    type: 'exposure' as Annotation['type'],
    date: '',
    endDate: '',
    label: '',
    minDays: '',
    maxDays: '',
  });

  // Refresher
  const [showRefresher, setShowRefresher] = useState(false);

  // Find date columns
  const dateColumns = dataset.columns.filter(c => c.type === 'date' || c.key.toLowerCase().includes('date'));

  // Auto-select first date column
  useMemo(() => {
    if (!dateColumn && dateColumns.length > 0) {
      setDateColumn(dateColumns[0].key);
    }
  }, [dateColumns, dateColumn]);

  // Get unique values for the filter dropdown
  const filterValues = useMemo(() => {
    if (!filterBy) return [];
    const values = new Set(dataset.records.map(r => String(r[filterBy] ?? 'Unknown')));
    return Array.from(values).sort();
  }, [dataset.records, filterBy]);

  // Reset selected filter values when filter variable changes
  useMemo(() => {
    setSelectedFilterValues(new Set());
    setShowAllFilterValues(false);
  }, [filterBy]);

  // Apply filter to records
  const filteredRecords = useMemo(() => {
    if (!filterBy || selectedFilterValues.size === 0) {
      return dataset.records;
    }
    return dataset.records.filter(record => {
      const value = String(record[filterBy] ?? 'Unknown');
      return selectedFilterValues.has(value);
    });
  }, [dataset.records, filterBy, selectedFilterValues]);

  // Process data
  const curveData: EpiCurveData = useMemo(() => {
    if (!dateColumn) {
      return { bins: [], maxCount: 0, strataKeys: [], dateRange: { start: new Date(), end: new Date() } };
    }
    return processEpiCurveData(filteredRecords, dateColumn, binSize, stratifyBy || undefined);
  }, [filteredRecords, dateColumn, binSize, stratifyBy]);

  const addAnnotation = () => {
    if (!newAnnotation.date) return;

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: newAnnotation.type,
      date: new Date(newAnnotation.date),
      label: newAnnotation.label || newAnnotation.type,
      color: newAnnotation.type === 'exposure' ? '#DC2626' :
             newAnnotation.type === 'intervention' ? '#059669' : '#7C3AED',
    };

    if (newAnnotation.type === 'incubation' && newAnnotation.minDays && newAnnotation.maxDays) {
      const minDays = parseFloat(newAnnotation.minDays);
      const maxDays = parseFloat(newAnnotation.maxDays);
      if (!isNaN(minDays) && !isNaN(maxDays)) {
        const endDate = new Date(newAnnotation.date);
        endDate.setDate(endDate.getDate() + maxDays);
        annotation.endDate = endDate;
        annotation.label = newAnnotation.label || `Incubation period (${minDays}-${maxDays} days)`;
      }
    } else if (newAnnotation.endDate) {
      annotation.endDate = new Date(newAnnotation.endDate);
    }

    setAnnotations([...annotations, annotation]);
    setNewAnnotation({ type: 'exposure', date: '', endDate: '', label: '', minDays: '', maxDays: '' });
    setShowAnnotationForm(false);
  };

  const removeAnnotation = (id: string) => {
    setAnnotations(annotations.filter(a => a.id !== id));
  };

  const exportChart = async (format: 'png' | 'svg') => {
    if (!chartRef.current) return;

    if (format === 'svg') {
      // Create SVG export
      const svgContent = generateSVG(curveData, chartTitle, xAxisLabel, yAxisLabel, showGridLines, showCaseCounts, stratifyBy, colorScheme);
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      downloadBlob(blob, `${chartTitle.replace(/\s+/g, '_')}.svg`);
    } else {
      // PNG export using canvas
      const canvas = await generateCanvas(chartRef.current);
      canvas.toBlob(blob => {
        if (blob) downloadBlob(blob, `${chartTitle.replace(/\s+/g, '_')}.png`);
      });
    }
  };

  const barWidth = Math.max(20, Math.min(60, 800 / (curveData.bins.length || 1)));
  const chartHeight = 300;

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Left Panel - Controls */}
      <div className="w-full lg:w-72 flex-shrink-0 bg-gray-50 border-b lg:border-b-0 lg:border-r border-gray-200 p-4 overflow-y-auto">
        <div className="space-y-4">
          {/* Summary */}
          <div className="text-sm text-gray-600 pb-3 border-b border-gray-200">
            <span className="font-medium">{filteredRecords.length}</span> of {dataset.records.length} cases
            {curveData.bins.length > 0 && (
              <span className="text-gray-400"> · Peak: {curveData.maxCount}</span>
            )}
          </div>

          {/* Filter By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter By</label>
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">None (show all)</option>
              {dataset.columns.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>

            {/* Filter value checkboxes */}
            {filterBy && filterValues.length > 0 && (
              <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Select values:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedFilterValues(new Set(filterValues))}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      All
                    </button>
                    <button
                      onClick={() => setSelectedFilterValues(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {(showAllFilterValues ? filterValues : filterValues.slice(0, 5)).map(value => {
                    const count = dataset.records.filter(r => String(r[filterBy] ?? 'Unknown') === value).length;
                    return (
                      <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedFilterValues.has(value)}
                          onChange={(e) => {
                            const newSet = new Set(selectedFilterValues);
                            if (e.target.checked) {
                              newSet.add(value);
                            } else {
                              newSet.delete(value);
                            }
                            setSelectedFilterValues(newSet);
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-gray-700 truncate flex-1">{value}</span>
                        <span className="text-gray-400 text-xs">({count})</span>
                      </label>
                    );
                  })}
                </div>
                {filterValues.length > 5 && (
                  <button
                    onClick={() => setShowAllFilterValues(!showAllFilterValues)}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-700"
                  >
                    {showAllFilterValues ? 'Show less' : `Show ${filterValues.length - 5} more...`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Date Column */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Column</label>
            <select
              value={dateColumn}
              onChange={(e) => setDateColumn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select date column...</option>
              {dataset.columns.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>

          {/* Bin Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bin Size</label>
            <select
              value={binSize}
              onChange={(e) => setBinSize(e.target.value as BinSize)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="hourly">Hourly</option>
              <option value="6hour">6-Hour</option>
              <option value="12hour">12-Hour</option>
              <option value="daily">Daily</option>
              <option value="weekly-cdc">Weekly (CDC/MMWR)</option>
              <option value="weekly-iso">Weekly (ISO)</option>
            </select>
          </div>

          {/* Stratify By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stratify By</label>
            <select
              value={stratifyBy}
              onChange={(e) => setStratifyBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">None</option>
              {dataset.columns.filter(c => c.type !== 'date').map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>

          {/* Formatting Section */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Formatting</p>
          </div>

          {/* Color Scheme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
            <select
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="default">Default</option>
              <option value="classification">Classification</option>
              <option value="colorblind">Colorblind-Friendly</option>
              <option value="grayscale">Grayscale</option>
            </select>
          </div>

          {/* Display Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showGridLines}
                onChange={(e) => setShowGridLines(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">Grid Lines</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showCaseCounts}
                onChange={(e) => setShowCaseCounts(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">Case Counts</span>
            </label>
          </div>

          {/* Labels Section */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Labels</p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Chart Title</label>
            <input
              type="text"
              value={chartTitle}
              onChange={(e) => setChartTitle(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">X-Axis Label</label>
            <input
              type="text"
              value={xAxisLabel}
              onChange={(e) => setXAxisLabel(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Y-Axis Label</label>
            <input
              type="text"
              value={yAxisLabel}
              onChange={(e) => setYAxisLabel(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
            />
          </div>

          {/* Annotations Section */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Annotations</p>
              <button
                onClick={() => setShowAnnotationForm(!showAnnotationForm)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {showAnnotationForm ? 'Cancel' : '+ Add'}
              </button>
            </div>

            {/* Annotation Form */}
            {showAnnotationForm && (
              <div className="space-y-2 mb-3 p-3 bg-white border border-gray-200 rounded-lg">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Type</label>
                  <select
                    value={newAnnotation.type}
                    onChange={(e) => setNewAnnotation({ ...newAnnotation, type: e.target.value as Annotation['type'] })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    <option value="exposure">Exposure Event</option>
                    <option value="intervention">Intervention</option>
                    <option value="incubation">Incubation Period</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={newAnnotation.date}
                    onChange={(e) => setNewAnnotation({ ...newAnnotation, date: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                {newAnnotation.type === 'incubation' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Min Days</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={newAnnotation.minDays}
                        onChange={(e) => setNewAnnotation({ ...newAnnotation, minDays: e.target.value })}
                        placeholder="0.5"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Max Days</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={newAnnotation.maxDays}
                        onChange={(e) => setNewAnnotation({ ...newAnnotation, maxDays: e.target.value })}
                        placeholder="3"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Label</label>
                    <input
                      type="text"
                      value={newAnnotation.label}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, label: e.target.value })}
                      placeholder="Optional label"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                )}
                <button
                  onClick={addAnnotation}
                  className="w-full px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Add Annotation
                </button>
              </div>
            )}

            {/* Active Annotations */}
            {annotations.length > 0 && (
              <div className="space-y-1">
                {annotations.map(ann => (
                  <div
                    key={ann.id}
                    className="flex items-center justify-between px-2 py-1 text-xs rounded"
                    style={{ backgroundColor: `${ann.color}15` }}
                  >
                    <span style={{ color: ann.color }}>{ann.label}</span>
                    <button
                      onClick={() => removeAnnotation(ann.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Export Section */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            <button
              onClick={() => exportChart('png')}
              disabled={curveData.bins.length === 0}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export PNG
            </button>
            <button
              onClick={() => exportChart('svg')}
              disabled={curveData.bins.length === 0}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export SVG
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - Chart */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Chart */}
      {curveData.bins.length > 0 ? (
        <div ref={chartRef} className="bg-white border border-gray-200 rounded-lg p-4">
          {/* Title */}
          <h4 className="text-center text-lg font-semibold text-gray-900 mb-4">{chartTitle}</h4>

          {/* Chart Area */}
          <div className="flex">
            {/* Y-Axis Label */}
            <div className="flex items-center justify-center w-8">
              <span className="text-xs font-bold text-gray-500 transform -rotate-90 whitespace-nowrap">
                {yAxisLabel}
              </span>
            </div>

            {/* Y-Axis */}
            <div className="flex flex-col justify-between h-[300px] pr-2 text-right">
              {[...Array(6)].map((_, i) => {
                const value = Math.round((curveData.maxCount * (5 - i)) / 5);
                return (
                  <span key={i} className="text-xs text-gray-500">{value}</span>
                );
              })}
            </div>

            {/* Chart Body */}
            <div className="flex-1 overflow-x-auto">
              <div className="relative" style={{ minWidth: curveData.bins.length * barWidth + 50 }}>
                {/* Grid Lines */}
                {showGridLines && (
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="border-b border-gray-100 w-full" />
                    ))}
                  </div>
                )}

                {/* Annotations */}
                {annotations.map(ann => (
                  <AnnotationMarker
                    key={ann.id}
                    annotation={ann}
                    bins={curveData.bins}
                    barWidth={barWidth}
                    chartHeight={chartHeight}
                  />
                ))}

                {/* Bars */}
                <div className="flex items-end" style={{ height: chartHeight }}>
                  {curveData.bins.map((bin, binIndex) => (
                    <div
                      key={binIndex}
                      className="flex flex-col justify-end relative"
                      style={{ width: barWidth }}
                    >
                      {stratifyBy && curveData.strataKeys.length > 0 ? (
                        // Stacked bars
                        <div className="flex flex-col-reverse">
                          {curveData.strataKeys.map((strataKey, strataIndex) => {
                            const count = bin.strata.get(strataKey)?.length || 0;
                            if (count === 0) return null;
                            const height = (count / curveData.maxCount) * chartHeight;
                            return (
                              <div
                                key={strataKey}
                                className="mx-0.5 hover:opacity-80 transition-opacity"
                                style={{
                                  height,
                                  backgroundColor: getColorForStrata(strataKey, strataIndex, colorScheme, curveData.strataKeys),
                                }}
                                title={`${bin.label}: ${strataKey} (${count})`}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        // Single bar
                        <div
                          className="mx-0.5 bg-blue-500 hover:bg-blue-600 transition-colors"
                          style={{
                            height: (bin.total / curveData.maxCount) * chartHeight,
                          }}
                          title={`${bin.label}: ${bin.total} cases`}
                        />
                      )}

                      {/* Case count label */}
                      {showCaseCounts && bin.total > 0 && (
                        <div
                          className="absolute text-center text-xs font-medium text-gray-700 w-full"
                          style={{
                            bottom: `${(bin.total / curveData.maxCount) * chartHeight + 2}px`
                          }}
                        >
                          {bin.total}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* X-Axis Labels */}
                <div className="flex mt-2 mb-12">
                  {curveData.bins.map((bin, index) => (
                    <div
                      key={index}
                      className="text-center"
                      style={{ width: barWidth }}
                    >
                      <span className="text-xs text-gray-500 transform -rotate-45 inline-block origin-top-left whitespace-nowrap">
                        {bin.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* X-Axis Label */}
          <div className="text-center mt-8">
            <span className="text-xs font-bold text-gray-500">{xAxisLabel}</span>
          </div>

          {/* Summary Stats */}
          <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-gray-600">
            <span>Cases: <strong>{filteredRecords.length}</strong>{filterBy && selectedFilterValues.size > 0 && ` of ${dataset.records.length}`}</span>
            <span>Date Range: <strong>
              {curveData.dateRange.start.toLocaleDateString()} - {curveData.dateRange.end.toLocaleDateString()}
            </strong></span>
            <span>Peak: <strong>{curveData.maxCount} cases</strong></span>
          </div>
        </div>
      ) : dateColumn ? (
        <div className="text-center py-12 text-gray-400">
          No valid date data found in the selected column
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          Select a date column to generate the epidemic curve
        </div>
      )}

      {/* Refresher Toggle */}
      <div className="mt-6 mb-4">
        <button
          onClick={() => setShowRefresher(!showRefresher)}
          className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-800 font-medium"
        >
          <span className="text-lg">💡</span>
          <span>{showRefresher ? 'Hide' : 'Show'} Refresher: Epidemic Curves</span>
          <svg
            className={`w-4 h-4 transition-transform ${showRefresher ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Refresher Content */}
      {showRefresher && (
        <div className="mt-4 space-y-4">
          <Refresher title="What is an Epidemic Curve?">
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                An <strong>epidemic curve</strong> (epi curve) is a histogram showing the distribution
                of case onset times during an outbreak. It's one of the most important tools in
                outbreak investigation.
              </p>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="font-medium text-blue-900 mb-1">An epi curve tells you:</p>
                <ul className="text-blue-800 space-y-1 list-disc list-inside">
                  <li>The <strong>magnitude</strong> of the outbreak (total cases)</li>
                  <li>The <strong>time trend</strong> - is it increasing, decreasing, or stable?</li>
                  <li>Potential <strong>outliers</strong> - cases that don't fit the pattern</li>
                  <li>The likely <strong>mode of transmission</strong> (from the shape)</li>
                  <li>The probable <strong>time of exposure</strong> (for point-source outbreaks)</li>
                </ul>
              </div>
              <p>
                <strong>X-axis:</strong> Time (usually date of symptom onset)<br/>
                <strong>Y-axis:</strong> Number of cases
              </p>
            </div>
          </Refresher>

          <Refresher title="Interpreting Epi Curve Shapes">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium mb-2">Point Source</p>
                  <div className="h-12 flex items-end justify-center gap-0.5 mb-2">
                    <div className="w-2 h-2 bg-blue-400"></div>
                    <div className="w-2 h-4 bg-blue-500"></div>
                    <div className="w-2 h-8 bg-blue-500"></div>
                    <div className="w-2 h-12 bg-blue-600"></div>
                    <div className="w-2 h-10 bg-blue-500"></div>
                    <div className="w-2 h-6 bg-blue-500"></div>
                    <div className="w-2 h-3 bg-blue-400"></div>
                    <div className="w-2 h-1 bg-blue-300"></div>
                  </div>
                  <p className="text-xs text-gray-600">
                    Steep rise, gradual decline. All cases from single exposure (e.g., contaminated food at event).
                    Duration ≈ one incubation period.
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium mb-2">Continuous Source</p>
                  <div className="h-12 flex items-end justify-center gap-0.5 mb-2">
                    <div className="w-2 h-3 bg-blue-400"></div>
                    <div className="w-2 h-5 bg-blue-500"></div>
                    <div className="w-2 h-7 bg-blue-500"></div>
                    <div className="w-2 h-8 bg-blue-600"></div>
                    <div className="w-2 h-8 bg-blue-600"></div>
                    <div className="w-2 h-9 bg-blue-600"></div>
                    <div className="w-2 h-8 bg-blue-600"></div>
                    <div className="w-2 h-7 bg-blue-500"></div>
                  </div>
                  <p className="text-xs text-gray-600">
                    Plateau pattern. Ongoing exposure to contaminated source (e.g., contaminated water supply).
                    Continues until source removed.
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium mb-2">Propagated (Person-to-Person)</p>
                  <div className="h-12 flex items-end justify-center gap-0.5 mb-2">
                    <div className="w-2 h-3 bg-blue-400"></div>
                    <div className="w-2 h-2 bg-blue-300"></div>
                    <div className="w-2 h-1 bg-blue-200"></div>
                    <div className="w-2 h-5 bg-blue-500"></div>
                    <div className="w-2 h-4 bg-blue-400"></div>
                    <div className="w-2 h-2 bg-blue-300"></div>
                    <div className="w-2 h-8 bg-blue-600"></div>
                    <div className="w-2 h-6 bg-blue-500"></div>
                  </div>
                  <p className="text-xs text-gray-600">
                    Multiple peaks, each ~one incubation period apart.
                    Person-to-person transmission (e.g., measles, norovirus).
                  </p>
                </div>
              </div>
              <p className="text-gray-500 italic">
                Many outbreaks show mixed patterns - start as point source, then propagated spread.
              </p>
            </div>
          </Refresher>

          <Refresher title="Choosing the Right Time Interval (Bin Size)">
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                The time interval (bin size) affects how the curve looks and what patterns you can see.
                The general rule is to use an interval that's <strong>1/4 to 1/3 of the incubation period</strong>.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Disease Type</th>
                      <th className="px-3 py-2 text-left">Typical Incubation</th>
                      <th className="px-3 py-2 text-left">Suggested Interval</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr>
                      <td className="px-3 py-2">Staphylococcal food poisoning</td>
                      <td className="px-3 py-2">1-6 hours</td>
                      <td className="px-3 py-2 font-medium">Hourly</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Norovirus, Salmonella</td>
                      <td className="px-3 py-2">12-72 hours</td>
                      <td className="px-3 py-2 font-medium">6-12 hours</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Hepatitis A, Typhoid</td>
                      <td className="px-3 py-2">2-6 weeks</td>
                      <td className="px-3 py-2 font-medium">Daily</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Tuberculosis, HIV</td>
                      <td className="px-3 py-2">Weeks to months</td>
                      <td className="px-3 py-2 font-medium">Weekly or Monthly</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-blue-800">
                  <strong>Tip:</strong> Try different bin sizes! If your curve looks too jagged,
                  increase the interval. If it's too smooth and hides patterns, decrease it.
                </p>
              </div>
            </div>
          </Refresher>

          <Refresher title="Estimating Exposure Time">
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                For <strong>point-source outbreaks</strong>, you can estimate when exposure occurred
                by working backward from the epi curve using the incubation period.
              </p>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <p className="font-medium">Method:</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-600">
                  <li>Find the <strong>peak</strong> of the epi curve</li>
                  <li>Subtract the <strong>average incubation period</strong> → probable exposure date</li>
                  <li>Use the <strong>first case</strong> minus <strong>minimum incubation</strong> → earliest possible exposure</li>
                  <li>Use the <strong>last case</strong> minus <strong>maximum incubation</strong> → latest possible exposure</li>
                </ol>
              </div>
              <p>
                <strong>Example:</strong> Peak onset is January 15. Salmonella incubation is 12-72 hours (avg 24 hours).
                Probable exposure: January 14. Exposure window: January 12-14.
              </p>
              <p className="text-gray-500 italic">
                This tool's "Add Annotation" feature lets you mark exposure events and overlay
                incubation periods on your curve.
              </p>
            </div>
          </Refresher>

          <Refresher title="Using Stratification">
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <strong>Stratifying</strong> your epi curve by a variable (age, sex, location, exposure)
                creates stacked bars that can reveal important patterns.
              </p>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="font-medium text-blue-900 mb-1">Stratification can show:</p>
                <ul className="text-blue-800 space-y-1 list-disc list-inside">
                  <li>Which <strong>groups were affected first</strong> (possible source)</li>
                  <li>Whether cases <strong>spread between groups</strong> over time</li>
                  <li>Different <strong>exposure events</strong> affecting different groups</li>
                  <li><strong>Secondary transmission</strong> patterns (e.g., household contacts appearing later)</li>
                </ul>
              </div>
              <p>
                <strong>Example:</strong> In a restaurant outbreak, stratifying by seating area might
                show that Dining Room A cases peaked first, suggesting the exposure was localized there.
              </p>
            </div>
          </Refresher>

          <Refresher title="Common Pitfalls">
            <div className="space-y-3 text-sm text-gray-700">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <span className="text-red-500">✗</span>
                  <div>
                    <p className="font-medium">Using report date instead of onset date</p>
                    <p className="text-gray-500">Report dates reflect surveillance delays, not disease timing. Always use symptom onset when available.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500">✗</span>
                  <div>
                    <p className="font-medium">Wrong time interval</p>
                    <p className="text-gray-500">Too large: hides patterns. Too small: creates noise. Match to incubation period.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500">✗</span>
                  <div>
                    <p className="font-medium">Forgetting the curve is incomplete</p>
                    <p className="text-gray-500">Cases with recent onset may not be reported yet. The right tail often rises as data comes in.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500">✗</span>
                  <div>
                    <p className="font-medium">Ignoring outliers</p>
                    <p className="text-gray-500">Early outliers might be the index case or a misclassified case. Late outliers might indicate secondary transmission.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500">✗</span>
                  <div>
                    <p className="font-medium">Over-interpreting small numbers</p>
                    <p className="text-gray-500">With few cases, random variation can create apparent patterns. Be cautious with &lt;20 cases.</p>
                  </div>
                </div>
              </div>
            </div>
          </Refresher>
        </div>
      )}
      </div>
    </div>
  );
}

// Annotation marker component - displays as a flag
function AnnotationMarker({ annotation, bins, barWidth, chartHeight }: {
  annotation: Annotation;
  bins: EpiCurveData['bins'];
  barWidth: number;
  chartHeight: number;
}) {
  if (bins.length === 0) return null;

  // Find position by matching the annotation date to bins
  // Use date string comparison to avoid timezone issues
  const getDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // For the annotation, get both the UTC date and local date strings
  // and try to match either one to handle timezone edge cases
  const annDateUTC = annotation.date.toISOString().split('T')[0];
  const annDateLocal = getDateStr(annotation.date);

  let x: number = 0;
  let binIndex = -1;

  // Try to find a bin that matches the annotation date
  for (let i = 0; i < bins.length; i++) {
    const binDateStr = getDateStr(bins[i].startDate);
    // Check if either interpretation of the annotation date matches this bin
    if (binDateStr === annDateUTC || binDateStr === annDateLocal) {
      binIndex = i;
      break;
    }
  }

  // If no exact match, fall back to timestamp comparison
  if (binIndex === -1) {
    const annotationTime = annotation.date.getTime();
    const firstBinStart = bins[0].startDate.getTime();
    const lastBinEnd = bins[bins.length - 1].endDate.getTime();

    if (annotationTime < firstBinStart) {
      x = 0;
    } else if (annotationTime >= lastBinEnd) {
      x = bins.length * barWidth;
    } else {
      binIndex = bins.findIndex(b => annotationTime >= b.startDate.getTime() && annotationTime < b.endDate.getTime());
      x = binIndex !== -1 ? binIndex * barWidth + barWidth / 2 : 0;
    }
  }

  // Calculate x position - center of the bin
  if (binIndex !== -1) {
    x = binIndex * barWidth + barWidth / 2;
  }

  // For incubation period ranges, show shaded area
  if (annotation.endDate) {
    // Find end position using same date matching logic
    const endDateUTC = annotation.endDate.toISOString().split('T')[0];
    const endDateLocal = getDateStr(annotation.endDate);
    let endBinIndex = -1;

    for (let i = 0; i < bins.length; i++) {
      const binDateStr = getDateStr(bins[i].startDate);
      if (binDateStr === endDateUTC || binDateStr === endDateLocal) {
        endBinIndex = i;
        break;
      }
    }

    let endX: number;
    if (endBinIndex !== -1) {
      endX = (endBinIndex + 1) * barWidth;
    } else {
      // Fallback to timestamp comparison
      const endTime = annotation.endDate.getTime();
      const lastBinEnd = bins[bins.length - 1].endDate.getTime();
      if (endTime >= lastBinEnd) {
        endX = bins.length * barWidth;
      } else {
        const foundIndex = bins.findIndex(b => endTime >= b.startDate.getTime() && endTime < b.endDate.getTime());
        endX = foundIndex !== -1 ? (foundIndex + 1) * barWidth : bins.length * barWidth;
      }
    }

    const width = Math.max(endX - x, barWidth);

    return (
      <div
        className="absolute top-0 pointer-events-none"
        style={{
          left: x,
          width,
          height: chartHeight,
        }}
        title={annotation.label}
      >
        {/* Shaded region */}
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundColor: annotation.color }}
        />
        {/* Flag at start - pole centered on start date */}
        <div className="absolute top-0 left-0">
          {/* Flag pennant - positioned to the right of the pole */}
          <div
            className="absolute px-2 py-1 text-xs font-medium text-white shadow-md"
            style={{
              backgroundColor: annotation.color,
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)',
              paddingRight: '14px',
              left: 1,
              top: 0,
            }}
          >
            {annotation.label}
          </div>
          {/* Flag pole - centered on the start date */}
          <div
            className="absolute w-0.5"
            style={{
              backgroundColor: annotation.color,
              height: chartHeight,
              left: 0,
              top: 0,
              transform: 'translateX(-50%)',
            }}
          />
        </div>
      </div>
    );
  }

  // Single date annotation - show as flag with pole centered on date
  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{ left: x }}
    >
      {/* Flag pennant - positioned to the right of the pole */}
      <div
        className="absolute px-2 py-1 text-xs font-medium text-white shadow-md"
        style={{
          backgroundColor: annotation.color,
          clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)',
          paddingRight: '14px',
          left: 1,
          top: 0,
        }}
      >
        {annotation.label}
      </div>
      {/* Flag pole - centered on the date position */}
      <div
        className="absolute w-0.5"
        style={{
          backgroundColor: annotation.color,
          height: chartHeight,
          left: 0,
          top: 0,
          transform: 'translateX(-50%)',
        }}
      />
    </div>
  );
}

// Helper functions for export
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function generateCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  // Simple canvas export using html2canvas-like approach
  const canvas = document.createElement('canvas');
  const rect = element.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, rect.width, rect.height);

  // Note: This is a simplified export. For production, use html2canvas library
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#333';
  ctx.fillText('Export requires html2canvas library for full fidelity', 20, 30);
  ctx.fillText('SVG export is fully supported', 20, 50);

  return canvas;
}

function generateSVG(
  data: EpiCurveData,
  title: string,
  xLabel: string,
  yLabel: string,
  showGrid: boolean,
  showCounts: boolean,
  stratifyBy: string,
  colorScheme: ColorScheme
): string {
  const width = Math.max(800, data.bins.length * 40 + 100);
  const height = 500;
  const margin = { top: 60, right: 40, bottom: 80, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const barWidth = chartWidth / data.bins.length;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background: white;">`;

  // Title
  svg += `<text x="${width / 2}" y="30" text-anchor="middle" font-size="18" font-weight="bold">${title}</text>`;

  // Y-axis label
  svg += `<text x="20" y="${height / 2}" text-anchor="middle" font-size="12" transform="rotate(-90, 20, ${height / 2})">${yLabel}</text>`;

  // X-axis label
  svg += `<text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="12">${xLabel}</text>`;

  // Grid lines
  if (showGrid) {
    for (let i = 0; i <= 5; i++) {
      const y = margin.top + (i / 5) * chartHeight;
      svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
    }
  }

  // Y-axis ticks
  for (let i = 0; i <= 5; i++) {
    const value = Math.round((data.maxCount * (5 - i)) / 5);
    const y = margin.top + (i / 5) * chartHeight;
    svg += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="10">${value}</text>`;
  }

  // Bars
  data.bins.forEach((bin, index) => {
    const x = margin.left + index * barWidth;

    if (stratifyBy && data.strataKeys.length > 0) {
      let cumHeight = 0;
      data.strataKeys.forEach((key, keyIndex) => {
        const count = bin.strata.get(key)?.length || 0;
        if (count > 0) {
          const barHeight = (count / data.maxCount) * chartHeight;
          const y = margin.top + chartHeight - cumHeight - barHeight;
          const color = getColorForStrata(key, keyIndex, colorScheme, data.strataKeys);
          svg += `<rect x="${x + 2}" y="${y}" width="${barWidth - 4}" height="${barHeight}" fill="${color}"/>`;
          cumHeight += barHeight;
        }
      });
    } else if (bin.total > 0) {
      const barHeight = (bin.total / data.maxCount) * chartHeight;
      const y = margin.top + chartHeight - barHeight;
      svg += `<rect x="${x + 2}" y="${y}" width="${barWidth - 4}" height="${barHeight}" fill="#3B82F6"/>`;
    }

    // Case count
    if (showCounts && bin.total > 0) {
      const barHeight = (bin.total / data.maxCount) * chartHeight;
      svg += `<text x="${x + barWidth / 2}" y="${margin.top + chartHeight - barHeight - 5}" text-anchor="middle" font-size="10">${bin.total}</text>`;
    }

    // X-axis label
    svg += `<text x="${x + barWidth / 2}" y="${margin.top + chartHeight + 15}" text-anchor="middle" font-size="9" transform="rotate(-45, ${x + barWidth / 2}, ${margin.top + chartHeight + 15})">${bin.label}</text>`;
  });

  svg += '</svg>';
  return svg;
}
