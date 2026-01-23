import { useState, useMemo, useRef, useEffect } from 'react';
import type { Dataset } from '../../types/analysis';
import {
  processEpiCurveData,
  getColorForStrata,
  getAnnotationColor,
  getAnnotationCategory,
  ANNOTATION_CATEGORIES,
  PATHOGEN_INCUBATION,
  parseLocalDate,
} from '../../utils/epiCurve';
import type { BinSize, ColorScheme, Annotation, EpiCurveData, AnnotationType } from '../../utils/epiCurve';
import { EpiCurveTutorial } from '../tutorials/EpiCurveTutorial';
import { TabHeader, ResultsActions, ExportIcons, AdvancedOptions, HelpPanel } from '../shared';

interface EpiCurveProps {
  dataset: Dataset;
  onExportDataset?: () => void;
}

export function EpiCurve({ dataset, onExportDataset }: EpiCurveProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartBodyRef = useRef<HTMLDivElement>(null);

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(288); // 18rem = 288px
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      setPanelWidth(Math.max(200, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [newAnnotation, setNewAnnotation] = useState({
    type: 'exposure' as AnnotationType,
    date: '',
    endDate: '',
    label: '',
    description: '',
    minDays: '',
    maxDays: '',
  });

  // Exposure window estimation
  const [selectedPathogen, setSelectedPathogen] = useState<string>('');
  const [showExposureWindow, setShowExposureWindow] = useState(false);

  // Find date columns (memoized to prevent unnecessary re-renders)
  const dateColumns = useMemo(
    () => dataset.columns.filter(c => c.type === 'date' || c.key.toLowerCase().includes('date')),
    [dataset.columns]
  );

  // Auto-select first date column
  useEffect(() => {
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
  useEffect(() => {
    setSelectedFilterValues(new Set());
    setShowAllFilterValues(false);
  }, [filterBy]);

  // Update x-axis label when date column changes
  useEffect(() => {
    if (dateColumn) {
      const column = dataset.columns.find(c => c.key === dateColumn);
      if (column) {
        setXAxisLabel(column.label);
      }
    }
  }, [dateColumn, dataset.columns]);

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

  // Calculate exposure window dates directly from records (before curveData processing)
  // This allows us to include them in the date range calculation
  const exposureWindowDates = useMemo(() => {
    if (!selectedPathogen || !showExposureWindow || !dateColumn) return null;

    const incubation = PATHOGEN_INCUBATION[selectedPathogen];
    if (!incubation) return null;

    // Find first case date directly from filtered records
    const validRecords = filteredRecords.filter(r => {
      const dateVal = r[dateColumn];
      if (!dateVal) return false;
      const date = parseLocalDate(String(dateVal));
      return !isNaN(date.getTime());
    });

    if (validRecords.length === 0) return null;

    const dates = validRecords.map(r => parseLocalDate(String(r[dateColumn])));
    const firstCaseDate = new Date(Math.min(...dates.map(d => d.getTime())));

    // For a point-source outbreak:
    // Earliest possible exposure = first case - max incubation
    // Latest possible exposure = first case - min incubation
    const earliestExposure = new Date(firstCaseDate);
    earliestExposure.setDate(earliestExposure.getDate() - Math.ceil(incubation.max));

    const latestExposure = new Date(firstCaseDate);
    latestExposure.setDate(latestExposure.getDate() - Math.floor(incubation.min));

    return {
      start: earliestExposure,
      end: latestExposure,
      pathogen: selectedPathogen,
      incubation,
    };
  }, [selectedPathogen, showExposureWindow, dateColumn, filteredRecords]);

  // Process data
  const curveData: EpiCurveData = useMemo(() => {
    if (!dateColumn) {
      return { bins: [], maxCount: 0, strataKeys: [], dateRange: { start: new Date(), end: new Date() } };
    }

    // Include exposure window in annotations for date range calculation
    const allAnnotations = [...annotations];
    if (exposureWindowDates) {
      // Add synthetic annotation for exposure window to ensure it's included in the chart range
      allAnnotations.push({
        id: '__exposure_window__',
        type: 'exposure',
        category: 'exposure',
        date: exposureWindowDates.start,
        endDate: exposureWindowDates.end,
        label: 'Exposure Window',
        color: '#dc2626',
        source: 'auto',
      });
    }

    return processEpiCurveData(filteredRecords, dateColumn, binSize, stratifyBy || undefined, allAnnotations);
  }, [filteredRecords, dateColumn, binSize, stratifyBy, annotations, exposureWindowDates]);

  // Calculate exposure window for display (after curveData is available)
  // Uses epidemiological method: earliest case - max incubation to earliest case - min incubation
  const exposureWindow = useMemo(() => {
    if (!exposureWindowDates || curveData.bins.length === 0) return null;
    return exposureWindowDates;
  }, [exposureWindowDates, curveData.bins]);

  // Helper to get default date from dataset range
  const getDefaultAnnotationDate = (): string => {
    if (curveData.bins.length === 0) {
      // Fallback to today if no data
      const today = new Date();
      return today.toISOString().split('T')[0];
    }
    // Use the middle of the date range for better UX
    const startTime = curveData.dateRange.start.getTime();
    const endTime = curveData.dateRange.end.getTime();
    const middleTime = startTime + (endTime - startTime) / 2;
    const middleDate = new Date(middleTime);
    return middleDate.toISOString().split('T')[0];
  };

  const startAddingAnnotation = () => {
    setEditingAnnotationId(null);
    setNewAnnotation({
      type: 'exposure',
      date: getDefaultAnnotationDate(),
      endDate: '',
      label: '',
      description: '',
      minDays: '',
      maxDays: '',
    });
    setShowAnnotationForm(true);
  };

  const startEditingAnnotation = (annotation: Annotation) => {
    setEditingAnnotationId(annotation.id);
    setNewAnnotation({
      type: annotation.type,
      date: annotation.date.toISOString().split('T')[0],
      endDate: annotation.endDate ? annotation.endDate.toISOString().split('T')[0] : '',
      label: annotation.label,
      description: annotation.description || '',
      minDays: '',
      maxDays: '',
    });
    setShowAnnotationForm(true);
  };

  const saveAnnotation = () => {
    if (!newAnnotation.date) return;

    const annotation: Annotation = {
      id: editingAnnotationId || crypto.randomUUID(),
      type: newAnnotation.type,
      category: getAnnotationCategory(newAnnotation.type),
      date: parseLocalDate(newAnnotation.date),
      label: newAnnotation.label || getDefaultLabelForType(newAnnotation.type),
      description: newAnnotation.description || undefined,
      color: getAnnotationColor(newAnnotation.type),
      source: 'manual',
    };

    if (newAnnotation.type === 'incubation' && newAnnotation.minDays && newAnnotation.maxDays) {
      const minDays = parseFloat(newAnnotation.minDays);
      const maxDays = parseFloat(newAnnotation.maxDays);
      if (!isNaN(minDays) && !isNaN(maxDays)) {
        const endDate = parseLocalDate(newAnnotation.date);
        endDate.setDate(endDate.getDate() + maxDays);
        annotation.endDate = endDate;
        annotation.label = newAnnotation.label || `Incubation period (${minDays}-${maxDays} days)`;
      }
    } else if (newAnnotation.endDate) {
      annotation.endDate = parseLocalDate(newAnnotation.endDate);
    }

    if (editingAnnotationId) {
      // Update existing annotation
      setAnnotations(annotations.map(a => a.id === editingAnnotationId ? annotation : a));
    } else {
      // Add new annotation
      setAnnotations([...annotations, annotation]);
    }

    setNewAnnotation({ type: 'exposure', date: '', endDate: '', label: '', description: '', minDays: '', maxDays: '' });
    setEditingAnnotationId(null);
    setShowAnnotationForm(false);
  };

  const cancelAnnotationEdit = () => {
    setNewAnnotation({ type: 'exposure', date: '', endDate: '', label: '', description: '', minDays: '', maxDays: '' });
    setEditingAnnotationId(null);
    setShowAnnotationForm(false);
  };

  // Helper to get default label for annotation type
  const getDefaultLabelForType = (type: AnnotationType): string => {
    for (const category of Object.values(ANNOTATION_CATEGORIES)) {
      const typeInfo = category.types.find(t => t.value === type);
      if (typeInfo) return typeInfo.label;
    }
    return type;
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

  // Calculate bar width based on optimal sizing, not container width
  // Use 60px as the optimal width for bars, with a minimum of 25px and maximum of 80px
  // This allows the chart to naturally size to its content
  const getOptimalBarWidth = (binCount: number): number => {
    if (binCount === 0) return 60;
    // More bins = narrower bars, fewer bins = wider bars (up to max)
    if (binCount > 50) return 25;
    if (binCount > 30) return 35;
    if (binCount > 15) return 50;
    if (binCount > 7) return 60;
    return Math.min(80, 60 + (7 - binCount) * 3); // Cap at 80px for very few bins
  };

  const barWidth = getOptimalBarWidth(curveData.bins.length);
  const chartHeight = 300;
  // Y-axis max should be at least 1 above the highest bar, rounded up to a nice number
  const yAxisMax = Math.max(curveData.maxCount + 1, Math.ceil((curveData.maxCount + 1) / 5) * 5);

  // Determine if x-axis labels should be rotated based on available space
  // Estimate label width: assume ~7px per character on average for the label text
  const shouldRotateLabels = useMemo(() => {
    if (curveData.bins.length === 0) return false;

    // Sample a few labels to estimate average width
    const sampleLabels = curveData.bins.slice(0, Math.min(5, curveData.bins.length));
    const avgLabelLength = sampleLabels.reduce((sum, bin) => sum + bin.label.length, 0) / sampleLabels.length;
    const estimatedLabelWidth = avgLabelLength * 7; // ~7px per character

    // If bar width is less than estimated label width + padding, rotate labels
    // Add 10px padding for comfortable spacing
    return barWidth < (estimatedLabelWidth + 10);
  }, [curveData.bins, barWidth]);

  return (
    <div ref={containerRef} className={`h-full flex flex-col lg:flex-row ${isResizing ? 'select-none' : ''}`}>
      {/* Left Panel - Controls */}
      <div
        className="w-full flex-shrink-0 bg-gray-50 border-b lg:border-b-0 border-gray-200 p-4 overflow-y-auto"
        style={{ width: window.innerWidth >= 1024 ? panelWidth : '100%' }}
      >
        <div className="space-y-4">
          {/* Header */}
          <TabHeader
            title="Epidemic Curve"
            description="Visualize the progression of cases over time with customizable binning and stratification options."
          />

          {/* Summary */}
          <div className="text-sm text-gray-600 pb-3 border-b border-gray-200">
            <span className="font-medium">{filteredRecords.length}</span> of {dataset.records.length} cases
            {curveData.bins.length > 0 && (
              <span className="text-gray-400"> · Peak: {curveData.maxCount}</span>
            )}
          </div>

          {/* Primary Controls */}
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
                      className="text-xs text-gray-600 hover:text-gray-900"
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
                    className="mt-2 text-xs text-gray-600 hover:text-gray-900"
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

          {/* Annotations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Annotations</label>
              <button
                onClick={() => showAnnotationForm ? cancelAnnotationEdit() : startAddingAnnotation()}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {showAnnotationForm ? 'Cancel' : '+ Add Event'}
              </button>
            </div>

            {/* Annotation Form */}
            {showAnnotationForm && (
              <div className="space-y-2 mb-3 p-3 bg-white border border-gray-200 rounded-lg">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Event Type</label>
                  <select
                    value={newAnnotation.type}
                    onChange={(e) => setNewAnnotation({ ...newAnnotation, type: e.target.value as AnnotationType })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    {Object.entries(ANNOTATION_CATEGORIES).map(([categoryKey, category]) => (
                      <optgroup key={categoryKey} label={category.label}>
                        {category.types.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </optgroup>
                    ))}
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
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Label</label>
                      <input
                        type="text"
                        value={newAnnotation.label}
                        onChange={(e) => setNewAnnotation({ ...newAnnotation, label: e.target.value })}
                        placeholder="Label for chart"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    {(newAnnotation.type === 'exposure' || newAnnotation.type === 'control-lifted') && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">End Date (optional)</label>
                        <input
                          type="date"
                          value={newAnnotation.endDate}
                          onChange={(e) => setNewAnnotation({ ...newAnnotation, endDate: e.target.value })}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                    )}
                  </>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={saveAnnotation}
                    className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-gray-700 rounded hover:bg-gray-800"
                  >
                    {editingAnnotationId ? 'Update' : 'Add Event'}
                  </button>
                  <button
                    onClick={cancelAnnotationEdit}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Active Manual Annotations */}
            {annotations.length > 0 && (
              <div className="space-y-1">
                {annotations.map(ann => (
                  <div
                    key={ann.id}
                    className="flex items-center justify-between px-2 py-1 text-xs rounded"
                    style={{ backgroundColor: `${ann.color}15` }}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block" style={{ color: ann.color }}>{ann.label}</span>
                      <span className="text-gray-400 text-xs">
                        {ann.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEditingAnnotation(ann)}
                        className="text-gray-500 hover:text-gray-700 px-1"
                        title="Edit annotation"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => removeAnnotation(ann.id)}
                        className="text-gray-400 hover:text-gray-600 px-1"
                        title="Delete annotation"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Advanced Options */}
          <AdvancedOptions>
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
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Display Options</p>
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

            {/* Labels */}
            <div className="space-y-3 pt-3 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Chart Labels</p>
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
            </div>

            {/* Exposure Estimation */}
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Exposure Estimation</p>

              {/* Pathogen Selection */}
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Suspected Pathogen</label>
                <select
                  value={selectedPathogen}
                  onChange={(e) => {
                    setSelectedPathogen(e.target.value);
                    if (e.target.value) setShowExposureWindow(true);
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
                >
                  <option value="">Select pathogen...</option>
                  {Object.keys(PATHOGEN_INCUBATION).sort().map(pathogen => (
                    <option key={pathogen} value={pathogen}>
                      {pathogen} ({PATHOGEN_INCUBATION[pathogen].min}-{PATHOGEN_INCUBATION[pathogen].max}d)
                    </option>
                  ))}
                </select>
              </div>

              {/* Exposure Window Toggle & Info */}
              {selectedPathogen && (
                <div className="space-y-2 mb-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showExposureWindow}
                      onChange={(e) => setShowExposureWindow(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-gray-700">Show estimated exposure window</span>
                  </label>

                  {exposureWindow && (
                    <div className="p-2 bg-red-50 border border-red-100 rounded-lg">
                      <p className="text-xs font-medium text-red-700 mb-1">Estimated Exposure Period</p>
                      <p className="text-xs text-red-600">
                        {exposureWindow.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' '}&ndash;{' '}
                        {exposureWindow.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-red-400 mt-1">
                        Based on {selectedPathogen} incubation ({exposureWindow.incubation.min}-{exposureWindow.incubation.max} days)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </AdvancedOptions>

          {/* Help Panel */}
          <HelpPanel title="How to use Epidemic Curves">
            <EpiCurveTutorial />
          </HelpPanel>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="hidden lg:flex w-1 bg-gray-200 hover:bg-gray-400 cursor-col-resize flex-shrink-0 items-center justify-center group transition-colors"
        onMouseDown={() => setIsResizing(true)}
      >
        <div className="w-0.5 h-8 bg-gray-400 group-hover:bg-gray-600 rounded-full transition-colors" />
      </div>

      {/* Right Panel - Chart */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Chart */}
        {curveData.bins.length > 0 ? (
          <div>
            <div ref={chartRef} className="bg-white border border-gray-200 rounded-lg p-4">
              {/* Title */}
              <h4 className="text-center text-lg font-semibold text-gray-900 mb-4">{chartTitle}</h4>

              {/* Legend for Stratified Charts */}
              {stratifyBy && curveData.strataKeys.length > 0 && (
                <div className="flex flex-wrap justify-center gap-4 mb-4 pb-3 border-b border-gray-200">
                  {curveData.strataKeys.map((strataKey, strataIndex) => (
                    <div key={strataKey} className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{
                          backgroundColor: getColorForStrata(strataKey, strataIndex, colorScheme, curveData.strataKeys),
                        }}
                      />
                      <span className="text-sm text-gray-700 font-medium">{strataKey}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Chart Area */}
              <div className="flex">
                {/* Y-Axis Label */}
                <div className="flex items-center justify-center w-8">
                  <span className="text-sm font-bold text-gray-500 transform -rotate-90 whitespace-nowrap">
                    {yAxisLabel}
                  </span>
                </div>

                {/* Y-Axis */}
                <div className="flex flex-col justify-between h-[300px] pr-2 text-right">
                  {[...Array(6)].map((_, i) => {
                    const value = Math.round((yAxisMax * (5 - i)) / 5);
                    return (
                      <span key={i} className="text-sm text-gray-500">{value}</span>
                    );
                  })}
                </div>

                {/* Chart Body */}
                <div ref={chartBodyRef} className="flex-1 overflow-x-auto">
                  <div className="relative" style={{ width: curveData.bins.length * barWidth }}>
                    {/* Grid Lines */}
                    {showGridLines && (
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="border-b border-gray-100 w-full" />
                        ))}
                      </div>
                    )}

                    {/* Exposure Window Shading */}
                    {exposureWindow && (
                      <ExposureWindowShading
                        exposureWindow={exposureWindow}
                        bins={curveData.bins}
                        barWidth={barWidth}
                        chartHeight={chartHeight}
                      />
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
                                const height = (count / yAxisMax) * chartHeight;
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
                                height: (bin.total / yAxisMax) * chartHeight,
                              }}
                              title={`${bin.label}: ${bin.total} cases`}
                            />
                          )}

                          {/* Case count label */}
                          {showCaseCounts && bin.total > 0 && (
                            <div
                              className="absolute text-center text-xs font-medium text-gray-700 w-full"
                              style={{
                                bottom: `${(bin.total / yAxisMax) * chartHeight + 2}px`
                              }}
                            >
                              {bin.total}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* X-Axis Labels */}
                    <div className="flex">
                      {curveData.bins.map((bin, index) => (
                        <div
                          key={index}
                          className="relative"
                          style={{ width: barWidth, height: shouldRotateLabels ? 60 : 30 }}
                        >
                          <span
                            className="text-sm text-gray-500 absolute whitespace-nowrap"
                            style={
                              shouldRotateLabels
                                ? {
                                    transform: 'rotate(-45deg)',
                                    transformOrigin: '0 0',
                                    left: barWidth / 2,
                                    top: 5,
                                  }
                                : {
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    top: 5,
                                    textAlign: 'center',
                                  }
                            }
                          >
                            {bin.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* X-Axis Label */}
              <div className="text-center mt-2">
                <span className="text-sm font-bold text-gray-500">{xAxisLabel}</span>
              </div>
            </div>

            {/* Exposure Window Explanation */}
            {exposureWindow && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h5 className="text-sm font-semibold text-blue-900 mb-2">
                  📚 Understanding the Exposure Window
                </h5>
                <div className="text-sm text-blue-800 space-y-2">
                  <p>
                    The shaded <span className="font-medium text-red-600">red region</span> on the chart represents the <strong>estimated exposure period</strong> for this outbreak, calculated using CDC epidemiological methods.
                  </p>
                  <div className="bg-white p-3 rounded border border-blue-100">
                    <p className="font-medium mb-1">Calculation Method:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>
                        <strong>First case date:</strong> {curveData.bins.filter(b => b.total > 0)[0]?.startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </li>
                      <li>
                        <strong>Selected pathogen:</strong> {exposureWindow.pathogen}
                      </li>
                      <li>
                        <strong>Incubation period:</strong> {exposureWindow.incubation.min}–{exposureWindow.incubation.max} days
                      </li>
                      <li>
                        <strong>Earliest exposure:</strong> First case date − {Math.ceil(exposureWindow.incubation.max)} days = {exposureWindow.start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </li>
                      <li>
                        <strong>Latest exposure:</strong> First case date − {Math.floor(exposureWindow.incubation.min)} days = {exposureWindow.end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </li>
                    </ul>
                  </div>
                  <p className="text-xs text-blue-700 mt-2">
                    <strong>Note for epidemiologists:</strong> This calculation assumes a point-source outbreak where all cases were exposed during a single time period. For continuing or propagated outbreaks, the exposure period may differ. Incubation period data is based on CDC and peer-reviewed epidemiological literature. Always verify with laboratory confirmation and environmental investigations.
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    <strong>Reference:</strong> CDC. Principles of Epidemiology in Public Health Practice, Third Edition.
                    Available at: <a href="https://www.cdc.gov/csels/dsepd/ss1978/" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-800">https://www.cdc.gov/csels/dsepd/ss1978/</a>
                  </p>
                </div>
              </div>
            )}

            {/* Results Actions */}
            <ResultsActions
              actions={[
                {
                  label: 'Export PNG',
                  onClick: () => exportChart('png'),
                  icon: ExportIcons.download,
                  variant: 'primary',
                },
                {
                  label: 'Export SVG',
                  onClick: () => exportChart('svg'),
                  icon: ExportIcons.download,
                  variant: 'secondary',
                },
                ...(onExportDataset ? [{
                  label: 'Export Dataset CSV',
                  onClick: onExportDataset,
                  icon: ExportIcons.csv,
                  variant: 'secondary' as const,
                }] : []),
              ]}
            />
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

  // Find position by matching the annotation timestamp to bins
  // This positions the flag at the exact date/time proportionally within the bin
  const annotationTime = annotation.date.getTime();
  const firstBinStart = bins[0].startDate.getTime();
  const lastBinEnd = bins[bins.length - 1].endDate.getTime();

  let x: number = 0;

  if (annotationTime < firstBinStart) {
    // Before first bin
    x = 0;
  } else if (annotationTime >= lastBinEnd) {
    // After last bin
    x = bins.length * barWidth;
  } else {
    // Find which bin contains this timestamp
    const binIndex = bins.findIndex(b =>
      annotationTime >= b.startDate.getTime() && annotationTime < b.endDate.getTime()
    );

    if (binIndex !== -1) {
      const bin = bins[binIndex];
      const binStart = bin.startDate.getTime();
      const binEnd = bin.endDate.getTime();
      const binDuration = binEnd - binStart;

      // Calculate proportional position within the bin
      const offsetWithinBin = annotationTime - binStart;
      const fraction = binDuration > 0 ? offsetWithinBin / binDuration : 0;

      x = binIndex * barWidth + fraction * barWidth;
    }
  }

  // For incubation period ranges, show shaded area
  if (annotation.endDate) {
    const endTime = annotation.endDate.getTime();
    let endX: number;

    if (endTime >= lastBinEnd) {
      // After last bin
      endX = bins.length * barWidth;
    } else {
      // Find which bin contains the end timestamp
      const endBinIndex = bins.findIndex(b =>
        endTime >= b.startDate.getTime() && endTime < b.endDate.getTime()
      );

      if (endBinIndex !== -1) {
        const bin = bins[endBinIndex];
        const binStart = bin.startDate.getTime();
        const binEnd = bin.endDate.getTime();
        const binDuration = binEnd - binStart;

        // Calculate proportional position within the bin
        const offsetWithinBin = endTime - binStart;
        const fraction = binDuration > 0 ? offsetWithinBin / binDuration : 0;

        endX = endBinIndex * barWidth + fraction * barWidth;
      } else {
        endX = bins.length * barWidth;
      }
    }

    const width = Math.max(endX - x, barWidth / 2);

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

// Exposure window shading component - shows estimated exposure period on the chart
function ExposureWindowShading({ exposureWindow, bins, barWidth, chartHeight }: {
  exposureWindow: {
    start: Date;
    end: Date;
    pathogen: string;
    incubation: { min: number; max: number; typical: number };
  };
  bins: EpiCurveData['bins'];
  barWidth: number;
  chartHeight: number;
}) {
  if (bins.length === 0) return null;

  const firstBinStart = bins[0].startDate.getTime();
  const lastBinEnd = bins[bins.length - 1].endDate.getTime();
  const totalWidth = bins.length * barWidth;

  // Calculate x position for a date
  const getXPosition = (date: Date): number => {
    const time = date.getTime();
    if (time <= firstBinStart) return 0;
    if (time >= lastBinEnd) return totalWidth;

    // Calculate proportional position across all bins
    const totalDuration = lastBinEnd - firstBinStart;
    const offset = time - firstBinStart;
    return (offset / totalDuration) * totalWidth;
  };

  const startX = getXPosition(exposureWindow.start);
  const endX = getXPosition(exposureWindow.end);
  const width = Math.max(endX - startX, barWidth / 2);

  // Format dates for the label
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{
        left: startX,
        width,
        height: chartHeight,
      }}
      title={`Estimated exposure: ${formatDate(exposureWindow.start)} - ${formatDate(exposureWindow.end)}`}
    >
      {/* Shaded region with diagonal stripes pattern */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(220, 38, 38, 0.15)',
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(220, 38, 38, 0.1) 5px, rgba(220, 38, 38, 0.1) 10px)',
        }}
      />

      {/* Left edge line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-400"
        style={{ left: 0 }}
      />

      {/* Right edge line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-400"
        style={{ right: 0 }}
      />

      {/* Label at top */}
      <div
        className="absolute top-1 left-1 px-1.5 py-0.5 text-xs font-medium text-red-700 bg-red-100 rounded shadow-sm whitespace-nowrap"
        style={{ maxWidth: width - 8, overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        Est. Exposure
      </div>
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

  // Legend for stratified charts
  if (stratifyBy && data.strataKeys.length > 0) {
    const legendY = 45;
    const legendItemWidth = 120;
    const legendStartX = (width - (data.strataKeys.length * legendItemWidth)) / 2;

    data.strataKeys.forEach((key, index) => {
      const x = legendStartX + (index * legendItemWidth);
      const color = getColorForStrata(key, index, colorScheme, data.strataKeys);
      // Legend color box
      svg += `<rect x="${x}" y="${legendY}" width="12" height="12" fill="${color}"/>`;
      // Legend text
      svg += `<text x="${x + 16}" y="${legendY + 10}" font-size="12">${key}</text>`;
    });
  }

  // Y-axis label
  svg += `<text x="20" y="${height / 2}" text-anchor="middle" font-size="14" transform="rotate(-90, 20, ${height / 2})">${yLabel}</text>`;

  // X-axis label
  svg += `<text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="14">${xLabel}</text>`;

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
    svg += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${value}</text>`;
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
    svg += `<text x="${x + barWidth / 2}" y="${margin.top + chartHeight + 15}" text-anchor="middle" font-size="11" transform="rotate(-45, ${x + barWidth / 2}, ${margin.top + chartHeight + 15})">${bin.label}</text>`;
  });

  svg += '</svg>';
  return svg;
}
