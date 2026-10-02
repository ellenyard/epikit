import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Dataset } from '../../types/analysis';
import {
  assignLabelRows,
  estimateLabelWidth,
  LABEL_FONT_STACKS,
  LABEL_FONT_WEIGHTS,
  DEFAULT_LABEL_FONT_SIZE,
} from '../../utils/labelLayout';
import {
  processEpiCurveData, emptyEpiCurveData, getColorForStrata, getAnnotationColor, getAnnotationCategory,
  ANNOTATION_CATEGORIES, PATHOGEN_INCUBATION, BIN_SIZE_NAMES, parseLocalDate, parseWallClock, parseTimeString,
  isBinSize, isSubDailyBinSize, serializeAnnotation, reviveAnnotation, annotationSpan, spanInBins,
  chooseAxisLabels, fullBinLabel, binSizeNote, estimateExposureWindow, formatIncubationRange, incubationHours,
  suggestBinSize, niceAxisMax,
} from '../../utils/epiCurve';
import type { BinSize, ColorScheme, Annotation, EpiCurveData, AnnotationType } from '../../utils/epiCurve';
import { generateEpiCurveSVG } from '../../utils/epiCurveSvg';
import { EpiCurveTutorial } from '../tutorials/EpiCurveTutorial';
import { TabHeader, ResultsActions, ExportIcons, AdvancedOptions, HelpPanel } from '../shared';
import { exportChartPNG, exportChartSVG, chartFilename, downloadBlob } from '../../utils/chartExport';
import { exportToCSV } from '../../utils/csvParser';
import { pickOutcomeColumn, readsAsNonCase } from '../../utils/caseDefinition';
import { findCountColumn, countColumnCandidates } from '../../utils/countColumn';
import { formatLocaleNumber } from '../../utils/localeNumbers';
import { useLocale } from '../../contexts/LocaleContext';
import {
  categoryValue, collectCategoryValues, countInCategory, filterByCategoryValues, isMissingValue,
  MISSING_CATEGORY_LABEL,
} from '../../utils/recordFilter';

/** Vertical pitch of stacked annotation label rows, in px. */
const ANNOTATION_ROW_HEIGHT = 20;

/** Space a bar's count label needs above the bar: a 2px gap plus the text. */
const COUNT_LABEL_HEIGHT = 18;

// Format a Date as YYYY-MM-DD using local date components.
// (toISOString() is UTC and shifts the date back a day in UTC+ timezones.)
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A Date's local time of day as HH:MM, the form a time input holds. */
function formatLocalTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A date for display, with its time of day when there is one to show. */
function formatWhen(d: Date, withTime: boolean, withYear = false): string {
  const date = d.toLocaleDateString('en-US', withYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' });
  return withTime ? `${date} ${formatLocalTime(d)}` : date;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** The annotation form before anything has been typed into it. */
const EMPTY_ANNOTATION_FORM = {
  type: 'exposure' as AnnotationType,
  date: '',
  time: '',
  endDate: '',
  endTime: '',
  label: '',
  description: '',
  color: '',
  labelFontSize: DEFAULT_LABEL_FONT_SIZE,
  labelFontWeight: 'medium' as 'normal' | 'medium' | 'bold',
  labelFontFamily: 'sans' as 'sans' | 'serif' | 'mono',
  labelShape: 'none' as 'none' | 'box' | 'pill',
};

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
    // The picnic ran from noon to 2 PM, and is drawn there. It used to be a
    // date with no time, which the chart could only place by its bin: on these
    // 12-hour bars the marker labelled "12–2 PM" stood at 6 AM.
    date: parseLocalDate('2026-01-10T12:00'),
    endDate: parseLocalDate('2026-01-10T14:00'),
    hasTime: true,
    endHasTime: true,
    label: 'Exposure: 12–2 PM',
    description: 'Synthetic community picnic exposure',
    color: getAnnotationColor('exposure'),
    source: 'manual',
  }];
}

