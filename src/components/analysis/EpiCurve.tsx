import { useState, useMemo, useRef } from 'react';
import type { Dataset } from '../../types/analysis';
import {
  processEpiCurveData,
  getColorForStrata,
  findFirstCaseDate,
  PATHOGEN_INCUBATION,
} from '../../utils/epiCurve';
import type { BinSize, ColorScheme, Annotation, EpiCurveData } from '../../utils/epiCurve';

interface EpiCurveProps {
  dataset: Dataset;
}

export function EpiCurve({ dataset }: EpiCurveProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Configuration state
  const [dateColumn, setDateColumn] = useState<string>('');
  const [binSize, setBinSize] = useState<BinSize>('daily');
  const [stratifyBy, setStratifyBy] = useState<string>('');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('default');

  // Display options
  const [showGridLines, setShowGridLines] = useState(true);
  const [showCaseCounts, setShowCaseCounts] = useState(true);
  const [chartTitle, setChartTitle] = useState('Epidemic Curve');
  const [xAxisLabel, setXAxisLabel] = useState('Date of Onset');
  const [yAxisLabel, setYAxisLabel] = useState('Number of Cases');

  // Annotations
  const [showFirstCase, setShowFirstCase] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState({
    type: 'exposure' as Annotation['type'],
    date: '',
    endDate: '',
    label: '',
    pathogen: '',
  });

  // Find date columns
  const dateColumns = dataset.columns.filter(c => c.type === 'date' || c.key.toLowerCase().includes('date'));

  // Auto-select first date column
  useMemo(() => {
    if (!dateColumn && dateColumns.length > 0) {
      setDateColumn(dateColumns[0].key);
    }
  }, [dateColumns, dateColumn]);

  // Process data
  const curveData: EpiCurveData = useMemo(() => {
    if (!dateColumn) {
      return { bins: [], maxCount: 0, strataKeys: [], dateRange: { start: new Date(), end: new Date() } };
    }
    return processEpiCurveData(dataset.records, dateColumn, binSize, stratifyBy || undefined);
  }, [dataset.records, dateColumn, binSize, stratifyBy]);

  const firstCaseDate = useMemo(() => {
    if (!dateColumn) return null;
    return findFirstCaseDate(dataset.records, dateColumn);
  }, [dataset.records, dateColumn]);

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

    if (newAnnotation.type === 'incubation' && newAnnotation.pathogen) {
      const pathogen = PATHOGEN_INCUBATION[newAnnotation.pathogen];
      if (pathogen) {
        const endDate = new Date(newAnnotation.date);
        endDate.setDate(endDate.getDate() + pathogen.max);
        annotation.endDate = endDate;
        annotation.label = `${newAnnotation.pathogen} incubation (${pathogen.min}-${pathogen.max} days)`;
      }
    } else if (newAnnotation.endDate) {
      annotation.endDate = new Date(newAnnotation.endDate);
    }

    setAnnotations([...annotations, annotation]);
    setNewAnnotation({ type: 'exposure', date: '', endDate: '', label: '', pathogen: '' });
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
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Epidemic Curve</h3>
          <p className="text-sm text-gray-600">
            Visualize case distribution over time
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportChart('png')}
            disabled={curveData.bins.length === 0}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Export PNG
          </button>
          <button
            onClick={() => exportChart('svg')}
            disabled={curveData.bins.length === 0}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Export SVG
          </button>
        </div>
      </div>

      {/* Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date Column</label>
          <select
            value={dateColumn}
            onChange={(e) => setDateColumn(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select date column...</option>
            {dataset.columns.map(col => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bin Size</label>
          <select
            value={binSize}
            onChange={(e) => setBinSize(e.target.value as BinSize)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="hourly">Hourly</option>
            <option value="6hour">6-Hour</option>
            <option value="12hour">12-Hour</option>
            <option value="daily">Daily</option>
            <option value="weekly-cdc">Weekly (CDC/MMWR)</option>
            <option value="weekly-iso">Weekly (ISO)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stratify By</label>
          <select
            value={stratifyBy}
            onChange={(e) => setStratifyBy(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">None</option>
            {dataset.columns.filter(c => c.type !== 'date').map(col => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
          <select
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="default">Default</option>
            <option value="classification">Classification</option>
            <option value="colorblind">Colorblind-Friendly</option>
            <option value="grayscale">Grayscale</option>
          </select>
        </div>
      </div>

      {/* Display Options */}
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showGridLines}
            onChange={(e) => setShowGridLines(e.target.checked)}
            className="rounded border-gray-300"
          />
          Grid Lines
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showCaseCounts}
            onChange={(e) => setShowCaseCounts(e.target.checked)}
            className="rounded border-gray-300"
          />
          Case Counts
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showFirstCase}
            onChange={(e) => setShowFirstCase(e.target.checked)}
            className="rounded border-gray-300"
          />
          Mark First Case
        </label>
        <button
          onClick={() => setShowAnnotationForm(true)}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          + Add Annotation
        </button>
      </div>

      {/* Title and Axis Labels */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Chart Title</label>
          <input
            type="text"
            value={chartTitle}
            onChange={(e) => setChartTitle(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">X-Axis Label</label>
          <input
            type="text"
            value={xAxisLabel}
            onChange={(e) => setXAxisLabel(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Y-Axis Label</label>
          <input
            type="text"
            value={yAxisLabel}
            onChange={(e) => setYAxisLabel(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
          />
        </div>
      </div>

      {/* Annotation Form */}
      {showAnnotationForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Add Annotation</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              <div>
                <label className="block text-xs text-gray-500 mb-1">Pathogen</label>
                <select
                  value={newAnnotation.pathogen}
                  onChange={(e) => setNewAnnotation({ ...newAnnotation, pathogen: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                >
                  <option value="">Select pathogen...</option>
                  {Object.keys(PATHOGEN_INCUBATION).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
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
            <div className="flex items-end gap-2">
              <button
                onClick={addAnnotation}
                className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                onClick={() => setShowAnnotationForm(false)}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Annotations */}
      {annotations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {annotations.map(ann => (
            <span
              key={ann.id}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full"
              style={{ backgroundColor: `${ann.color}20`, color: ann.color }}
            >
              {ann.label}
              <button
                onClick={() => removeAnnotation(ann.id)}
                className="hover:opacity-70"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Chart */}
      {curveData.bins.length > 0 ? (
        <div ref={chartRef} className="bg-white border border-gray-200 rounded-lg p-4">
          {/* Title */}
          <h4 className="text-center text-lg font-semibold text-gray-900 mb-4">{chartTitle}</h4>

          {/* Legend */}
          {stratifyBy && curveData.strataKeys.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4 mb-4">
              {curveData.strataKeys.map((key, index) => (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: getColorForStrata(key, index, colorScheme, curveData.strataKeys) }}
                  />
                  <span className="text-sm text-gray-700">{key}</span>
                </div>
              ))}
            </div>
          )}

          {/* Chart Area */}
          <div className="flex">
            {/* Y-Axis Label */}
            <div className="flex items-center justify-center w-8">
              <span className="text-xs text-gray-500 transform -rotate-90 whitespace-nowrap">
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
                {showFirstCase && firstCaseDate && (
                  <FirstCaseMarker
                    date={firstCaseDate}
                    bins={curveData.bins}
                    barWidth={barWidth}
                    chartHeight={chartHeight}
                  />
                )}
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
                      className="flex flex-col justify-end"
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
                        <div className="text-center text-xs text-gray-600 -mt-5">
                          {bin.total}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* X-Axis Labels */}
                <div className="flex mt-2">
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
            <span className="text-xs text-gray-500">{xAxisLabel}</span>
          </div>

          {/* Summary Stats */}
          <div className="mt-4 pt-4 border-t border-gray-200 flex justify-center gap-8 text-sm text-gray-600">
            <span>Total Cases: <strong>{dataset.records.length}</strong></span>
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
    </div>
  );
}

// First case marker component
function FirstCaseMarker({ date, bins, barWidth, chartHeight }: {
  date: Date;
  bins: EpiCurveData['bins'];
  barWidth: number;
  chartHeight: number;
}) {
  const binIndex = bins.findIndex(b => date >= b.startDate && date < b.endDate);
  if (binIndex === -1) return null;

  const x = binIndex * barWidth + barWidth / 2;

  return (
    <div
      className="absolute bottom-0 flex flex-col items-center pointer-events-none"
      style={{ left: x, height: chartHeight }}
    >
      <div className="text-xs text-red-600 font-medium whitespace-nowrap bg-white px-1 rounded shadow-sm">
        First Case
      </div>
      <div className="flex-1 w-0.5 bg-red-500" />
      <div className="w-2 h-2 bg-red-500 rounded-full" />
    </div>
  );
}

// Annotation marker component
function AnnotationMarker({ annotation, bins, barWidth, chartHeight }: {
  annotation: Annotation;
  bins: EpiCurveData['bins'];
  barWidth: number;
  chartHeight: number;
}) {
  const startIndex = bins.findIndex(b => annotation.date >= b.startDate && annotation.date < b.endDate);
  if (startIndex === -1) return null;

  const x = startIndex * barWidth + barWidth / 2;

  if (annotation.endDate) {
    const endIndex = bins.findIndex(b => annotation.endDate! >= b.startDate && annotation.endDate! < b.endDate);
    const width = endIndex !== -1 ? (endIndex - startIndex + 1) * barWidth : barWidth;

    return (
      <div
        className="absolute top-0 opacity-30 pointer-events-none"
        style={{
          left: startIndex * barWidth,
          width,
          height: chartHeight,
          backgroundColor: annotation.color,
        }}
        title={annotation.label}
      />
    );
  }

  return (
    <div
      className="absolute bottom-0 flex flex-col items-center pointer-events-none"
      style={{ left: x, height: chartHeight }}
    >
      <div
        className="text-xs font-medium whitespace-nowrap px-1 rounded shadow-sm"
        style={{ backgroundColor: `${annotation.color}20`, color: annotation.color }}
      >
        {annotation.label}
      </div>
      <div className="flex-1 w-0.5" style={{ backgroundColor: annotation.color }} />
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
