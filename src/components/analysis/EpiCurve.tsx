import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import type { Dataset } from '../../types/analysis';
import {
  assignLabelRows,
  estimateLabelWidth,
  LABEL_FONT_STACKS,
  LABEL_FONT_WEIGHTS,
  DEFAULT_LABEL_FONT_SIZE,
} from '../../utils/labelLayout';
import { processEpiCurveData, getColorForStrata, getAnnotationColor, getAnnotationCategory, ANNOTATION_CATEGORIES, PATHOGEN_INCUBATION, parseLocalDate, isBinSize } from '../../utils/epiCurve';
import type { BinSize, ColorScheme, Annotation, EpiCurveData, AnnotationType } from '../../utils/epiCurve';
import { EpiCurveTutorial } from '../tutorials/EpiCurveTutorial';
import { TabHeader, ResultsActions, ExportIcons, AdvancedOptions, HelpPanel } from '../shared';
import { escapeXml } from '../../utils/chartExport';

// Format a Date as YYYY-MM-DD using local date components.
// (toISOString() is UTC and shifts the date back a day in UTC+ timezones.)
/** Vertical pitch of stacked annotation label rows, in px. */
const ANNOTATION_ROW_HEIGHT = 20;

/** Space a bar's count label needs above the bar: a 2px gap plus the text. */
const COUNT_LABEL_HEIGHT = 18;

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface EpiCurveProps {
  dataset: Dataset;
  onExportDataset?: () => void;
  preset?: 'sample-outbreak';
}

function createSampleOutbreakAnnotations(): Annotation[] {
  return [{
    id: '__sample_outbreak_exposure__',
    type: 'exposure',
    category: 'exposure',
    date: parseLocalDate('2026-01-10'),
    label: 'Exposure: 12–2 PM',
    description: 'Synthetic community picnic exposure',
    color: getAnnotationColor('exposure'),
    source: 'manual',
  }];
}