export function EpiCurve({ dataset, onExportDataset, preset }: EpiCurveProps) {
  const isSampleOutbreakPreset = preset === 'sample-outbreak';
  const containerRef = useRef<HTMLDivElement>(null);
  const chartBodyRef = useRef<HTMLDivElement>(null);
  const { config: localeConfig } = useLocale();
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

  // Tracks manual bin-size changes. Only a size the user picked is kept from
  // storage: the suggested size is saved too, and treating that as a choice
  // froze whatever was suggested the first time the dataset was opened.
  const userChangedBinSize = useRef(isSampleOutbreakPreset || saved.binSizeChosen === true);

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(288); // 18rem = 288px
  const [isResizing, setIsResizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

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
  // The column saying how many cases each record stands for, for aggregated
  // data; '' when each record is one case, null until the user has chosen.
  const [countColumnChoice, setCountColumnChoice] = useState<string | null>(() =>
    isSampleOutbreakPreset ? '' : typeof saved.countColumn === 'string' ? saved.countColumn : null);

  // Filter state
  const [filterBy, setFilterBy] = useState<string>(() => isSampleOutbreakPreset ? '' : (saved.filterBy as string) ?? '');
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(() => {
    if (isSampleOutbreakPreset) return new Set();
    const arr = saved.selectedFilterValues;
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  });
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);
  // Whether records the case-status column marks as non-cases are drawn.
  const [includeNonCases, setIncludeNonCases] = useState(() => isSampleOutbreakPreset ? false : saved.includeNonCases === true);

  // Display options
  const [showGridLines, setShowGridLines] = useState(() => isSampleOutbreakPreset || (saved.showGridLines !== undefined ? saved.showGridLines as boolean : true));
  const [showCaseCounts, setShowCaseCounts] = useState(() => isSampleOutbreakPreset || (saved.showCaseCounts !== undefined ? saved.showCaseCounts as boolean : true));
  const [chartTitle, setChartTitle] = useState(() => isSampleOutbreakPreset ? 'Epidemic Curve' : (saved.chartTitle as string) ?? 'Epidemic Curve');
  const [xAxisLabel, setXAxisLabel] = useState(() => isSampleOutbreakPreset ? 'Onset Date' : (saved.xAxisLabel as string) ?? 'Date of Onset');
  const [yAxisLabel, setYAxisLabel] = useState(() => isSampleOutbreakPreset ? 'Number of Cases' : (saved.yAxisLabel as string) ?? 'Number of Cases');

  // Annotations. Dates are saved as the dates typed, not as UTC instants;
  // reviveAnnotation also reads the instants earlier versions saved.
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    if (isSampleOutbreakPreset) return createSampleOutbreakAnnotations();
    const arr = saved.annotations;
    if (Array.isArray(arr)) {
      return arr
        .map((a: Record<string, unknown>) => reviveAnnotation(a))
        .filter((a): a is Annotation => a !== null);
    }
    return [];
  });
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [newAnnotation, setNewAnnotation] = useState(EMPTY_ANNOTATION_FORM);
  const [annotationError, setAnnotationError] = useState('');

  // Click-to-add annotation state
  const [clickAddPosition, setClickAddPosition] = useState<{ x: number; y: number; date: string; time: string } | null>(null);

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
        annotations: annotations.map(serializeAnnotation),
        manualStartDate,
        manualEndDate,
        useManualDateRange,
        dateColumn,
        timeColumn,
        binSize,
        binSizeChosen: userChangedBinSize.current,
        countColumn: countColumnChoice ?? undefined,
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
        includeNonCases,
      };
      localStorage.setItem(persistenceKey, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save epi curve settings:', e);
    }
  }, [persistenceKey, annotations, manualStartDate, manualEndDate, useManualDateRange,
    dateColumn, timeColumn, binSize, countColumnChoice, stratifyBy, colorScheme, showGridLines, showCaseCounts,
    chartTitle, xAxisLabel, yAxisLabel, selectedPathogen, showExposureWindow,
    filterBy, selectedFilterValues, includeNonCases]);

  // Columns that could hold a count of cases. A dataset with
  // one row per report (district, month, cases) is recognised and its count
  // column used from the start; counting its rows drew the same bar every month.
  const numericColumns = useMemo(
    () => countColumnCandidates(dataset.columns, dataset.records),
    [dataset.columns, dataset.records]
  );
  const detectedCountColumn = useMemo(
    () => findCountColumn(dataset.columns, dataset.records)?.key ?? '',
    [dataset.columns, dataset.records]
  );
  const requestedCountColumn = countColumnChoice ?? detectedCountColumn;
  const countColumn = numericColumns.some(c => c.key === requestedCountColumn) ? requestedCountColumn : '';

  // Find date columns (memoized to prevent unnecessary re-renders)
  const dateColumns = useMemo(
    () => dataset.columns.filter(c => c.type === 'date' || c.key.toLowerCase().includes('date')),
    [dataset.columns]
  );

  // Find potential time columns: text columns named for a time, or whose
  // values read as clock times. Import types a short list of repeated times
  // (22:00, 02:00, ...) as categorical, and a file's own header may say
  // "heure" or "hora", so neither the type nor the name alone is enough.
  const timeColumns = useMemo(
    () => dataset.columns.filter(c => {
      if (c.type !== 'text' && c.type !== 'categorical') return false;
      if (c.key.toLowerCase().includes('time')) return true;
      const sample = dataset.records
        .map(r => r[c.key])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .slice(0, 200);
      if (sample.length === 0) return false;
      // Require clock punctuation so a column of four-digit codes is not
      // mistaken for 24-hour times.
      const clockLike = sample.filter(v => /\d\s*(:|h|am|pm)/i.test(v) && parseTimeString(v) !== null);
      return clockLike.length >= sample.length * 0.8;
    }),
    [dataset.columns, dataset.records]
  );

  // Check if using sub-daily bin size
  const isSubDailyBin = isSubDailyBinSize(binSize);

  // Auto-select first date column
  useEffect(() => {
    if (!dateColumn && dateColumns.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- A default chosen once the dataset's columns are known.
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
      /* eslint-disable react-hooks/set-state-in-effect -- A default that follows the date column until the user picks one. */
      if (matchingTimeCol) {
        setTimeColumn(matchingTimeCol.key);
      } else if (!timeColumn) {
        // Default to first time column if no match
        setTimeColumn(timeColumns[0].key);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [dateColumn, timeColumns, timeColumn, saved]);

  // Whether any record says what time of day it happened, either in the time
  // column or written with the date. Without that, bins finer than a day put
  // every case on a midnight bar.
  const hasUsableTimes = useMemo(() => {
    if (!dateColumn) return false;
    return dataset.records.some(r => {
      const raw = r[dateColumn];
      if (isMissingValue(raw)) return false;
      const w = parseWallClock(raw instanceof Date ? raw : String(raw));
      if (!w) return false;
      if (w.hasTime) return true;
      return timeColumn !== '' && parseTimeString(String(r[timeColumn] ?? '')) !== null;
    });
  }, [dataset.records, dateColumn, timeColumn]);

  // Get unique values for the filter dropdown
  const filterValues = useMemo(() => {
    if (!filterBy) return [];
    return collectCategoryValues(dataset.records, filterBy);
  }, [dataset.records, filterBy]);

  // Reset selected filter values when filter variable changes
  // (but not on mount, which would wipe selections restored from saved settings)
  const filterResetSkipped = useRef(false);
  useEffect(() => {
    if (!filterResetSkipped.current) {
      filterResetSkipped.current = true;
      return;
    }
    /* eslint-disable react-hooks/set-state-in-effect -- The ticked values belong to the previous filter column. */
    setSelectedFilterValues(new Set());
    setShowAllFilterValues(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [filterBy]);

  // Update x-axis label when date column changes, unless the user has written
  // their own. This used to run on every mount and replace a custom label with
  // the column name each time the tab was reopened.
  useEffect(() => {
    if (dateColumn) {
      const column = dataset.columns.find(c => c.key === dateColumn);
      if (column) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- The default label follows the date column.
        setXAxisLabel(current => {
          const isAutomatic = current === '' || current === 'Date of Onset'
            || dataset.columns.some(c => c.label === current);
          return isAutomatic ? column.label : current;
        });
      }
    }
  }, [dateColumn, dataset.columns]);

  // Apply filter to records
  const filteredRecords = useMemo(
    () => filterByCategoryValues(dataset.records, filterBy, selectedFilterValues),
    [dataset.records, filterBy, selectedFilterValues]
  );

  // The column that says who is a case, and the values in it that say "not a
  // case". Found the same way the 2x2 panel finds its outcome: by a name that
  // says so and values that split into cases and non-cases.
  const caseColumn = useMemo(() => {
    const candidates = dataset.columns
      .filter(c => c.type !== 'date' && c.type !== 'number')
      .map(c => ({
        key: c.key,
        label: c.label,
        values: collectCategoryValues(dataset.records, c.key).filter(v => v !== MISSING_CATEGORY_LABEL),
      }))
      .filter(c => c.values.length >= 2 && c.values.length <= 20);
    const picked = pickOutcomeColumn(candidates);
    const column = picked ? candidates.find(c => c.key === picked.key) : undefined;
    if (!column) return null;
    const nonCaseValues = column.values.filter(v => readsAsNonCase(v));
    if (nonCaseValues.length === 0) return null;
    return { key: column.key, label: column.label, nonCaseValues: new Set(nonCaseValues) };
  }, [dataset.columns, dataset.records]);

  // An epidemic curve counts cases. Records marked "Not a case" were drawn as
  // cases whenever they had an onset date, and counted in the "cases" total
  // whether they had one or not. They are now left out unless asked for, and
  // the summary says how many. Filtering on the case column itself is taken as
  // an explicit choice and is not second-guessed.
  const { curveRecords, nonCaseCount } = useMemo(() => {
    if (!caseColumn || filterBy === caseColumn.key) {
      return { curveRecords: filteredRecords, nonCaseCount: 0 };
    }
    const cases = filteredRecords.filter(r => !caseColumn.nonCaseValues.has(categoryValue(r[caseColumn.key])));
    return {
      curveRecords: includeNonCases ? filteredRecords : cases,
      nonCaseCount: filteredRecords.length - cases.length,
    };
  }, [filteredRecords, caseColumn, filterBy, includeNonCases]);

  // "Cases" when a column counts them, or when non-cases have been identified
  // and left out. What is left out is always counted in records.
  const recordNoun = countColumn || (caseColumn && !includeNonCases && filterBy !== caseColumn.key) ? 'case' : 'record';
  const rowNoun = countColumn ? 'record' : recordNoun;
  const curveTimeColumn = isSubDailyBin ? timeColumn || undefined : undefined;

  // Suggest a bin size from the data, until the user chooses one.
  useEffect(() => {
    if (!dateColumn || userChangedBinSize.current) return;

    const DAY = 24 * 60 * 60 * 1000;
    let minTime = Infinity;
    let maxTime = -Infinity;
    let cases = 0;
    const days = new Set<number>();
    for (const record of curveRecords) {
      const raw = record[dateColumn];
      if (isMissingValue(raw)) continue;
      const w = parseWallClock(raw instanceof Date ? raw : String(raw));
      if (!w) continue;
      let weight = 1;
      if (countColumn) {
        const count = Number(record[countColumn]);
        if (!Number.isInteger(count) || count <= 0) continue;
        weight = count;
      }
      const day = Date.UTC(w.year, w.month, w.day);
      const time = w.hasTime ? { hours: w.hours, minutes: w.minutes }
        : timeColumn ? parseTimeString(String(record[timeColumn] ?? '')) : null;
      const at = day + (time ? time.hours * 3600000 + time.minutes * 60000 : 0);
      if (at < minTime) minTime = at;
      if (at > maxTime) maxTime = at;
      days.add(day);
      cases += weight;
    }
    if (cases === 0) return;

    const sortedDays = Array.from(days).sort((a, b) => a - b);
    let minGapDays: number | null = null;
    for (let i = 1; i < sortedDays.length; i++) {
      const gap = (sortedDays[i] - sortedDays[i - 1]) / DAY;
      if (minGapDays === null || gap < minGapDays) minGapDays = gap;
    }

    const suggestedBinSize = suggestBinSize({
      spanDays: (maxTime - minTime) / DAY,
      cases,
      hasTimes: hasUsableTimes,
      minGapDays,
    });
    if (suggestedBinSize !== binSize) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- A suggestion from the data, applied until the user chooses a bin size.
      setBinSize(suggestedBinSize);
    }
  }, [dateColumn, timeColumn, countColumn, curveRecords, binSize, hasUsableTimes]);

  // Calculate exposure window dates directly from records (before curveData processing)
  // This allows us to include them in the date range calculation
  const exposureWindowDates = useMemo(() => {
    if (!selectedPathogen || !showExposureWindow || !dateColumn) return null;

    const incubation = PATHOGEN_INCUBATION[selectedPathogen];
    if (!incubation) return null;

    // First onset among the records the curve plots, with its time of day when
    // the curve is using one.
    const { firstOnset, onsetHasTime } = processEpiCurveData(
      curveRecords, dateColumn, binSize, undefined, undefined, curveTimeColumn,
      { countColumn: countColumn || undefined }
    ).summary;
    if (!firstOnset) return null;

    return {
      ...estimateExposureWindow(firstOnset, onsetHasTime, incubation),
      pathogen: selectedPathogen,
      incubation,
      firstCaseDate: firstOnset,
      onsetHasTime,
    };
  }, [selectedPathogen, showExposureWindow, dateColumn, curveRecords, binSize, curveTimeColumn, countColumn]);

  // The custom date range, when one is set and complete.
  const manualRange = useMemo(() => {
    if (!useManualDateRange || !manualStartDate || !manualEndDate) return undefined;
    const start = parseLocalDate(manualStartDate);
    const end = parseLocalDate(manualEndDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return undefined;
    end.setHours(23, 59, 59, 999); // Include entire end day
    return { start, end };
  }, [useManualDateRange, manualStartDate, manualEndDate]);

  // Process data
  const curveData: EpiCurveData = useMemo(() => {
    if (!dateColumn) {
      return emptyEpiCurveData(binSize);
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

    // A custom date range is drawn exactly as given. It used to be applied
    // afterwards by discarding bins, so it could narrow the axis but never
    // widen it.
    return processEpiCurveData(
      curveRecords, dateColumn, binSize, stratifyBy || undefined, dateRangeAnnotations,
      curveTimeColumn, { range: manualRange, countColumn: countColumn || undefined }
    );
  }, [curveRecords, dateColumn, binSize, stratifyBy, annotations, exposureWindowDates, curveTimeColumn, manualRange, countColumn]);

  // Calculate exposure window for display (after curveData is available)
  const exposureWindow = useMemo(() => {
    if (!exposureWindowDates || curveData.bins.length === 0) return null;
    return exposureWindowDates;
  }, [exposureWindowDates, curveData.bins]);

  // Every annotation is user-placed now; kept as a named value because the
  // layout and render paths below all read from it.
  const allAnnotations = annotations;

  // What is drawn. The custom date range is part of curveData itself now; the
  // name is kept because the render path below reads from it throughout.
  const displayData = curveData;
  const summary = curveData.summary;

  // Calculate bar width based on optimal sizing, not container width
  const barWidth = getOptimalBarWidth(displayData.bins.length);
  const chartHeight = 300;

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

    const boxes = [];
    for (const annotation of allAnnotations) {
      // A label the user has dragged is where they want it. Auto-stacking only
      // applies to labels that have not been positioned by hand.
      if (annotation.labelOffsetX !== undefined || annotation.labelOffsetY !== undefined) continue;
      // Mirrors AnnotationMarker's placement, including the +4px label inset.
      const span = annotationSpan(annotation, bins);
      if (span === null) continue;
      boxes.push({
        id: annotation.id,
        x: span.start * barW + 4,
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
    setNewAnnotation({ ...EMPTY_ANNOTATION_FORM, date: getDefaultAnnotationDate() });
    setShowAnnotationForm(true);
  };

  const startEditingAnnotation = (annotation: Annotation) => {
    setEditingAnnotationId(annotation.id);
    setAnnotationError('');
    setNewAnnotation({
      type: annotation.type,
      date: formatLocalDate(annotation.date),
      time: annotation.hasTime ? formatLocalTime(annotation.date) : '',
      endDate: annotation.endDate ? formatLocalDate(annotation.endDate) : '',
      endTime: annotation.endDate && annotation.endHasTime ? formatLocalTime(annotation.endDate) : '',
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

  /**
   * The start and end the form describes. A time is optional on both; an end
   * with no time means the whole of that day, and an end time with no end date
   * means later the same day.
   */
  const readAnnotationWhen = (form: typeof EMPTY_ANNOTATION_FORM) => {
    const date = parseLocalDate(form.time ? `${form.date}T${form.time}` : form.date);
    const endDay = form.endDate || (form.endTime ? form.date : '');
    let endDate: Date | undefined;
    if (endDay) {
      endDate = parseLocalDate(form.endTime ? `${endDay}T${form.endTime}` : endDay);
      // Treat a date-only end as inclusive of that whole day
      if (!form.endTime) endDate.setHours(23, 59, 59, 999);
    }
    return { date, hasTime: Boolean(form.time), endDate, endHasTime: Boolean(endDay && form.endTime) };
  };

  const saveAnnotation = () => {
    if (!newAnnotation.date) return;

    const when = readAnnotationWhen(newAnnotation);
    if (isNaN(when.date.getTime())) {
      setAnnotationError('Enter a valid date.');
      return;
    }
    if (when.endDate && !(when.endDate >= when.date)) {
      setAnnotationError('The end must be on or after the start.');
      return;
    }

    const existing = editingAnnotationId ? annotations.find(a => a.id === editingAnnotationId) : undefined;
    const annotation: Annotation = {
      id: editingAnnotationId || crypto.randomUUID(),
      labelOffsetX: existing?.labelOffsetX,
      labelOffsetY: existing?.labelOffsetY,
      type: newAnnotation.type,
      category: getAnnotationCategory(newAnnotation.type),
      date: when.date,
      hasTime: when.hasTime,
      label: newAnnotation.label || getDefaultLabelForType(newAnnotation.type),
      description: newAnnotation.description || undefined,
      color: newAnnotation.color || getAnnotationColor(newAnnotation.type),
      source: 'manual',
      labelFontSize: newAnnotation.labelFontSize,
      labelFontWeight: newAnnotation.labelFontWeight,
      labelFontFamily: newAnnotation.labelFontFamily,
      labelShape: newAnnotation.labelShape,
    };

    if (when.endDate) {
      annotation.endDate = when.endDate;
      annotation.endHasTime = when.endHasTime;
    }

    if (editingAnnotationId) {
      // Update existing annotation
      setAnnotations(annotations.map(a => a.id === editingAnnotationId ? annotation : a));
    } else {
      // Add new annotation
      setAnnotations([...annotations, annotation]);
    }

    setAnnotationError('');
    setNewAnnotation(EMPTY_ANNOTATION_FORM);
    setEditingAnnotationId(null);
    setShowAnnotationForm(false);
  };

  const cancelAnnotationEdit = () => {
    setNewAnnotation(EMPTY_ANNOTATION_FORM);
    setAnnotationError('');
    setEditingAnnotationId(null);
    setShowAnnotationForm(false);
  };

  // Handle click on chart to add annotation
  const handleChartClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // The bars' own box, not the scrolling container around it. A chart
    // narrower than the panel is centred in that container, and measuring from
    // the container's edge put the annotation as many bars to the right as the
    // chart was indented: a click on Jan 11 was saved as Jan 13.
    const plot = chartBodyRef.current?.firstElementChild;
    const bins = displayData.bins;
    if (!plot || bins.length === 0) return;

    const rect = plot.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const position = clickX / barWidth;
    if (position < 0 || position >= bins.length) return;

    const bin = bins[Math.floor(position)];
    const start = bin.startDate.getTime();
    const clicked = new Date(start + (position - Math.floor(position)) * (bin.endDate.getTime() - start));

    // On bars shorter than a day the click has a time of day, rounded to a
    // value someone might have meant: the nearest hour, or quarter hour on
    // hourly bars.
    let time = '';
    if (isSubDailyBinSize(displayData.binSize)) {
      const roundTo = displayData.binSize === 'hourly' ? 15 : 60;
      const minutes = clicked.getHours() * 60 + clicked.getMinutes() + clicked.getSeconds() / 60;
      clicked.setHours(0, Math.round(minutes / roundTo) * roundTo, 0, 0);
      time = formatLocalTime(clicked);
    }

    // Position popup near click
    setClickAddPosition({
      x: clickX,
      y: e.clientY - rect.top,
      date: formatLocalDate(clicked),
      time,
    });
  };

  // Save annotation from click-to-add popup
  const saveClickAnnotation = () => {
    if (!clickAddPosition || !newAnnotation.type) return;

    const when = readAnnotationWhen({ ...newAnnotation, date: clickAddPosition.date, time: clickAddPosition.time });
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: newAnnotation.type,
      category: getAnnotationCategory(newAnnotation.type),
      date: when.date,
      hasTime: when.hasTime,
      label: newAnnotation.label || getDefaultLabelForType(newAnnotation.type),
      description: newAnnotation.description || undefined,
      color: newAnnotation.color || getAnnotationColor(newAnnotation.type),
      source: 'manual',
      labelFontSize: newAnnotation.labelFontSize,
      labelFontWeight: newAnnotation.labelFontWeight,
      labelFontFamily: newAnnotation.labelFontFamily,
      labelShape: newAnnotation.labelShape,
    };

    if (when.endDate && when.endDate >= when.date) {
      annotation.endDate = when.endDate;
      annotation.endHasTime = when.endHasTime;
    }

    setAnnotations([...annotations, annotation]);
    setClickAddPosition(null);
    setNewAnnotation(EMPTY_ANNOTATION_FORM);
  };

  // Cancel click-to-add
  const cancelClickAdd = () => {
    setClickAddPosition(null);
    setNewAnnotation(EMPTY_ANNOTATION_FORM);
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
    const base = niceAxisMax(displayData.maxCount + 1);
    if (annotationBandHeight === 0 || displayData.maxCount === 0) return base;

    const usable = chartHeight - COUNT_LABEL_HEIGHT - annotationBandHeight;
    if (usable <= 0) return base;

    const needed = (displayData.maxCount * chartHeight) / usable;
    return Math.max(base, niceAxisMax(needed));
  }, [displayData.maxCount, annotationBandHeight, chartHeight]);

  // Which x-axis labels are shown (thinned when there are too many bins), keyed
  // by bin index.
  const axisLabels = useMemo(() => {
    const bins = displayData.bins;
    const labels = chooseAxisLabels(bins, displayData.binSize, bins.length > 50 ? 30 : bins.length);
    return new Map(labels.map(l => [l.index, l.text]));
  }, [displayData.bins, displayData.binSize]);

  // Determine if x-axis labels should be rotated based on available space
  // Estimate label width: assume ~7px per character on average for the label text
  const shouldRotateLabels = useMemo(() => {
    if (axisLabels.size === 0) return false;

    const longest = Math.max(...Array.from(axisLabels.values(), text => text.length));
    const estimatedLabelWidth = longest * 7; // ~7px per character

    // If bar width is less than estimated label width + padding, rotate labels
    // Add 10px padding for comfortable spacing
    return barWidth < (estimatedLabelWidth + 10);
  }, [axisLabels, barWidth]);

  // Both formats are made from one drawing of the data, with the same y-axis
  // scale as the screen. PNG was a screenshot of the page until html2canvas
  // stopped being able to read the page's colours; see epiCurveSvg.ts.
  const exportChart = async (format: 'png' | 'svg') => {
    setExportError('');
    const name = chartFilename(chartTitle, 'epidemic_curve');
    let svgContent: string;
    try {
      svgContent = generateEpiCurveSVG({
        data: displayData, yMax: yAxisMax, title: chartTitle, xLabel: xAxisLabel, yLabel: yAxisLabel,
        showGrid: showGridLines, showCounts: showCaseCounts, stratifyBy, colorScheme,
        annotations: allAnnotations, exposureWindow,
      });
    } catch (err) {
      console.error('Chart export failed:', err);
      setExportError('The chart could not be exported. Take a screenshot of it instead, and please report this.');
      return;
    }

    if (format === 'svg') {
      exportChartSVG(svgContent, `${name}.svg`);
      return;
    }

    setIsExporting(true);
    const exported = await exportChartPNG(svgContent, `${name}.png`);
    setIsExporting(false);
    if (!exported) {
      setExportError('The PNG could not be created in this browser. Use Export SVG, or take a screenshot of the chart.');
    }
  };

  // With a filter on, "the dataset" and "what the chart shows" are different
  // files. Export the records behind the chart and say so on the button.
  const filterIsActive = Boolean(filterBy) && selectedFilterValues.size > 0;
  const exportFilteredRecords = () => {
    const csv = exportToCSV(dataset.columns, filteredRecords, { localeConfig });
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `${chartFilename(dataset.name, 'dataset')}_filtered.csv`);
  };

  const peakBin = displayData.peakBinIndex >= 0 ? displayData.bins[displayData.peakBinIndex] : null;
  const axisSpansYears = displayData.bins.length > 0
    && displayData.bins[0].startDate.getFullYear() !== displayData.bins[displayData.bins.length - 1].startDate.getFullYear();
  const dateColumnLabel = dataset.columns.find(c => c.key === dateColumn)?.label ?? dateColumn;
  const timeColumnLabel = dataset.columns.find(c => c.key === timeColumn)?.label ?? timeColumn;
  const chartNote = binSizeNote(displayData.binSize);

  // Space under the axis for labels at 45°, sized to the longest one. A fixed
  // height clipped the longer labels that carry a year.
  const longestAxisLabel = axisLabels.size > 0
    ? Math.max(...Array.from(axisLabels.values(), text => text.length)) * 7
    : 0;
  const rotatedLabelReach = Math.ceil(longestAxisLabel * Math.SQRT1_2) + 24;
  const xLabelHeight = shouldRotateLabels ? Math.max(96, rotatedLabelReach) : 34;

  // What the reader has to be told before trusting the chart.
  const filteredOutCount = dataset.records.length - filteredRecords.length;
  const hiddenNonCases = includeNonCases ? 0 : nonCaseCount;
  const hasExclusions = filteredOutCount + hiddenNonCases + summary.missingDate + summary.unrecognisedDate
    + summary.missingTime + summary.unrecognisedTime + summary.outsideRange + summary.missingCount > 0;
  const countColumnLabel = numericColumns.find(c => c.key === countColumn)?.label ?? countColumn;
  const example = (examples: string[]) => examples.length > 0 ? ` (e.g. "${examples[0]}")` : '';
  const binName = BIN_SIZE_NAMES[displayData.binSize];
  const requestedBinName = BIN_SIZE_NAMES[displayData.requestedBinSize];

  const chartWarnings: { key: string; text: string }[] = [];
  if (displayData.tooManyBins) {
    chartWarnings.push({
      key: 'too-many',
      text: 'These dates span too long a period to draw, even as weekly bars. Correct or filter out the dates that do not belong, or set a custom date range under Advanced Options.',
    });
  } else if (displayData.binSize !== displayData.requestedBinSize) {
    chartWarnings.push({
      key: 'coarsened',
      text: `${requestedBinName.charAt(0).toUpperCase()}${requestedBinName.slice(1)} bins would need ${displayData.requestedBinCount.toLocaleString('en-US')} bars for these dates, so ${binName} bins are shown instead. To look at a shorter period, set a custom date range under Advanced Options.`,
    });
  }
  if (summary.unrecognisedDate > 0 && summary.plotted > 0) {
    chartWarnings.push({
      key: 'unread-dates',
      text: `${plural(summary.unrecognisedDate, 'record')} ${summary.unrecognisedDate === 1 ? 'is' : 'are'} missing from this chart because the value in ${dateColumnLabel} could not be read as a date${example(summary.unrecognisedDateExamples)}. Dates are read as YYYY-MM-DD or with the month spelled out; re-import the file and confirm its date format to convert them.`,
    });
  }
  if (summary.outlierCount > 0) {
    chartWarnings.push({
      key: 'outliers',
      text: `${plural(summary.outlierCount, 'record')} ${summary.outlierCount === 1 ? 'is' : 'are'} dated far from the rest (${summary.outlierExamples.join(', ')}). Check for a mistyped year.`,
    });
  }
  if (isSubDailyBinSize(displayData.binSize) && !hasUsableTimes && summary.plotted > 0) {
    chartWarnings.push({
      key: 'no-times',
      text: 'No times of day were found, so every bar with cases sits at 0:00. Daily bins show dates-only data better.',
    });
  }

  // Why there is nothing to draw, when there is not.
  let emptyMessage = 'No valid date data found in the selected column';
  if (displayData.tooManyBins) {
    emptyMessage = 'Nothing is drawn. See the note above.';
  } else if (curveRecords.length === 0) {
    emptyMessage = 'No records to plot with the current filter.';
  } else if (summary.outsideRange > 0) {
    emptyMessage = 'No records fall inside the custom date range.';
  } else if (summary.missingTime + summary.unrecognisedTime > 0) {
    emptyMessage = `No record has a usable time in ${timeColumnLabel}, which ${binName} bins need. Choose Daily bins, or set Time Column to None.`;
  } else if (summary.unrecognisedDate > 0) {
    emptyMessage = `The values in ${dateColumnLabel} could not be read as dates${example(summary.unrecognisedDateExamples)}. Dates are read as YYYY-MM-DD or with the month spelled out; re-import the file and confirm its date format to convert them.`;
  }

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

          {/* Summary: what the bars hold, and what was left out and why */}
          <div className="text-sm text-gray-600 pb-3 border-b border-gray-200">
            <div>
              <span className="font-medium">{formatLocaleNumber(summary.plotted, localeConfig, 0)} {recordNoun}{summary.plotted === 1 ? '' : 's'}</span> plotted
              {countColumn && <span> from {plural(summary.plottedRecords, 'record')}</span>}
              {peakBin && (
                <span className="text-gray-400"> · Peak: {displayData.maxCount} ({axisSpansYears ? fullBinLabel(peakBin, displayData.binSize) : peakBin.label})</span>
              )}
            </div>
            {summary.firstOnset && summary.lastOnset && (
              <div className="text-xs text-gray-500 mt-1">
                {dateColumnLabel}: first {formatWhen(summary.firstOnset, summary.onsetHasTime, true)}, last {formatWhen(summary.lastOnset, summary.onsetHasTime, true)}
              </div>
            )}
            {hasExclusions && (
              <div className="text-xs text-gray-500 mt-2">
                <div className="font-medium text-gray-600">Not shown</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {filteredOutCount > 0 && (
                    <li>{plural(filteredOutCount, 'record')} removed by the filter</li>
                  )}
                  {hiddenNonCases > 0 && caseColumn && (
                    <li>
                      {plural(hiddenNonCases, 'record')} marked as not a case in {caseColumn.label}{' '}
                      <button
                        onClick={() => setIncludeNonCases(true)}
                        className="text-gray-600 hover:text-gray-900 underline"
                      >
                        include
                      </button>
                    </li>
                  )}
                  {summary.missingCount > 0 && (
                    <li>
                      {plural(summary.missingCount, 'record')} with no whole number of cases in {countColumnLabel}{example(summary.missingCountExamples)}
                    </li>
                  )}
                  {summary.missingDate > 0 && (
                    <li>{plural(summary.missingDate, rowNoun)} with nothing in {dateColumnLabel}</li>
                  )}
                  {summary.unrecognisedDate > 0 && (
                    <li>
                      {plural(summary.unrecognisedDate, rowNoun)} with a value in {dateColumnLabel} that could not be read as a date{example(summary.unrecognisedDateExamples)}
                    </li>
                  )}
                  {summary.missingTime > 0 && (
                    <li>{plural(summary.missingTime, rowNoun)} with nothing in {timeColumnLabel}, which {binName} bins need</li>
                  )}
                  {summary.unrecognisedTime > 0 && (
                    <li>
                      {plural(summary.unrecognisedTime, rowNoun)} with a value in {timeColumnLabel} that could not be read as a time{example(summary.unrecognisedTimeExamples)}
                    </li>
                  )}
                  {summary.outsideRange > 0 && (
                    <li>{plural(summary.outsideRange, rowNoun)} outside the custom date range</li>
                  )}
                </ul>
              </div>
            )}
            {includeNonCases && nonCaseCount > 0 && caseColumn && (
              <div className="text-xs text-gray-500 mt-2">
                Includes {plural(nonCaseCount, 'record')} marked as not a case in {caseColumn.label}{' '}
                <button
                  onClick={() => setIncludeNonCases(false)}
                  className="text-gray-600 hover:text-gray-900 underline"
                >
                  leave out
                </button>
              </div>
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
                    const count = countInCategory(dataset.records, filterBy, value);
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

          {/* What a record stands for: one case, or a count of them */}
          {numericColumns.length > 0 && (
            <div>
              <label htmlFor="epi-curve-count-column" className="block text-sm font-medium text-gray-700 mb-1">Each Record Is</label>
              <select
                id="epi-curve-count-column"
                value={countColumn}
                onChange={(e) => setCountColumnChoice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">One case</option>
                {numericColumns.map(col => (
                  <option key={col.key} value={col.key}>A count, in {col.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {countColumn
                  ? `Bars add up ${countColumnLabel}. Use this for aggregated data, such as one row per district and month.`
                  : 'For aggregated data, such as one row per district and month, choose the column that holds the number of cases.'}
              </p>
            </div>
          )}

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
              <option value="monthly">Monthly</option>
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
                  <label className="block text-xs text-gray-500 mb-1">Time (optional)</label>
                  <input
                    type="time"
                    value={newAnnotation.time}
                    onChange={(e) => setNewAnnotation({ ...newAnnotation, time: e.target.value })}
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
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End Date (optional)</label>
                      <input
                        type="date"
                        value={newAnnotation.endDate}
                        onChange={(e) => setNewAnnotation({ ...newAnnotation, endDate: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End Time (optional)</label>
                      <input
                        type="time"
                        value={newAnnotation.endTime}
                        onChange={(e) => setNewAnnotation({ ...newAnnotation, endTime: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                  </>
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
                        {formatWhen(ann.date, ann.hasTime === true)}
                        {ann.endDate && ` – ${formatWhen(ann.endDate, ann.endHasTime === true)}`}
                        {displayData.bins.length > 0 && annotationSpan(ann, displayData.bins) === null && ' · outside the dates shown'}
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
                        {pathogen} ({formatIncubationRange(PATHOGEN_INCUBATION[pathogen])})
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
                          {formatWhen(exposureWindow.start, !exposureWindow.wholeDays, true)}
                          {' '}&ndash;{' '}
                          {formatWhen(exposureWindow.end, !exposureWindow.wholeDays, true)}
                        </p>
                        <p className="text-xs text-red-400 mt-1">
                          Based on {selectedPathogen} incubation ({formatIncubationRange(exposureWindow.incubation)})
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
                      // The extent of the data itself, not of the range now drawn.
                      const fitted = processEpiCurveData(
                        curveRecords, dateColumn, binSize, undefined, annotations, curveTimeColumn,
                        { countColumn: countColumn || undefined }
                      );
                      if (fitted.bins.length > 0) {
                        setManualStartDate(formatLocalDate(fitted.dateRange.start));
                        setManualEndDate(formatLocalDate(fitted.dateRange.end));
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
        {/* Things the reader should know before trusting the chart */}
        {chartWarnings.length > 0 && (
          <div className="mb-4 space-y-2">
            {chartWarnings.map(warning => (
              <div
                key={warning.key}
                role="status"
                className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900"
              >
                {warning.text}
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {displayData.bins.length > 0 && summary.plotted > 0 ? (
          <div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
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

              {/* Chart Area. The axis and the bars are centred together; the
                  axis values used to stay at the far left of the card while a
                  short chart was centred, a hand's width away from its bars. */}
              <div className="flex justify-center">
                {/* Y-Axis Label */}
                <div className="flex items-center justify-center w-8" style={{ height: chartHeight }}>
                  <span className="text-sm font-bold text-gray-500 transform -rotate-90 whitespace-nowrap">
                    {yAxisLabel}
                  </span>
                </div>

                {/* Y-Axis. Each value is centred on its own gridline. They used
                    to be spread evenly down the column as text, which put 0 ten
                    pixels above the baseline and the top value ten below the top. */}
                <div
                  className="relative flex-shrink-0 text-sm"
                  style={{ height: chartHeight, width: `calc(${String(yAxisMax).length}ch + 0.75rem)` }}
                >
                  {[...Array(6)].map((_, i) => {
                    const value = Math.round((yAxisMax * (5 - i)) / 5);
                    return (
                      <span
                        key={i}
                        className="absolute right-2 text-sm leading-5 text-gray-500"
                        style={{ top: (i / 5) * chartHeight - 10 }}
                      >
                        {value}
                      </span>
                    );
                  })}
                </div>

                {/* Chart Body */}
                <div
                  ref={chartBodyRef}
                  // Takes the width of the bars, and scrolls from its left
                  // edge once a many-bin curve is wider than the card.
                  className="min-w-0 overflow-x-auto cursor-crosshair"
                  onClick={handleChartClick}
                  title="Click to add an annotation at this date"
                >
                  <div
                    className="relative"
                    style={{
                      width: displayData.bins.length * barWidth,
                      marginRight: shouldRotateLabels ? Math.max(60, rotatedLabelReach - 24) : 0,
                    }}
                  >
                    {/* Grid lines, one at each y-axis value. They used to be
                        spread over this whole box, x-axis labels included, so
                        none of them sat at the value printed beside it and two
                        ran through the dates. The line at 0 is the axis below. */}
                    {showGridLines && [...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-gray-100 pointer-events-none"
                        style={{ top: (i / 5) * chartHeight }}
                      />
                    ))}

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

                    {/* Bars. An epidemic curve is a histogram, so neighbouring
                        bars touch; a 1px white edge keeps equal bars apart
                        without reading as a gap. */}
                    <div className="flex items-end" style={{ height: chartHeight }}>
                      {displayData.bins.map((bin, binIndex) => (
                        <div
                          key={binIndex}
                          className="flex flex-col justify-end relative"
                          style={{ width: barWidth }}
                        >
                          {stratifyBy && displayData.strataKeys.length > 0 ? (
                            // Stacked bars
                            <div className="flex flex-col-reverse border-l border-white">
                              {displayData.strataKeys.map((strataKey, strataIndex) => {
                                const count = bin.strataTotals.get(strataKey) ?? 0;
                                if (count === 0) return null;
                                const height = (count / yAxisMax) * chartHeight;
                                return (
                                  <div
                                    key={strataKey}
                                    className="hover:opacity-80 transition-opacity"
                                    style={{
                                      height,
                                      backgroundColor: getColorForStrata(strataKey, strataIndex, colorScheme),
                                    }}
                                    title={`${fullBinLabel(bin, displayData.binSize)}: ${strataKey} (${count})`}
                                  />
                                );
                              })}
                            </div>
                          ) : (
                            // Single bar
                            <div
                              className="bg-blue-500 hover:bg-blue-600 transition-colors border-l border-white"
                              style={{
                                height: (bin.total / yAxisMax) * chartHeight,
                              }}
                              title={`${fullBinLabel(bin, displayData.binSize)}: ${plural(bin.total, recordNoun)}`}
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
                      {displayData.bins.map((_, index) => (
                        <div
                          key={index}
                          className="relative"
                          style={{ width: barWidth, height: xLabelHeight }}
                        >
                          {axisLabels.has(index) && (
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
                              {axisLabels.get(index)}
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
                          left: Math.max(0, Math.min(clickAddPosition.x, displayData.bins.length * barWidth - 270)),
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
                          {/* Read back from the same local date that is saved.
                              new Date('2026-01-13') is UTC, and showed Jan 12
                              anywhere west of Greenwich. */}
                          Date: {formatWhen(
                            parseLocalDate(clickAddPosition.time ? `${clickAddPosition.date}T${clickAddPosition.time}` : clickAddPosition.date),
                            clickAddPosition.time !== '',
                            true
                          )}
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

              {/* X-Axis Label, and what the bars are where the labels cannot say */}
              <div className="text-center mt-2">
                <span className="text-sm font-bold text-gray-500">{xAxisLabel}</span>
                {chartNote && (
                  <p className="text-xs text-gray-500 mt-1">{chartNote}</p>
                )}
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
                    The shaded <span className="font-medium text-red-600">red region</span> is the period in which the <strong>first case</strong> could have been exposed: its onset, less the longest and the shortest incubation period for the pathogen selected.
                  </p>
                  <div className="bg-white p-3 rounded border border-blue-100">
                    <p className="font-medium mb-1">How it is calculated:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>
                        <strong>First onset:</strong> {formatWhen(exposureWindow.firstCaseDate, exposureWindow.onsetHasTime, true)}
                        {!exposureWindow.onsetHasTime && ' (date only)'}
                      </li>
                      <li>
                        <strong>Selected pathogen:</strong> {exposureWindow.pathogen}
                      </li>
                      <li>
                        <strong>Incubation period:</strong> {formatIncubationRange(exposureWindow.incubation)}
                      </li>
                      <li>
                        <strong>Earliest exposure:</strong> first onset − {incubationText(exposureWindow.incubation.max, exposureWindow.wholeDays, Math.ceil)} = {formatWhen(exposureWindow.start, !exposureWindow.wholeDays, true)}
                      </li>
                      <li>
                        <strong>Latest exposure:</strong> first onset − {incubationText(exposureWindow.incubation.min, exposureWindow.wholeDays, Math.floor)} = {formatWhen(exposureWindow.end, !exposureWindow.wholeDays, true)}
                      </li>
                    </ul>
                    {exposureWindow.wholeDays && (
                      <p className="text-xs mt-2">
                        Working from the onset date alone, the limits are whole days: the longest incubation period is rounded up and the shortest down, and the window runs to the end of the last day, so it holds for an onset at any hour of that date. On hourly, 6-hour or 12-hour bins with a Time Column, the onset time is used and the limits are in hours.
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-blue-700 mt-2">
                    <strong>Note for epidemiologists:</strong> This is the range consistent with the first case alone, and it assumes a point-source outbreak in which every case was exposed at about the same time. It is not the method in CDC&rsquo;s <em>Principles of Epidemiology</em>, which counts back the minimum incubation period from the first case and the average incubation period from the peak of the curve, and expects the two dates to be close; this window will usually be wider. Neither applies to a continuing common source or to person-to-person spread. The incubation periods listed are typical published ranges, so check them against a current reference for your pathogen.
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    <strong>Further reading:</strong> CDC. Principles of Epidemiology in Public Health Practice, Third Edition, Lesson 6 (Investigating an Outbreak).
                    Available at: <a href="https://archive.cdc.gov/www_cdc_gov/csels/dsepd/ss1978/lesson6/section2.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-800 break-all">https://archive.cdc.gov/www_cdc_gov/csels/dsepd/ss1978/lesson6/section2.html</a>
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
                ...(filterIsActive ? [{
                  label: `Export Filtered CSV (${plural(filteredRecords.length, 'record')})`,
                  onClick: exportFilteredRecords,
                  icon: ExportIcons.csv,
                  variant: 'secondary' as const,
                }] : []),
                ...(onExportDataset ? [{
                  label: filterIsActive ? 'Export Full Dataset CSV' : 'Export Dataset CSV',
                  onClick: onExportDataset,
                  icon: ExportIcons.csv,
                  variant: 'secondary' as const,
                }] : []),
              ]}
            />
            {exportError && (
              <p role="alert" className="mt-2 text-sm text-red-600">{exportError}</p>
            )}
          </div>
        ) : dateColumn ? (
          <div className="text-center py-12 text-gray-500 text-sm max-w-xl mx-auto">
            {emptyMessage}
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

/** An incubation limit as the chart's arithmetic uses it: whole days, or hours when there is an onset time. */
function incubationText(days: number, wholeDays: boolean, round: (value: number) => number): string {
  if (wholeDays) return plural(round(days), 'day');
  return days < 1 ? plural(incubationHours(days), 'hour') : plural(days, 'day');
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
  // Where it falls along the bars, or nothing when it is outside the dates
  // shown. It used to be drawn on the nearest edge, where an event a week
  // after the axis ended read as having happened on the last day.
  const span = annotationSpan(annotation, bins);
  if (!span) return null;

  const x = span.start * barWidth;

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
    // Wide enough to see, however short the period is against the bar size.
    const width = Math.max((span.end - span.start) * barWidth, 2);

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
        {/* Dashed border lines, left off an end that runs past the axis */}
        {!span.clippedStart && (
          <div
            className="absolute top-0 bottom-0 left-0"
            style={{
              borderLeft: `1px dashed ${annotation.color}`,
            }}
          />
        )}
        {!span.clippedEnd && (
          <div
            className="absolute top-0 bottom-0 right-0"
            style={{
              borderRight: `1px dashed ${annotation.color}`,
            }}
          />
        )}
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
    wholeDays: boolean;
  };
  bins: EpiCurveData['bins'];
  barWidth: number;
  chartHeight: number;
}) {
  // The part of the window that is on the axis; nothing when none of it is.
  const span = spanInBins(bins, exposureWindow.start.getTime(), exposureWindow.end.getTime());
  if (!span) return null;

  const startX = span.start * barWidth;
  const width = Math.max((span.end - span.start) * barWidth, 2);

  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{
        left: startX,
        width,
        height: chartHeight,
      }}
      title={`Estimated exposure: ${formatWhen(exposureWindow.start, !exposureWindow.wholeDays)} - ${formatWhen(exposureWindow.end, !exposureWindow.wholeDays)}`}
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
      {!span.clippedStart && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-400"
          style={{ left: 0 }}
        />
      )}

      {/* Right edge line */}
      {!span.clippedEnd && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-400"
          style={{ right: 0 }}
        />
      )}

      {/* Label at top */}
      <div
        className="absolute top-1 left-1 px-1.5 py-0.5 text-xs font-medium text-red-700 bg-red-100 rounded shadow-sm whitespace-nowrap"
        style={{ maxWidth: Math.max(width - 8, 0), overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        Est. Exposure
      </div>
    </div>
  );
}