export function EpiCurve({ dataset, onExportDataset, preset }: EpiCurveProps) {
  const isSampleOutbreakPreset = preset === 'sample-outbreak';
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartBodyRef = useRef<HTMLDivElement>(null);
  // Keep the guided sample separate from a user's normal saved demo settings.
  const persistenceKey = isSampleOutbreakPreset
    ? `epikit_epicurve_sample_${dataset.id}`
    : `epikit_epicurve_${dataset.id}`;

  // Load persisted state once during initialization (avoids race conditions with auto-detect effects)
  const [saved] = useState<Record<string, unknown>>(() => {
    try {
      const raw = localStorage.getItem(persistenceKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Tracks manual bin-size changes; a bin size restored from storage counts as a user choice.
  const userChangedBinSize = useRef(isSampleOutbreakPreset || saved.binSize !== undefined);

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(288); // 18rem = 288px
  const [isResizing, setIsResizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  // Configuration state (initialized from localStorage)
  const [dateColumn, setDateColumn] = useState<string>(() => isSampleOutbreakPreset ? 'onset_date' : (saved.dateColumn as string) || '');
  const [timeColumn, setTimeColumn] = useState<string>(() => isSampleOutbreakPreset ? 'onset_time' : (saved.timeColumn as string) || '');
  const [binSize, setBinSize] = useState<BinSize>(() => isSampleOutbreakPreset ? '12hour' : (isBinSize(saved.binSize) ? saved.binSize : 'daily'));
  const [stratifyBy, setStratifyBy] = useState<string>(() => isSampleOutbreakPreset ? 'case_status' : (saved.stratifyBy as string) ?? '');
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => (saved.colorScheme as ColorScheme) || 'default');

  // Filter state
  const [filterBy, setFilterBy] = useState<string>(() => isSampleOutbreakPreset ? '' : (saved.filterBy as string) ?? '');
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(() => {
    if (isSampleOutbreakPreset) return new Set();
    const arr = saved.selectedFilterValues;
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  });
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);

  // Display options
  const [showGridLines, setShowGridLines] = useState(() => isSampleOutbreakPreset || (saved.showGridLines !== undefined ? saved.showGridLines as boolean : true));
  const [showCaseCounts, setShowCaseCounts] = useState(() => isSampleOutbreakPreset || (saved.showCaseCounts !== undefined ? saved.showCaseCounts as boolean : true));
  const [chartTitle, setChartTitle] = useState(() => isSampleOutbreakPreset ? 'Epidemic Curve' : (saved.chartTitle as string) ?? 'Epidemic Curve');
  const [xAxisLabel, setXAxisLabel] = useState(() => isSampleOutbreakPreset ? 'Onset Date' : (saved.xAxisLabel as string) ?? 'Date of Onset');
  const [yAxisLabel, setYAxisLabel] = useState(() => isSampleOutbreakPreset ? 'Number of Cases' : (saved.yAxisLabel as string) ?? 'Number of Cases');

  // Annotations (dates need reconstruction from ISO strings)
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    if (isSampleOutbreakPreset) return createSampleOutbreakAnnotations();
    const arr = saved.annotations;
    if (Array.isArray(arr)) {
      return arr.map((a: Record<string, unknown>) => ({
        ...a,
        date: new Date(a.date as string),
        endDate: a.endDate ? new Date(a.endDate as string) : undefined,
      })) as Annotation[];
    }
    return [];
  });
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [newAnnotation, setNewAnnotation] = useState({
    type: 'exposure' as AnnotationType,
    date: '',
    endDate: '',
    label: '',
    description: '',
    color: '',
    labelFontSize: DEFAULT_LABEL_FONT_SIZE,
    labelFontWeight: 'medium' as 'normal' | 'medium' | 'bold',
    labelFontFamily: 'sans' as 'sans' | 'serif' | 'mono',
    labelShape: 'none' as 'none' | 'box' | 'pill',
  });
  const [annotationError, setAnnotationError] = useState('');

  // Click-to-add annotation state
  const [clickAddPosition, setClickAddPosition] = useState<{ x: number; y: number; date: string } | null>(null);

  // Manual date range override
  const [useManualDateRange, setUseManualDateRange] = useState(() => isSampleOutbreakPreset ? false : saved.useManualDateRange !== undefined ? saved.useManualDateRange as boolean : false);
  const [manualStartDate, setManualStartDate] = useState(() => isSampleOutbreakPreset ? '' : (saved.manualStartDate as string) || '');
  const [manualEndDate, setManualEndDate] = useState(() => isSampleOutbreakPreset ? '' : (saved.manualEndDate as string) || '');

  // Exposure window estimation
  const [selectedPathogen, setSelectedPathogen] = useState<string>(() => isSampleOutbreakPreset ? '' : (saved.selectedPathogen as string) ?? '');
  const [showExposureWindow, setShowExposureWindow] = useState(() => isSampleOutbreakPreset ? false : saved.showExposureWindow !== undefined ? saved.showExposureWindow as boolean : false);
  const [showExposurePanel, setShowExposurePanel] = useState(false);


  // Save all state to localStorage when it changes
  useEffect(() => {
    try {
      const toSave = {
        annotations: annotations.map(a => ({
          ...a,
          date: a.date.toISOString(),
          endDate: a.endDate?.toISOString(),
        })),
        manualStartDate,
        manualEndDate,
        useManualDateRange,
        dateColumn,
        timeColumn,
        binSize,
        stratifyBy,
        colorScheme,
        showGridLines,
        showCaseCounts,
        chartTitle,
        xAxisLabel,
        yAxisLabel,
        selectedPathogen,
        showExposureWindow,
        filterBy,
        selectedFilterValues: Array.from(selectedFilterValues),
      };
      localStorage.setItem(persistenceKey, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save epi curve settings:', e);
    }
  }, [persistenceKey, annotations, manualStartDate, manualEndDate, useManualDateRange,
    dateColumn, timeColumn, binSize, stratifyBy, colorScheme, showGridLines, showCaseCounts,
    chartTitle, xAxisLabel, yAxisLabel, selectedPathogen, showExposureWindow,
    filterBy, selectedFilterValues]);

  // Find date columns (memoized to prevent unnecessary re-renders)
  const dateColumns = useMemo(
    () => dataset.columns.filter(c => c.type === 'date' || c.key.toLowerCase().includes('date')),
    [dataset.columns]
  );

  // Find potential time columns (text columns with "time" in the name)
  const timeColumns = useMemo(
    () => dataset.columns.filter(c =>
      c.type === 'text' && c.key.toLowerCase().includes('time')
    ),
    [dataset.columns]
  );

  // Check if using sub-daily bin size
  const isSubDailyBin = binSize === 'hourly' || binSize === '6hour' || binSize === '12hour';

  // Auto-select first date column
  useEffect(() => {
    if (!dateColumn && dateColumns.length > 0) {
      setDateColumn(dateColumns[0].key);
    }
  }, [dateColumns, dateColumn]);

  // Auto-select matching time column when date column changes
  useEffect(() => {
    // Don't override a time column choice restored from saved settings
    if (saved.timeColumn !== undefined) return;
    if (dateColumn && timeColumns.length > 0) {
      // Try to find a time column that matches the date column name
      // e.g., "onset_date" -> "onset_time"
      const baseName = dateColumn.replace(/_?date$/i, '');
      const matchingTimeCol = timeColumns.find(c =>
        c.key.toLowerCase().includes(baseName.toLowerCase()) &&
        c.key.toLowerCase().includes('time')
      );
      if (matchingTimeCol) {
        setTimeColumn(matchingTimeCol.key);
      } else if (!timeColumn) {
        // Default to first time column if no match
        setTimeColumn(timeColumns[0].key);
      }
    }
  }, [dateColumn, timeColumns, timeColumn, saved]);

  // Auto-suggest bin size based on date range (only if user hasn't manually changed it)
  useEffect(() => {
    if (!dateColumn || userChangedBinSize.current) return;

    // Extract valid dates from the data (use full dataset for range estimation)
    const validDates = dataset.records
      .map(r => {
        const dateVal = r[dateColumn];
        if (!dateVal) return null;
        const date = parseLocalDate(String(dateVal));
        return isNaN(date.getTime()) ? null : date;
      })
      .filter((d): d is Date => d !== null);

    if (validDates.length === 0) return;

    // Calculate date range in days (loop-based min/max avoids call-stack overflow on very large datasets)
    let minTime = Infinity;
    let maxTime = -Infinity;
    validDates.forEach(d => {
      const t = d.getTime();
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    });
    const daysDiff = (maxTime - minTime) / (1000 * 60 * 60 * 24);

    // Suggest bin size based on date range
    let suggestedBinSize: BinSize;
    if (daysDiff < 7) {
      suggestedBinSize = 'hourly';
    } else if (daysDiff < 60) {
      suggestedBinSize = 'daily';
    } else {
      suggestedBinSize = 'weekly-cdc';
    }

    // Only update if different from current
    if (suggestedBinSize !== binSize) {
      setBinSize(suggestedBinSize);
    }
  }, [dateColumn, dataset.records, binSize]);

  // Get unique values for the filter dropdown
  const filterValues = useMemo(() => {
    if (!filterBy) return [];
    const values = new Set(dataset.records.map(r => String(r[filterBy] ?? 'Unknown')));
    return Array.from(values).sort();
  }, [dataset.records, filterBy]);

  // Reset selected filter values when filter variable changes
  // (but not on mount, which would wipe selections restored from saved settings)
  const filterResetSkipped = useRef(false);
  useEffect(() => {
    if (!filterResetSkipped.current) {
      filterResetSkipped.current = true;
      return;
    }
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

    // Loop-based min avoids call-stack overflow on very large datasets
    let firstTime = Infinity;
    validRecords.forEach(r => {
      const t = parseLocalDate(String(r[dateColumn])).getTime();
      if (t < firstTime) firstTime = t;
    });
    const firstCaseDate = new Date(firstTime);

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
      firstCaseDate,
    };
  }, [selectedPathogen, showExposureWindow, dateColumn, filteredRecords]);

  // Process data
  const curveData: EpiCurveData = useMemo(() => {
    if (!dateColumn) {
      return { bins: [], maxCount: 0, strataKeys: [], dateRange: { start: new Date(), end: new Date() } };
    }

    // Include the exposure window in annotations for date range calculation
    const dateRangeAnnotations: Annotation[] = [...annotations];

    if (exposureWindowDates) {
      dateRangeAnnotations.push({
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

    return processEpiCurveData(filteredRecords, dateColumn, binSize, stratifyBy || undefined, dateRangeAnnotations, isSubDailyBin ? timeColumn || undefined : undefined);
  }, [filteredRecords, dateColumn, binSize, stratifyBy, annotations, exposureWindowDates, isSubDailyBin, timeColumn]);

  // Calculate exposure window for display (after curveData is available)
  // Uses epidemiological method: earliest case - max incubation to earliest case - min incubation
  const exposureWindow = useMemo(() => {
    if (!exposureWindowDates || curveData.bins.length === 0) return null;
    return exposureWindowDates;
  }, [exposureWindowDates, curveData.bins]);

  // Every annotation is user-placed now; kept as a named value because the
  // layout and render paths below all read from it.
  const allAnnotations = annotations;

  // Apply manual date range filter to curve data
  const displayData: EpiCurveData = useMemo(() => {
    if (!useManualDateRange || !manualStartDate || !manualEndDate) {
      return curveData;
    }

    const startDate = parseLocalDate(manualStartDate);
    const endDate = parseLocalDate(manualEndDate);
    endDate.setHours(23, 59, 59, 999); // Include entire end day

    // Filter bins to only those that overlap with the manual range.
    // bin.endDate is exclusive (the next bin's start), so a bin ending exactly
    // at startDate does not overlap and must be excluded.
    const filteredBins = curveData.bins.filter(bin => {
      return bin.endDate > startDate && bin.startDate <= endDate;
    });

    if (filteredBins.length === 0) {
      return {
        ...curveData,
        bins: [],
        maxCount: 0,
        dateRange: { start: startDate, end: endDate },
      };
    }

    // Recalculate max count for filtered bins (loop avoids call-stack overflow with many bins)
    let maxCount = 0;
    filteredBins.forEach(b => {
      if (b.total > maxCount) maxCount = b.total;
    });

    return {
      ...curveData,
      bins: filteredBins,
      maxCount,
      dateRange: {
        start: startDate,
        end: endDate,
      },
    };
  }, [curveData, useManualDateRange, manualStartDate, manualEndDate]);

  // Stack annotation labels that would physically overlap.
  //
  // This previously keyed on bin index, so it only stacked annotations landing
  // in the same bin. Labels are far wider than a bar, so annotations in
  // adjacent bins still collided: milestones a day apart
  // drew "Detected", "Notified" and "Response" straight through each other.
  // Offsets are now derived from the labels' actual x positions and widths.
  const annotationOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    const bins = displayData.bins;
    if (bins.length === 0) return offsets;

    const barW = getOptimalBarWidth(bins.length);
    const firstBinStart = bins[0].startDate.getTime();
    const lastBinEnd = bins[bins.length - 1].endDate.getTime();

    // Mirrors AnnotationMarker's placement, including the +4px label inset.
    const labelXForDate = (date: Date): number | null => {
      const time = date.getTime();
      if (isNaN(time)) return null;
      if (time < firstBinStart) return 4;
      if (time >= lastBinEnd) return bins.length * barW + 4;
      const binIndex = bins.findIndex(b =>
        time >= b.startDate.getTime() && time < b.endDate.getTime()
      );
      if (binIndex === -1) return null;
      const bin = bins[binIndex];
      const binDuration = bin.endDate.getTime() - bin.startDate.getTime();
      const fraction = binDuration > 0 ? (time - bin.startDate.getTime()) / binDuration : 0;
      return binIndex * barW + Math.max(fraction * barW, barW / 2) + 4;
    };

    const boxes = [];
    for (const annotation of allAnnotations) {
      // A label the user has dragged is where they want it. Auto-stacking only
      // applies to labels that have not been positioned by hand.
      if (annotation.labelOffsetX !== undefined || annotation.labelOffsetY !== undefined) continue;
      const x = labelXForDate(annotation.date);
      if (x === null) continue;
      boxes.push({
        id: annotation.id,
        x,
        // text-xs (12px), medium weight, with px-1 padding on each side
        width: estimateLabelWidth(annotation.label, 12, 8),
      });
    }

    const rows = assignLabelRows(boxes);
    for (const [id, row] of rows) offsets.set(id, row * ANNOTATION_ROW_HEIGHT);
    return offsets;
  }, [allAnnotations, displayData.bins]);

  // Helper to get default date from dataset range
  const getDefaultAnnotationDate = (): string => {
    if (curveData.bins.length === 0) {
      // Fallback to today if no data
      return formatLocalDate(new Date());
    }
    // Use the middle of the date range for better UX
    const startTime = curveData.dateRange.start.getTime();
    const endTime = curveData.dateRange.end.getTime();
    const middleTime = startTime + (endTime - startTime) / 2;
    const middleDate = new Date(middleTime);
    return formatLocalDate(middleDate);
  };

  const startAddingAnnotation = () => {
    setEditingAnnotationId(null);
    setAnnotationError('');
    setNewAnnotation({
      type: 'exposure',
      date: getDefaultAnnotationDate(),
      endDate: '',
      label: '',
      description: '',
      color: '',
      labelFontSize: DEFAULT_LABEL_FONT_SIZE,
      labelFontWeight: 'medium',
      labelFontFamily: 'sans',
      labelShape: 'none',
    });
    setShowAnnotationForm(true);
  };

  const startEditingAnnotation = (annotation: Annotation) => {
    setEditingAnnotationId(annotation.id);
    setAnnotationError('');
    setNewAnnotation({
      type: annotation.type,
      date: formatLocalDate(annotation.date),
      endDate: annotation.endDate ? formatLocalDate(annotation.endDate) : '',
      label: annotation.label,
      description: annotation.description || '',
      color: annotation.color,
      labelFontSize: annotation.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE,
      labelFontWeight: annotation.labelFontWeight ?? 'medium',
      labelFontFamily: annotation.labelFontFamily ?? 'sans',
      labelShape: annotation.labelShape ?? 'none',
    });
    setShowAnnotationForm(true);
  };

  const saveAnnotation = () => {
    if (!newAnnotation.date) return;

    if (newAnnotation.endDate && parseLocalDate(newAnnotation.endDate) < parseLocalDate(newAnnotation.date)) {
      setAnnotationError('End date must be on or after the start date.');
      return;
    }

    const existing = editingAnnotationId ? annotations.find(a => a.id === editingAnnotationId) : undefined;
    const annotation: Annotation = {
      id: editingAnnotationId || crypto.randomUUID(),
      labelOffsetX: existing?.labelOffsetX,
      labelOffsetY: existing?.labelOffsetY,
      type: newAnnotation.type,
      category: getAnnotationCategory(newAnnotation.type),
      date: parseLocalDate(newAnnotation.date),
      label: newAnnotation.label || getDefaultLabelForType(newAnnotation.type),
      description: newAnnotation.description || undefined,
      color: newAnnotation.color || getAnnotationColor(newAnnotation.type),
      source: 'manual',
      labelFontSize: newAnnotation.labelFontSize,
      labelFontWeight: newAnnotation.labelFontWeight,
      labelFontFamily: newAnnotation.labelFontFamily,
      labelShape: newAnnotation.labelShape,
    };

    if (newAnnotation.endDate) {
      // Treat a date-only end as inclusive of that whole day
      const end = parseLocalDate(newAnnotation.endDate);
      end.setHours(23, 59, 59, 999);
      annotation.endDate = end;
    }

    if (editingAnnotationId) {
      // Update existing annotation
      setAnnotations(annotations.map(a => a.id === editingAnnotationId ? annotation : a));
    } else {
      // Add new annotation
      setAnnotations([...annotations, annotation]);
    }

    setAnnotationError('');
    setNewAnnotation({ type: 'exposure', date: '', endDate: '', label: '', description: '', color: '', labelFontSize: DEFAULT_LABEL_FONT_SIZE, labelFontWeight: 'medium', labelFontFamily: 'sans', labelShape: 'none' });
    setEditingAnnotationId(null);
    setShowAnnotationForm(false);
  };

  const cancelAnnotationEdit = () => {
    setNewAnnotation({ type: 'exposure', date: '', endDate: '', label: '', description: '', color: '', labelFontSize: DEFAULT_LABEL_FONT_SIZE, labelFontWeight: 'medium', labelFontFamily: 'sans', labelShape: 'none' });
    setAnnotationError('');
    setEditingAnnotationId(null);
    setShowAnnotationForm(false);
  };

  // Handle click on chart to add annotation
  const handleChartClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartBodyRef.current || displayData.bins.length === 0) return;

    const rect = chartBodyRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + chartBodyRef.current.scrollLeft;

    // Map the click onto the actual rendered bins (first bin start → last bin end).
    // dateRange doesn't always match the rendered span (extra trailing bin, and
    // manual-range filtering), so derive the span from the bins themselves.
    const bins = displayData.bins;
    const totalWidth = bins.length * barWidth;
    const fraction = Math.max(0, Math.min(1, clickX / totalWidth));
    const firstStart = bins[0].startDate.getTime();
    const lastEnd = bins[bins.length - 1].endDate.getTime();
    const clickTime = firstStart + fraction * (lastEnd - firstStart);
    const dateString = formatLocalDate(new Date(clickTime));

    // Position popup near click
    setClickAddPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      date: dateString,
    });
  };

  // Save annotation from click-to-add popup
  const saveClickAnnotation = () => {
    if (!clickAddPosition || !newAnnotation.type) return;

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: newAnnotation.type,
      category: getAnnotationCategory(newAnnotation.type),
      date: parseLocalDate(clickAddPosition.date),
      label: newAnnotation.label || getDefaultLabelForType(newAnnotation.type),
      description: newAnnotation.description || undefined,
      color: newAnnotation.color || getAnnotationColor(newAnnotation.type),
      source: 'manual',
      labelFontSize: newAnnotation.labelFontSize,
      labelFontWeight: newAnnotation.labelFontWeight,
      labelFontFamily: newAnnotation.labelFontFamily,
      labelShape: newAnnotation.labelShape,
    };

    if (newAnnotation.endDate) {
      // Treat a date-only end as inclusive of that whole day
      const end = parseLocalDate(newAnnotation.endDate);
      end.setHours(23, 59, 59, 999);
      annotation.endDate = end;
    }

    setAnnotations([...annotations, annotation]);
    setClickAddPosition(null);
    setNewAnnotation({ type: 'exposure', date: '', endDate: '', label: '', description: '', color: '', labelFontSize: DEFAULT_LABEL_FONT_SIZE, labelFontWeight: 'medium', labelFontFamily: 'sans', labelShape: 'none' });
  };

  // Cancel click-to-add
  const cancelClickAdd = () => {
    setClickAddPosition(null);
    setNewAnnotation({ type: 'exposure', date: '', endDate: '', label: '', description: '', color: '', labelFontSize: DEFAULT_LABEL_FONT_SIZE, labelFontWeight: 'medium', labelFontFamily: 'sans', labelShape: 'none' });
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

  /** Move a label relative to its anchor. Called while dragging and from the offset fields. */
  const moveAnnotationLabel = useCallback((id: string, offsetX: number, offsetY: number) => {
    setAnnotations(prev => prev.map(a =>
      a.id === id ? { ...a, labelOffsetX: Math.round(offsetX), labelOffsetY: Math.round(offsetY) } : a
    ));
  }, []);

  /** Drop a hand-set position so the label returns to its anchor and rejoins auto-stacking. */
  const resetAnnotationLabelPosition = useCallback((id: string) => {
    setAnnotations(prev => prev.map(a => {
      if (a.id !== id) return a;
      const next = { ...a };
      delete next.labelOffsetX;
      delete next.labelOffsetY;
      return next;
    }));
  }, []);

  const exportChart = async (format: 'png' | 'svg') => {
    if (!chartRef.current) return;

    if (format === 'svg') {
      // Create SVG export from the same filtered data and y-axis scale as the screen
      const svgContent = generateSVG(displayData, yAxisMax, chartTitle, xAxisLabel, yAxisLabel, showGridLines, showCaseCounts, stratifyBy, colorScheme, allAnnotations, exposureWindow);
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      downloadBlob(blob, `${chartTitle.replace(/\s+/g, '_')}.svg`);
    } else {
      // PNG export: rasterize the live chart container so the PNG matches the screen
      setIsExporting(true);
      try {
        const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 });
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) downloadBlob(blob, `${chartTitle.replace(/\s+/g, '_')}.png`);
      } catch (err) {
        console.error('PNG export failed:', err);
      } finally {
        setIsExporting(false);
      }
    }
  };

  // Calculate bar width based on optimal sizing, not container width
  const barWidth = getOptimalBarWidth(displayData.bins.length);
  const chartHeight = 300;

  // Height of the automatically placed annotation labels at the top of the plot.
  // Hand-positioned labels are excluded: the user put those where they wanted
  // them, so the axis should not be rescaled around them.
  const annotationBandHeight = useMemo(() => {
    if (annotationOffsets.size === 0) return 0;
    const lastRow = Math.max(...annotationOffsets.values()) / ANNOTATION_ROW_HEIGHT;
    return 4 + (lastRow + 1) * ANNOTATION_ROW_HEIGHT;
  }, [annotationOffsets]);

  // Y-axis max: at least 1 above the highest bar and rounded to a nice number,
  // then extended so the tallest bar plus its count label clears the annotation
  // band. Without this a tall bar grows straight through the labels, which is
  // most likely on exactly the charts that are annotated.
  const yAxisMax = useMemo(() => {
    const base = Math.max(
      displayData.maxCount + 1,
      Math.ceil((displayData.maxCount + 1) / 5) * 5
    );
    if (annotationBandHeight === 0 || displayData.maxCount === 0) return base;

    const usable = chartHeight - COUNT_LABEL_HEIGHT - annotationBandHeight;
    if (usable <= 0) return base;

    const needed = (displayData.maxCount * chartHeight) / usable;
    return Math.max(base, Math.ceil(needed / 5) * 5);
  }, [displayData.maxCount, annotationBandHeight, chartHeight]);

  // Determine if x-axis labels should be rotated based on available space
  // Estimate label width: assume ~7px per character on average for the label text
  const shouldRotateLabels = useMemo(() => {
    if (displayData.bins.length === 0) return false;

    // Sample a few labels to estimate average width
    const sampleLabels = displayData.bins.slice(0, Math.min(5, displayData.bins.length));
    const avgLabelLength = sampleLabels.reduce((sum, bin) => sum + bin.label.length, 0) / sampleLabels.length;
    const estimatedLabelWidth = avgLabelLength * 7; // ~7px per character

    // If bar width is less than estimated label width + padding, rotate labels
    // Add 10px padding for comfortable spacing
    return barWidth < (estimatedLabelWidth + 10);
  }, [displayData.bins, barWidth]);

  // Determine which x-axis labels should be shown (skip labels when too many bins)
  const labelSkipInterval = displayData.bins.length > 50
    ? Math.ceil(displayData.bins.length / 30)
    : 1;
  const shouldShowLabel = (index: number) => index % labelSkipInterval === 0;

  return (
    <div ref={containerRef} className={`h-full flex flex-col lg:flex-row ${isResizing ? 'select-none' : ''}`}>
      {/* Left Panel - Controls */}
      <div
        className="w-full lg:w-auto flex-shrink-0 bg-gray-50 border-b lg:border-b-0 border-gray-200 p-4 overflow-y-auto max-h-[40vh] lg:max-h-none"
        style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? panelWidth : undefined }}
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
              onChange={(e) => {
                setBinSize(e.target.value as BinSize);
                userChangedBinSize.current = true;
              }}
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

          {/* Time Column - only show for sub-daily bins */}
          {isSubDailyBin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Column</label>
              {timeColumns.length > 0 ? (
                <select
                  value={timeColumn}
                  onChange={(e) => setTimeColumn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">None (use midnight)</option>
                  {timeColumns.map(col => (
                    <option key={col.key} value={col.key}>{col.label}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-500 italic py-2">
                  No time columns found. Cases will be placed at midnight.
                </p>
              )}
            </div>
          )}

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
            <p className="text-xs text-gray-500 mt-1 mb-2">
              Click anywhere on the chart to add one at that date, then drag its
              label to position it.
            </p>

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
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Label</label>
                  <input
                    type="text"
                    value={newAnnotation.label}
                    onChange={(e) => setNewAnnotation({ ...newAnnotation, label: e.target.value })}
                    placeholder="Type anything"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                {/* Appearance */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Shape</label>
                    <select
                      value={newAnnotation.labelShape}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, labelShape: e.target.value as 'none' | 'box' | 'pill' })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                    >
                      <option value="none">Plain text</option>
                      <option value="box">Box</option>
                      <option value="pill">Pill</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Colour</label>
                    <input
                      type="color"
                      value={newAnnotation.color || '#6B7280'}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, color: e.target.value })}
                      className="w-full h-[30px] px-1 py-0.5 border border-gray-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Font size</label>
                    <input
                      type="number"
                      min={8}
                      max={28}
                      step={1}
                      value={newAnnotation.labelFontSize}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, labelFontSize: Number(e.target.value) })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Weight</label>
                    <select
                      value={newAnnotation.labelFontWeight}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, labelFontWeight: e.target.value as 'normal' | 'medium' | 'bold' })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                    >
                      <option value="normal">Normal</option>
                      <option value="medium">Medium</option>
                      <option value="bold">Bold</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Typeface</label>
                    <select
                      value={newAnnotation.labelFontFamily}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, labelFontFamily: e.target.value as 'sans' | 'serif' | 'mono' })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                    >
                      <option value="sans">Sans serif</option>
                      <option value="serif">Serif</option>
                      <option value="mono">Monospace</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Limited to these three so exported figures render the same on any machine.
                    </p>
                  </div>
                </div>
                {newAnnotation.type === 'exposure' && (
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
                {annotationError && (
                  <p className="text-xs text-red-600">{annotationError}</p>
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
                    className="px-2 py-1 text-xs rounded"
                    style={{ backgroundColor: `${ann.color}15` }}
                  >
                    <div className="flex items-center justify-between">
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
                        title="Edit annotation, including the date it points at"
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
                    {/* Label position. Dragging is the fast path; these fields are
                        the keyboard-accessible equivalent. */}
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span className="flex-shrink-0">Label</span>
                      <label className="flex items-center gap-1">
                        <span className="sr-only">{`Horizontal offset for ${ann.label}`}</span>
                        <span aria-hidden="true">x</span>
                        <input
                          type="number"
                          step={4}
                          value={ann.labelOffsetX ?? 0}
                          onChange={(e) => moveAnnotationLabel(ann.id, Number(e.target.value), ann.labelOffsetY ?? 0)}
                          className="w-14 px-1 py-0.5 border border-gray-300 rounded text-xs"
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        <span className="sr-only">{`Vertical offset for ${ann.label}`}</span>
                        <span aria-hidden="true">y</span>
                        <input
                          type="number"
                          step={4}
                          value={ann.labelOffsetY ?? 0}
                          onChange={(e) => moveAnnotationLabel(ann.id, ann.labelOffsetX ?? 0, Number(e.target.value))}
                          className="w-14 px-1 py-0.5 border border-gray-300 rounded text-xs"
                        />
                      </label>
                      {(ann.labelOffsetX !== undefined || ann.labelOffsetY !== undefined) && (
                        <button
                          onClick={() => resetAnnotationLabelPosition(ann.id)}
                          className="text-gray-400 hover:text-gray-600 underline"
                          title="Return the label to its anchor and let it auto-position"
                        >
                          reset
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exposure Estimation */}
          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={() => setShowExposurePanel(!showExposurePanel)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-gray-700">Exposure Estimation</span>
              <span className="text-gray-400">{showExposurePanel ? '−' : '+'}</span>
            </button>

            {showExposurePanel && (
              <div className="mt-3 space-y-3">
                {/* Pathogen Selection */}
                <div>
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
                  <div className="space-y-2">
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

            {/* Date Range */}
            <div className="space-y-3 pt-3 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">X-Axis Date Range</p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useManualDateRange}
                  onChange={(e) => setUseManualDateRange(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">Use custom date range</span>
              </label>
              {useManualDateRange && (
                <div className="space-y-2 ml-6">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={manualStartDate}
                      onChange={(e) => setManualStartDate(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End Date</label>
                    <input
                      type="date"
                      value={manualEndDate}
                      onChange={(e) => setManualEndDate(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (curveData.bins.length > 0) {
                        setManualStartDate(formatLocalDate(curveData.dateRange.start));
                        setManualEndDate(formatLocalDate(curveData.dateRange.end));
                      }
                    }}
                    className="text-xs text-gray-600 hover:text-gray-900 underline"
                  >
                    Reset to data range
                  </button>
                </div>
              )}
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
        {displayData.bins.length > 0 ? (
          <div>
            <div ref={chartRef} className="bg-white border border-gray-200 rounded-lg p-4">
              {/* Title */}
              <h4 className="text-center text-lg font-semibold text-gray-900 mb-4">{chartTitle}</h4>

              {/* Legend for Stratified Charts */}
              {stratifyBy && displayData.strataKeys.length > 0 && (
                <div className="flex flex-wrap justify-center gap-4 mb-4 pb-3 border-b border-gray-200">
                  {displayData.strataKeys.map((strataKey, strataIndex) => (
                    <div key={strataKey} className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{
                          backgroundColor: getColorForStrata(strataKey, strataIndex, colorScheme),
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
                <div
                  ref={chartBodyRef}
                  // `safe center` centres a narrow chart in a wide panel but
                  // falls back to flex-start when the chart overflows, so a
                  // many-bin curve still scrolls from its left edge instead of
                  // having the start clipped.
                  className="flex-1 overflow-x-auto cursor-crosshair flex [justify-content:safe_center]"
                  onClick={handleChartClick}
                  title="Click to add an annotation at this date"
                >
                  <div
                    className="relative"
                    style={{
                      width: displayData.bins.length * barWidth,
                      marginRight: shouldRotateLabels ? 60 : 0,
                    }}
                  >
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
                        bins={displayData.bins}
                        barWidth={barWidth}
                        chartHeight={chartHeight}
                      />
                    )}

                    {/* Annotations */}
                    {allAnnotations.map(ann => (
                      <AnnotationMarker
                        key={ann.id}
                        annotation={ann}
                        bins={displayData.bins}
                        barWidth={barWidth}
                        chartHeight={chartHeight}
                        labelOffset={annotationOffsets.get(ann.id) || 0}
                        onMoveLabel={moveAnnotationLabel}
                      />
                    ))}

                    {/* Bars */}
                    <div className="flex items-end" style={{ height: chartHeight }}>
                      {displayData.bins.map((bin, binIndex) => (
                        <div
                          key={binIndex}
                          className="flex flex-col justify-end relative"
                          style={{ width: barWidth }}
                        >
                          {stratifyBy && displayData.strataKeys.length > 0 ? (
                            // Stacked bars
                            <div className="flex flex-col-reverse">
                              {displayData.strataKeys.map((strataKey, strataIndex) => {
                                const count = bin.strata.get(strataKey)?.length || 0;
                                if (count === 0) return null;
                                const height = (count / yAxisMax) * chartHeight;
                                return (
                                  <div
                                    key={strataKey}
                                    className="mx-0.5 hover:opacity-80 transition-opacity"
                                    style={{
                                      height,
                                      backgroundColor: getColorForStrata(strataKey, strataIndex, colorScheme),
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
                    <div className="flex border-t border-gray-200">
                      {displayData.bins.map((bin, index) => (
                        <div
                          key={index}
                          className="relative"
                          style={{ width: barWidth, height: shouldRotateLabels ? 96 : 34 }}
                        >
                          {shouldShowLabel(index) && (
                            <span
                              className="text-sm text-gray-500 absolute whitespace-nowrap"
                              style={
                                shouldRotateLabels
                                  ? {
                                      transform: 'rotate(45deg)',
                                      transformOrigin: '0 0',
                                      left: '50%',
                                      top: 10,
                                    }
                                  : {
                                      left: '50%',
                                      transform: 'translateX(-50%)',
                                      top: 8,
                                      textAlign: 'center',
                                    }
                              }
                            >
                              {bin.label}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Click-to-add annotation popup */}
                    {clickAddPosition && (
                      <div
                        className="absolute z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-3 w-64"
                        style={{
                          left: Math.min(clickAddPosition.x, displayData.bins.length * barWidth - 270),
                          top: Math.min(clickAddPosition.y, chartHeight - 200),
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Add Annotation</span>
                          <button
                            onClick={cancelClickAdd}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            ×
                          </button>
                        </div>
                        <div className="text-xs text-gray-500 mb-2">
                          Date: {new Date(clickAddPosition.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="space-y-2">
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
                          <input
                            type="text"
                            value={newAnnotation.label}
                            onChange={(e) => setNewAnnotation({ ...newAnnotation, label: e.target.value })}
                            placeholder="Label (optional)"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={saveClickAnnotation}
                              className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-gray-700 rounded hover:bg-gray-800"
                            >
                              Add
                            </button>
                            <button
                              onClick={cancelClickAdd}
                              className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
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
                        <strong>First case date:</strong> {exposureWindow.firstCaseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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
                  label: isExporting ? 'Exporting…' : 'Export PNG',
                  onClick: () => exportChart('png'),
                  icon: ExportIcons.download,
                  variant: 'primary',
                  disabled: isExporting,
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

// Annotation marker component - professional dashed line style (per CDC guidelines)
/**
 * Bar width for a given bin count: more bins means narrower bars, so the chart
 * sizes naturally to its content. Module scope so label-layout maths can use it.
 */
function getOptimalBarWidth(binCount: number): number {
  if (binCount === 0) return 60;
  if (binCount > 50) return 25;
  if (binCount > 30) return 35;
  if (binCount > 15) return 50;
  if (binCount > 7) return 60;
  return Math.min(80, 60 + (7 - binCount) * 3); // Cap at 80px for very few bins
}

function AnnotationMarker({ annotation, bins, barWidth, chartHeight, labelOffset = 0, onMoveLabel }: {
  annotation: Annotation;
  bins: EpiCurveData['bins'];
  barWidth: number;
  chartHeight: number;
  labelOffset?: number;
  onMoveLabel?: (id: string, offsetX: number, offsetY: number) => void;
}) {
  if (bins.length === 0) return null;

  // Find position by matching the annotation timestamp to bins
  const annotationTime = annotation.date.getTime();
  const firstBinStart = bins[0].startDate.getTime();
  const lastBinEnd = bins[bins.length - 1].endDate.getTime();

  let x: number = 0;

  if (annotationTime < firstBinStart) {
    x = 0;
  } else if (annotationTime >= lastBinEnd) {
    x = bins.length * barWidth;
  } else {
    const binIndex = bins.findIndex(b =>
      annotationTime >= b.startDate.getTime() && annotationTime < b.endDate.getTime()
    );

    if (binIndex !== -1) {
      const bin = bins[binIndex];
      const binStart = bin.startDate.getTime();
      const binEnd = bin.endDate.getTime();
      const binDuration = binEnd - binStart;
      const offsetWithinBin = annotationTime - binStart;
      const fraction = binDuration > 0 ? offsetWithinBin / binDuration : 0;
      // Center the marker on the bin when the annotation falls at the bin boundary
      // (e.g., a date-only annotation like "Jan 10" at midnight should center on Jan 10's bar)
      x = binIndex * barWidth + Math.max(fraction * barWidth, barWidth / 2);
    }
  }

  // Hand-positioned offset, if any. Undefined means the label sits at its
  // default spot and is subject to automatic collision stacking.
  const offsetX = annotation.labelOffsetX ?? 0;
  const offsetY = annotation.labelOffsetY ?? 0;
  const labelLeft = 4 + offsetX;
  const labelTop = 4 + labelOffset + offsetY;

  // Once a label is dragged clear of its anchor line, a leader keeps it obvious
  // which date it belongs to.
  const fontSize = annotation.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE;
  const shape = annotation.labelShape ?? 'none';

  const LEADER_THRESHOLD = 8;
  const showLeader = Math.abs(offsetX) > LEADER_THRESHOLD || offsetY > LEADER_THRESHOLD;

  const renderLabel = () => (
    <>
      {showLeader && (
        <svg
          className="absolute overflow-visible pointer-events-none"
          style={{ left: 0, top: 0, width: 1, height: 1 }}
          aria-hidden="true"
        >
          <line
            x1={0}
            y1={labelTop + fontSize * 0.75}
            x2={labelLeft + (offsetX < 0 ? 0 : 0)}
            y2={labelTop + fontSize * 0.75}
            stroke={annotation.color}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        </svg>
      )}
      <div
        className="absolute z-10 whitespace-nowrap px-1 pointer-events-auto cursor-move select-none"
        style={{
          color: annotation.color,
          top: labelTop,
          left: labelLeft,
          fontSize: fontSize,
          fontWeight: LABEL_FONT_WEIGHTS[annotation.labelFontWeight ?? 'medium'],
          fontFamily: LABEL_FONT_STACKS[annotation.labelFontFamily ?? 'sans'],
          backgroundColor: shape === 'none' ? 'rgba(255,255,255,0.95)' : '#ffffff',
          border: shape === 'none' ? undefined : `1px solid ${annotation.color}`,
          borderRadius: shape === 'pill' ? 999 : 4,
          paddingLeft: shape === 'pill' ? 8 : 4,
          paddingRight: shape === 'pill' ? 8 : 4,
        }}
        // Stop the chart's click-to-add from firing when a label is grabbed.
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (!onMoveLabel) return;
          e.stopPropagation();
          e.preventDefault();
          const el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          const startX = e.clientX;
          const startY = e.clientY;
          const baseX = offsetX;
          const baseY = offsetY;
          const move = (ev: PointerEvent) => {
            onMoveLabel(annotation.id, baseX + (ev.clientX - startX), baseY + (ev.clientY - startY));
          };
          const up = (ev: PointerEvent) => {
            el.releasePointerCapture(ev.pointerId);
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
          };
          el.addEventListener('pointermove', move);
          el.addEventListener('pointerup', up);
        }}
        title={`${annotation.label} (drag to reposition)`}
      >
        {annotation.label}
      </div>
    </>
  );

  // For range annotations (exposure periods), show light shaded area
  if (annotation.endDate) {
    const endTime = annotation.endDate.getTime();
    let endX: number;

    if (endTime >= lastBinEnd) {
      endX = bins.length * barWidth;
    } else {
      const endBinIndex = bins.findIndex(b =>
        endTime >= b.startDate.getTime() && endTime < b.endDate.getTime()
      );

      if (endBinIndex !== -1) {
        const bin = bins[endBinIndex];
        const binStart = bin.startDate.getTime();
        const binEnd = bin.endDate.getTime();
        const binDuration = binEnd - binStart;
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
        {/* Light shaded region */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: annotation.color, opacity: 0.1 }}
        />
        {/* Dashed border lines */}
        <div
          className="absolute top-0 bottom-0 left-0"
          style={{
            borderLeft: `1px dashed ${annotation.color}`,
          }}
        />
        <div
          className="absolute top-0 bottom-0 right-0"
          style={{
            borderRight: `1px dashed ${annotation.color}`,
          }}
        />
        {renderLabel()}
      </div>
    );
  }

  // Single date annotation - dashed vertical line with label inside chart
  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{ left: x, height: chartHeight }}
      title={annotation.label}
    >
      {/* Dashed vertical line */}
      <div
        className="absolute top-0 bottom-0"
        style={{
          borderLeft: `1.5px dashed ${annotation.color}`,
          transform: 'translateX(-50%)',
        }}
      />
      {renderLabel()}
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

function generateSVG(
  data: EpiCurveData,
  yMax: number,
  title: string,
  xLabel: string,
  yLabel: string,
  showGrid: boolean,
  showCounts: boolean,
  stratifyBy: string,
  colorScheme: ColorScheme,
  annotations: Annotation[],
  exposureWindow: { start: Date; end: Date } | null
): string {
  const width = Math.max(800, data.bins.length * 40 + 100);
  const height = 500;
  const margin = { top: 60, right: 80, bottom: 110, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const barWidth = data.bins.length > 0 ? chartWidth / data.bins.length : chartWidth;
  const chartBottom = margin.top + chartHeight;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background: white;">`;

  // Title
  svg += `<text x="${width / 2}" y="30" text-anchor="middle" font-size="18" font-weight="bold">${escapeXml(title)}</text>`;

  // Legend for stratified charts
  if (stratifyBy && data.strataKeys.length > 0) {
    const legendY = 45;
    const legendItemWidth = 120;
    const legendStartX = (width - (data.strataKeys.length * legendItemWidth)) / 2;

    data.strataKeys.forEach((key, index) => {
      const x = legendStartX + (index * legendItemWidth);
      const color = getColorForStrata(key, index, colorScheme);
      // Legend color box
      svg += `<rect x="${x}" y="${legendY}" width="12" height="12" fill="${color}"/>`;
      // Legend text
      svg += `<text x="${x + 16}" y="${legendY + 10}" font-size="12">${escapeXml(key)}</text>`;
    });
  }

  // Y-axis label
  svg += `<text x="20" y="${height / 2}" text-anchor="middle" font-size="14" transform="rotate(-90, 20, ${height / 2})">${escapeXml(yLabel)}</text>`;

  // X-axis label
  svg += `<text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="14">${escapeXml(xLabel)}</text>`;

  // Grid lines
  if (showGrid) {
    for (let i = 0; i <= 5; i++) {
      const y = margin.top + (i / 5) * chartHeight;
      svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
    }
  }

  // Y-axis ticks (same yMax scale as the on-screen chart)
  for (let i = 0; i <= 5; i++) {
    const value = Math.round((yMax * (5 - i)) / 5);
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
          const barHeight = (count / yMax) * chartHeight;
          const y = chartBottom - cumHeight - barHeight;
          const color = getColorForStrata(key, keyIndex, colorScheme);
          svg += `<rect x="${x + 2}" y="${y}" width="${barWidth - 4}" height="${barHeight}" fill="${color}"/>`;
          cumHeight += barHeight;
        }
      });
    } else if (bin.total > 0) {
      const barHeight = (bin.total / yMax) * chartHeight;
      const y = chartBottom - barHeight;
      svg += `<rect x="${x + 2}" y="${y}" width="${barWidth - 4}" height="${barHeight}" fill="#3B82F6"/>`;
    }

    // Case count
    if (showCounts && bin.total > 0) {
      const barHeight = (bin.total / yMax) * chartHeight;
      svg += `<text x="${x + barWidth / 2}" y="${chartBottom - barHeight - 5}" text-anchor="middle" font-size="10">${bin.total}</text>`;
    }

    // X-axis label
    const labelX = x + barWidth / 2;
    const labelY = chartBottom + 12;
    svg += `<text x="${labelX}" y="${labelY}" text-anchor="start" font-size="11" transform="rotate(45, ${labelX}, ${labelY})">${escapeXml(bin.label)}</text>`;
  });

  // Map a timestamp to an x position, mirroring the on-screen marker math:
  // date-only (midnight) annotations are centered on their bin.
  const xForTime = (time: number, centerInBin: boolean): number | null => {
    if (data.bins.length === 0) return null;
    const firstStart = data.bins[0].startDate.getTime();
    const lastEnd = data.bins[data.bins.length - 1].endDate.getTime();
    if (time < firstStart) return margin.left;
    if (time >= lastEnd) return width - margin.right;
    const binIndex = data.bins.findIndex(b => time >= b.startDate.getTime() && time < b.endDate.getTime());
    if (binIndex === -1) return null;
    const bin = data.bins[binIndex];
    const binDuration = bin.endDate.getTime() - bin.startDate.getTime();
    const fraction = binDuration > 0 ? (time - bin.startDate.getTime()) / binDuration : 0;
    const within = centerInBin ? Math.max(fraction * barWidth, barWidth / 2) : fraction * barWidth;
    return margin.left + binIndex * barWidth + within;
  };

  // Work out where every top-of-plot label wants to sit, and stack the ones
  // that would overlap. The export previously drew them all at margin.top + 12,
  // so close-together milestones printed straight through each other.
  const SVG_LABEL_FONT = 10;
  const SVG_ROW_HEIGHT = 13;
  const labelBoxes: { id: string; x: number; width: number }[] = [];

  if (exposureWindow && data.bins.length > 0) {
    const firstStart = data.bins[0].startDate.getTime();
    const lastEnd = data.bins[data.bins.length - 1].endDate.getTime();
    const totalDuration = lastEnd - firstStart;
    const t = exposureWindow.start.getTime();
    const ex = t <= firstStart
      ? margin.left
      : t >= lastEnd
        ? width - margin.right
        : margin.left + ((t - firstStart) / totalDuration) * chartWidth;
    labelBoxes.push({ id: '__exposure__', x: ex + 4, width: estimateLabelWidth('Est. Exposure', SVG_LABEL_FONT) });
  }
  annotations.forEach(ann => {
    if (isNaN(ann.date.getTime())) return;
    // Hand-positioned labels are excluded: they sit where the user put them and
    // must not push automatically placed labels around.
    if (ann.labelOffsetX !== undefined || ann.labelOffsetY !== undefined) return;
    const ax = xForTime(ann.date.getTime(), true);
    if (ax === null) return;
    labelBoxes.push({
      id: ann.id,
      x: ax + 4,
      width: estimateLabelWidth(ann.label, ann.labelFontSize ?? SVG_LABEL_FONT),
    });
  });
  const labelRows = assignLabelRows(labelBoxes);
  const labelY = (id: string): number =>
    margin.top + 12 + (labelRows.get(id) ?? 0) * SVG_ROW_HEIGHT;

  /**
   * Where an annotation's label is drawn, matching the on-screen marker: a
   * hand-set offset wins, otherwise the automatic row. Returns the text anchor
   * plus a leader line back to the anchor when the label has been moved clear.
   */
  const labelPlacement = (ann: Annotation, anchorX: number) => {
    const hasOffset = ann.labelOffsetX !== undefined || ann.labelOffsetY !== undefined;
    const dx = ann.labelOffsetX ?? 0;
    const dy = ann.labelOffsetY ?? 0;
    const x = anchorX + 4 + dx;
    const y = hasOffset ? margin.top + 12 + dy : labelY(ann.id);
    const needsLeader = hasOffset && (Math.abs(dx) > 8 || dy > 8);
    const leader = needsLeader
      ? `<line x1="${anchorX}" y1="${y - 3}" x2="${x}" y2="${y - 3}" stroke="${ann.color}" stroke-width="1" stroke-dasharray="2 2"/>`
      : '';

    const size = ann.labelFontSize ?? SVG_LABEL_FONT;
    const shape = ann.labelShape ?? 'none';
    const attrs =
      `font-size="${size}" ` +
      `font-weight="${LABEL_FONT_WEIGHTS[ann.labelFontWeight ?? 'medium']}" ` +
      `font-family="${escapeXml(LABEL_FONT_STACKS[ann.labelFontFamily ?? 'sans'])}" ` +
      `fill="${ann.color}"`;

    // Box and pill need a drawn container; SVG text has no background.
    let container = '';
    if (shape !== 'none') {
      const w = estimateLabelWidth(ann.label, size) + (shape === 'pill' ? 16 : 8);
      const h = size + 6;
      container =
        `<rect x="${x - (shape === 'pill' ? 8 : 4)}" y="${y - size + 1}" width="${w}" height="${h}" ` +
        `rx="${shape === 'pill' ? h / 2 : 3}" fill="#ffffff" stroke="${ann.color}" stroke-width="1"/>`;
    }
    return { x, y, leader, attrs, container };
  };

  // Exposure window shading (matches the on-screen translucent red band)
  if (exposureWindow && data.bins.length > 0) {
    const firstStart = data.bins[0].startDate.getTime();
    const lastEnd = data.bins[data.bins.length - 1].endDate.getTime();
    const totalDuration = lastEnd - firstStart;
    const toX = (time: number): number => {
      if (time <= firstStart) return margin.left;
      if (time >= lastEnd) return width - margin.right;
      return margin.left + ((time - firstStart) / totalDuration) * chartWidth;
    };
    const x1 = toX(exposureWindow.start.getTime());
    const x2 = toX(exposureWindow.end.getTime());
    const w = Math.max(x2 - x1, barWidth / 2);
    svg += `<rect x="${x1}" y="${margin.top}" width="${w}" height="${chartHeight}" fill="rgba(220, 38, 38, 0.15)"/>`;
    svg += `<line x1="${x1}" y1="${margin.top}" x2="${x1}" y2="${chartBottom}" stroke="#F87171" stroke-width="2"/>`;
    svg += `<line x1="${x1 + w}" y1="${margin.top}" x2="${x1 + w}" y2="${chartBottom}" stroke="#F87171" stroke-width="2"/>`;
    svg += `<text x="${x1 + 4}" y="${labelY('__exposure__')}" font-size="${SVG_LABEL_FONT}" font-weight="500" fill="#B91C1C">Est. Exposure</text>`;
  }

  // Annotations (dashed markers / shaded ranges, as on screen)
  annotations.forEach(ann => {
    if (isNaN(ann.date.getTime())) return;
    const x = xForTime(ann.date.getTime(), true);
    if (x === null) return;

    if (ann.endDate && !isNaN(ann.endDate.getTime())) {
      const endX = xForTime(ann.endDate.getTime(), false) ?? x;
      const w = Math.max(endX - x, barWidth / 2);
      svg += `<rect x="${x}" y="${margin.top}" width="${w}" height="${chartHeight}" fill="${ann.color}" opacity="0.1"/>`;
      svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${chartBottom}" stroke="${ann.color}" stroke-width="1" stroke-dasharray="4 3"/>`;
      svg += `<line x1="${x + w}" y1="${margin.top}" x2="${x + w}" y2="${chartBottom}" stroke="${ann.color}" stroke-width="1" stroke-dasharray="4 3"/>`;
      const p = labelPlacement(ann, x);
      svg += p.leader + p.container;
      svg += `<text x="${p.x}" y="${p.y}" ${p.attrs}>${escapeXml(ann.label)}</text>`;
    } else {
      svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${chartBottom}" stroke="${ann.color}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      const p = labelPlacement(ann, x);
      svg += p.leader + p.container;
      svg += `<text x="${p.x}" y="${p.y}" ${p.attrs}>${escapeXml(ann.label)}</text>`;
    }
  });

  svg += '</svg>';
  return svg;
}
