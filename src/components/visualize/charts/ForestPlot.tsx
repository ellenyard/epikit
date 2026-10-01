import { useState, useMemo, useEffect } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { calculateTwoByTwo } from '../../../utils/statistics';
import type { TwoByTwoResults } from '../../../utils/statistics';
import { getChartColors, type ChartColorScheme } from '../../../utils/chartColors';
import { filterByCategoryValues } from '../../../utils/recordFilter';
import { formatSigFigs } from '../../../utils/localeNumbers';
import {
  caseKeySet,
  collectLevels,
  levelKey,
  outcomeCandidateColumns,
  resolveExposureSetup,
  suggestOutcome,
  tabulateTwoByTwo,
} from '../../../utils/twoByTwoSetup';
import type { ExposureSetup } from '../../../utils/twoByTwoSetup';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgAxisLine,
  svgGridLine,
  type ExcelExportData,
} from '../../../utils/chartExport';

interface ForestRow {
  label: string;
  estimate: number;
  lower: number;
  upper: number;
  weight: number;
  isPooled: boolean;
  /** True when the 2×2 table had a zero cell and the odds ratio used a continuity correction */
  zeroCell?: boolean;
  /**
   * Set when the measure cannot be estimated for this row. The row is still
   * drawn, with this text in place of a marker: dropping it removed exactly
   * the exposures an investigator most needs to see, such as the food nobody
   * in the unexposed group fell ill after.
   */
  note?: string;
}

type DataMode = 'manual' | 'calculate';
type MeasureType = 'oddsRatio' | 'riskRatio' | 'riskDifference';

/** The settings this chart shares with the 2×2 analysis, as saved for one dataset. */
interface SharedSettings {
  outcomeVar: string;
  caseValues: string[];
  selectedExposures: string[];
  exposurePositiveValues: Record<string, string>;
  exposureReferenceValues: Record<string, string>;
  filterBy: string;
  selectedFilterValues: string[];
}

function loadSharedSettings(dataset: Dataset): SharedSettings {
  let saved: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(`epikit_twobytwo_${dataset.id}`);
    saved = raw ? JSON.parse(raw) : {};
  } catch {
    saved = {};
  }

  let outcomeVar = (saved.outcomeVar as string) || '';
  let caseValues = Array.isArray(saved.caseValues) ? saved.caseValues as string[] : [];
  // Nothing saved: pre-select an outcome only when the data make it clear
  if (!outcomeVar) {
    const found = suggestOutcome(dataset.columns, dataset.records);
    if (found) {
      outcomeVar = found.key;
      caseValues = found.caseValues;
    }
  }

  return {
    outcomeVar,
    caseValues,
    selectedExposures: Array.isArray(saved.selectedExposures) ? saved.selectedExposures as string[] : [],
    exposurePositiveValues: (saved.exposurePositiveValues as Record<string, string>) || {},
    exposureReferenceValues: (saved.exposureReferenceValues as Record<string, string>) || {},
    filterBy: (saved.filterBy as string) ?? '',
    selectedFilterValues: Array.isArray(saved.selectedFilterValues) ? saved.selectedFilterValues as string[] : [],
  };
}

/** Why a measure cannot be plotted for a table, or null when it can. */
function notEstimableReason(measure: MeasureType, r: TwoByTwoResults): string | null {
  const { a, c } = r.table;
  if (r.totalExposed === 0) return 'Not estimable: no one in the exposed group';
  if (r.totalUnexposed === 0) return 'Not estimable: no one in the comparison group';
  if (measure === 'riskDifference') return null;
  if (r.totalDisease === 0) return 'Not estimable: no cases in either group';
  if (measure === 'oddsRatio') {
    return r.totalNoDisease === 0 ? 'Not estimable: no non-cases in either group' : null;
  }
  if (c === 0) return `Not estimable: 0 of ${r.totalUnexposed} ill in the comparison group`;
  if (a === 0) return `RR = 0 (0 of ${r.totalExposed} exposed ill); no confidence interval`;
  return null;
}

export function ForestPlot({ dataset }: { dataset: Dataset }) {
  // --- Load saved 2×2 analysis settings so forest plot matches ---
  const [initial] = useState<SharedSettings>(() => loadSharedSettings(dataset));

  // --- Data mode toggle ---
  const [dataMode, setDataMode] = useState<DataMode>('calculate');

  // --- Manual mode state (pre-computed columns) ---
  const [labelCol, setLabelCol] = useState('');
  const [estimateCol, setEstimateCol] = useState('');
  const [lowerCICol, setLowerCICol] = useState('');
  const [upperCICol, setUpperCICol] = useState('');
  const [weightCol, setWeightCol] = useState('');

  // --- Calculate mode state (initialized from 2×2 analysis if available) ---
  const [outcomeVar, setOutcomeVar] = useState<string>(initial.outcomeVar);
  const [caseValues, setCaseValues] = useState<Set<string>>(() => new Set(initial.caseValues));
  const [selectedExposures, setSelectedExposures] = useState<string[]>(initial.selectedExposures);
  const [exposurePositiveValues, setExposurePositiveValues] = useState<Record<string, string>>(initial.exposurePositiveValues);
  const [exposureReferenceValues, setExposureReferenceValues] = useState<Record<string, string>>(initial.exposureReferenceValues);
  // The 2×2 tab's record filter. Read here, changed there: applying it keeps
  // the two tabs on the same records.
  const [filterBy, setFilterBy] = useState<string>(initial.filterBy);
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(() => new Set(initial.selectedFilterValues));
  const [measureType, setMeasureType] = useState<MeasureType>('oddsRatio');
  // Custom labels for forest plot rows (keyed by exposure variable key)
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});

  // --- Shared state ---
  const [effectMeasure, setEffectMeasure] = useState<'ratio' | 'difference'>('ratio');
  const [showNullLine, setShowNullLine] = useState(true);
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  const [title, setTitle] = useState('Forest Plot');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // This component is not remounted when the dataset changes, so its state
  // has to be reloaded for the new dataset. Without this the sync below wrote
  // the previous dataset's outcome and exposures into the new dataset's saved
  // 2×2 setup. Done while rendering, so no effect ever sees one dataset's
  // state alongside another dataset's id.
  const [loadedDatasetId, setLoadedDatasetId] = useState(dataset.id);
  if (loadedDatasetId !== dataset.id) {
    const next = loadSharedSettings(dataset);
    setLoadedDatasetId(dataset.id);
    setOutcomeVar(next.outcomeVar);
    setCaseValues(new Set(next.caseValues));
    setSelectedExposures(next.selectedExposures);
    setExposurePositiveValues(next.exposurePositiveValues);
    setExposureReferenceValues(next.exposureReferenceValues);
    setFilterBy(next.filterBy);
    setSelectedFilterValues(new Set(next.selectedFilterValues));
    setCustomLabels({});
    setLabelCol('');
    setEstimateCol('');
    setLowerCICol('');
    setUpperCICol('');
    setWeightCol('');
  }

  // In calculate mode the scale follows the measure; in manual mode the user sets it
  const scaleType: 'ratio' | 'difference' = dataMode === 'calculate'
    ? (measureType === 'riskDifference' ? 'difference' : 'ratio')
    : effectMeasure;

  // --- Calculate mode helpers ---

  // Get columns suitable for case definition
  const caseDefinitionColumns = useMemo(
    () => outcomeCandidateColumns(dataset.columns, dataset.records),
    [dataset]
  );

  // Distinct values of the selected outcome variable
  const outcomeLevels = useMemo(() => {
    if (!outcomeVar) return [];
    return collectLevels(dataset.records, outcomeVar);
  }, [dataset.records, outcomeVar]);

  const caseKeys = useMemo(() => caseKeySet(caseValues), [caseValues]);

  // Get columns suitable for exposure variables
  const exposureColumns = useMemo(() => {
    return dataset.columns.filter(col => {
      if (col.type === 'date') return false;
      if (col.key === 'id' || col.key === 'case_id' || col.key === 'participant_id') return false;
      if (col.key.includes('latitude') || col.key.includes('longitude')) return false;
      if (col.key === outcomeVar) return false;
      const uniqueValues = new Set(dataset.records.map(r => r[col.key])).size;
      return uniqueValues >= 2 && uniqueValues <= 20;
    });
  }, [dataset, outcomeVar]);

  // Sync forest plot settings back to the shared 2×2 persistence key
  // so both tabs always use the same case definition and exposures
  useEffect(() => {
    if (dataMode !== 'calculate') return;
    if (!outcomeVar) return;
    try {
      const persistenceKey = `epikit_twobytwo_${dataset.id}`;
      // Read existing saved state to preserve fields we don't manage (studyDesign, filterBy, etc.)
      const existing = (() => {
        try {
          const raw = localStorage.getItem(persistenceKey);
          return raw ? JSON.parse(raw) : {};
        } catch {
          return {};
        }
      })();
      const toSave = {
        ...existing,
        outcomeVar,
        caseValues: Array.from(caseValues),
        selectedExposures,
        exposurePositiveValues,
        exposureReferenceValues,
      };
      localStorage.setItem(persistenceKey, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to sync forest plot settings:', e);
    }
  }, [dataMode, dataset.id, outcomeVar, caseValues, selectedExposures, exposurePositiveValues, exposureReferenceValues]);

  // For every candidate exposure: its levels, the exposed level and the
  // comparison level, by the same rules as the 2×2 analysis
  const exposureSetups = useMemo(() => {
    const setups = new Map<string, ExposureSetup>();
    for (const col of exposureColumns) {
      setups.set(
        col.key,
        resolveExposureSetup(
          dataset.records,
          col.key,
          exposurePositiveValues[col.key],
          exposureReferenceValues[col.key]
        )
      );
    }
    return setups;
  }, [dataset.records, exposureColumns, exposurePositiveValues, exposureReferenceValues]);

  // The records the 2×2 tab is analysing
  const filteredRecords = useMemo(
    () => filterByCategoryValues(dataset.records, filterBy, selectedFilterValues),
    [dataset.records, filterBy, selectedFilterValues]
  );
  const filterDescription = useMemo(() => {
    if (!filterBy || selectedFilterValues.size === 0) return '';
    const col = dataset.columns.find(c => c.key === filterBy);
    return `${col?.label || filterBy} = ${Array.from(selectedFilterValues).join(', ')}`;
  }, [dataset.columns, filterBy, selectedFilterValues]);

  // --- Calculate forest data from 2x2 analysis ---
  const calculated = useMemo((): { rows: ForestRow[]; needsChoice: string[] } => {
    const rows: ForestRow[] = [];
    const needsChoice: string[] = [];
    if (dataMode !== 'calculate') return { rows, needsChoice };
    if (!outcomeVar || caseKeys.size === 0 || selectedExposures.length === 0) return { rows, needsChoice };

    for (const expVar of selectedExposures) {
      const col = dataset.columns.find(c => c.key === expVar);
      const colLabel = col ? col.label : expVar;
      const setup = exposureSetups.get(expVar);
      if (!setup) continue;
      // Nothing is drawn until both groups are known: a guessed "exposed"
      // value gives a clean, inverted estimate rather than an obvious error.
      if (!setup.exposed || !setup.reference) {
        needsChoice.push(colLabel);
        continue;
      }

      // Same table as the 2×2 tab: missing exposure or outcome left out, and
      // the exposed compared with the named comparison group only.
      const counts = tabulateTwoByTwo(
        filteredRecords,
        expVar,
        setup.exposed.key,
        setup.reference.key,
        outcomeVar,
        caseKeys
      );
      const results = calculateTwoByTwo(counts.table);

      let estimate: number;
      let lower: number;
      let upper: number;

      if (measureType === 'oddsRatio') {
        estimate = results.oddsRatio;
        [lower, upper] = results.oddsRatioCI;
      } else if (measureType === 'riskRatio') {
        estimate = results.riskRatio;
        [lower, upper] = results.riskRatioCI;
      } else {
        estimate = results.riskDifference;
        [lower, upper] = results.riskDifferenceCI;
      }

      // Use custom label if set, otherwise show comparison
      const label = customLabels[expVar]
        || `${colLabel} (${setup.exposed.label} vs. ${setup.reference.label})`;

      const usable = isFinite(estimate) && isFinite(lower) && isFinite(upper)
        && (measureType === 'riskDifference' || (estimate > 0 && lower > 0 && upper > 0));
      const reason = notEstimableReason(measureType, results) ?? (usable ? null : 'Not estimable');
      if (reason) {
        rows.push({
          label,
          estimate: NaN,
          lower: NaN,
          upper: NaN,
          weight: results.total,
          isPooled: false,
          note: reason,
        });
        continue;
      }

      rows.push({
        label,
        estimate,
        lower: Math.min(lower, upper),
        upper: Math.max(lower, upper),
        weight: results.total, // weight by total sample size
        isPooled: false,
        // Only the odds ratio is corrected for a zero cell; the risk ratio and
        // risk difference are plotted as calculated
        zeroCell: measureType === 'oddsRatio' && results.oddsRatioCorrected,
      });
    }

    return { rows, needsChoice };
  }, [dataMode, dataset.columns, filteredRecords, outcomeVar, caseKeys, selectedExposures, exposureSetups, customLabels, measureType]);


  // --- Manual mode: process data from columns ---
  const manualForestData = useMemo((): ForestRow[] => {
    if (dataMode !== 'manual') return [];
    if (!labelCol || !estimateCol || !lowerCICol || !upperCICol) return [];

    const rows: ForestRow[] = [];

    for (const record of dataset.records) {
      const label = record[labelCol];
      const rawEst = record[estimateCol];
      const rawLo = record[lowerCICol];
      const rawHi = record[upperCICol];
      const est = Number(rawEst);
      const lo = Number(rawLo);
      const hi = Number(rawHi);
      const wt = weightCol ? Number(record[weightCol]) : 1;

      if (label == null || label === '') continue;
      if (rawEst == null || rawEst === '' || rawLo == null || rawLo === '' || rawHi == null || rawHi === '') continue;
      if (isNaN(est) || isNaN(lo) || isNaN(hi)) continue;
      if (effectMeasure === 'ratio' && (est <= 0 || lo <= 0 || hi <= 0)) continue;

      const isPooled = /\b(overall|pooled|summary|total)\b/i.test(String(label));

      rows.push({
        label: String(label),
        estimate: est,
        lower: Math.min(lo, hi),
        upper: Math.max(lo, hi),
        weight: isNaN(wt) || wt <= 0 ? 1 : wt,
        isPooled,
      });
    }

    const nonPooled = rows.filter(r => !r.isPooled);
    const pooled = rows.filter(r => r.isPooled);
    return [...nonPooled, ...pooled];
  }, [dataMode, dataset.records, labelCol, estimateCol, lowerCICol, upperCICol, weightCol, effectMeasure]);


  // Combined forest data
  const forestData = dataMode === 'calculate' ? calculated.rows : manualForestData;

  // Generate SVG
  const svgContent = useMemo(() => {
    if (forestData.length === 0) return '';

    const useLog = scaleType === 'ratio';
    const toScale = (v: number) => useLog ? Math.log(v) : v;
    const nullValue = useLog ? 0 : 0; // log(1)=0 for ratio, 0 for difference

    const plotted = forestData.filter(r => !r.note);

    // Notes under the axis. Each gets its own line, above the source, so the
    // two can no longer be drawn on top of each other.
    const notes: string[] = [];
    if (forestData.some(r => r.zeroCell)) {
      notes.push('† Zero cell in the 2×2 table: OR and CI add 0.5 to every cell (continuity correction)');
    }
    if (dataMode === 'calculate' && filterDescription) {
      notes.push(`Records restricted to ${filterDescription}`);
    }

    // Row labels are right-aligned against the plot, so the left margin has
    // to be wide enough for the longest one or its start is cut off.
    const maxLabelChars = 48;
    const shownLabel = (row: ForestRow) =>
      (row.label.length > maxLabelChars ? row.label.slice(0, maxLabelChars - 1) + '\u2026' : row.label)
      + (row.zeroCell ? ' †' : '');
    const longestLabel = Math.max(...forestData.map(r => shownLabel(r).length));

    const dims = getDefaultDimensions('forest');
    const rowHeight = 30;
    const minPlotHeight = forestData.length * rowHeight;
    const width = dims.width;
    const margin = {
      ...dims.margin,
      left: Math.min(330, Math.max(120, Math.round(longestLabel * 6.3) + 20)),
      right: showLabels ? 180 : 60,
      bottom: dims.margin.bottom + notes.length * 14 + (source ? 16 : 0),
    };
    const height = Math.max(dims.height, minPlotHeight + margin.top + margin.bottom);
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Compute scale range from all CI bounds
    const allScaled = plotted.flatMap(r => [toScale(r.lower), toScale(r.estimate), toScale(r.upper)]);
    let minVal = Math.min(...allScaled, nullValue);
    let maxVal = Math.max(...allScaled, nullValue);
    if (plotted.length === 0) {
      // Nothing estimable: draw an empty axis so the rows can still say why
      minVal = useLog ? Math.log(0.1) : -1;
      maxVal = useLog ? Math.log(10) : 1;
    }
    const range = maxVal - minVal || 1;
    minVal -= range * 0.1;
    maxVal += range * 0.1;
    const valRange = maxVal - minVal;

    const xScale = (scaled: number) => margin.left + ((scaled - minVal) / valRange) * plotW;
    const yScale = (i: number) => margin.top + (i + 0.5) * (plotH / forestData.length);

    const maxWeight = Math.max(...forestData.map(r => r.weight));
    const colors = getChartColors(2, colorScheme);

    let svg = '';

    // Title
    if (title) {
      svg += svgTitle(width, title, subtitle || undefined);
    }

    // Vertical gridlines with clean tick values
    if (useLog) {
      // For log scale, use standard round values on the original scale
      const candidateTicks = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
      const ticks = candidateTicks.filter(t => {
        const s = toScale(t);
        return s >= minVal && s <= maxVal;
      });
      // Always include 1.0 (null line) if in range
      if (!ticks.includes(1)) {
        const s = toScale(1);
        if (s >= minVal && s <= maxVal) ticks.push(1);
        ticks.sort((a, b) => a - b);
      }
      for (const tick of ticks) {
        const x = xScale(toScale(tick));
        svg += svgGridLine(x, margin.top, x, margin.top + plotH);
        const label = tick >= 10 ? tick.toFixed(0) : tick < 0.1 ? tick.toFixed(2) : tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1);
        svg += svgText(x, margin.top + plotH + 18, label, {
          anchor: 'middle', fontSize: 11, fill: '#666',
        });
      }
    } else {
      const tickCount = 5;
      for (let i = 0; i <= tickCount; i++) {
        const scaledVal = minVal + (valRange / tickCount) * i;
        const x = xScale(scaledVal);
        svg += svgGridLine(x, margin.top, x, margin.top + plotH);
        svg += svgText(x, margin.top + plotH + 18, scaledVal.toFixed(2), {
          anchor: 'middle', fontSize: 11, fill: '#666',
        });
      }
    }

    // Null effect reference line (dashed)
    if (showNullLine) {
      const nullX = xScale(nullValue);
      svg += `<line x1="${nullX}" y1="${margin.top}" x2="${nullX}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1" stroke-dasharray="4,3"/>`;
      const nullLabel = useLog ? '1.0' : '0';
      svg += svgText(nullX, margin.top - 6, nullLabel, {
        anchor: 'middle', fontSize: 10, fill: '#666',
      });
    }

    // Axes
    svg += svgAxisLine(margin.left, margin.top + plotH, margin.left + plotW, margin.top + plotH);

    // X-axis label
    let axisLabel = useLog ? 'Effect Estimate (log scale)' : 'Effect Estimate';
    if (dataMode === 'calculate') {
      if (measureType === 'oddsRatio') axisLabel = 'Odds Ratio (log scale)';
      else if (measureType === 'riskRatio') axisLabel = 'Risk Ratio (log scale)';
      else axisLabel = 'Risk Difference';
    }
    svg += svgText(margin.left + plotW / 2, margin.top + plotH + 40, axisLabel, {
      anchor: 'middle', fontSize: 12, fill: '#555',
    });

    // Separator line before pooled rows
    const firstPooledIdx = forestData.findIndex(r => r.isPooled);
    if (firstPooledIdx > 0) {
      const sepY = yScale(firstPooledIdx) - rowHeight / 2;
      svg += `<line x1="${margin.left}" y1="${sepY}" x2="${margin.left + plotW}" y2="${sepY}" stroke="#999" stroke-width="1" stroke-dasharray="2,2"/>`;
    }

    // Draw each row
    for (let i = 0; i < forestData.length; i++) {
      const row = forestData[i];
      const y = yScale(i);

      // Label on left († marks odds ratios computed with the zero-cell continuity correction)
      svg += svgText(margin.left - 8, y, shownLabel(row), {
        anchor: 'end', fontSize: 11, fill: row.isPooled ? '#000' : '#333',
        fontWeight: row.isPooled ? 'bold' : 'normal', dy: '0.35em',
      });

      // A row that cannot be estimated says so where its marker would be
      if (row.note) {
        svg += svgText(margin.left + plotW / 2, y, row.note, {
          anchor: 'middle', fontSize: 10, fill: '#777', dy: '0.35em',
        });
        continue;
      }

      const xLo = xScale(toScale(row.lower));
      const xHi = xScale(toScale(row.upper));
      const xEst = xScale(toScale(row.estimate));

      // CI line
      svg += `<line x1="${xLo}" y1="${y}" x2="${xHi}" y2="${y}" stroke="${colors[0]}" stroke-width="1.5"/>`;

      // CI whiskers (small vertical caps)
      svg += `<line x1="${xLo}" y1="${y - 4}" x2="${xLo}" y2="${y + 4}" stroke="${colors[0]}" stroke-width="1.5"/>`;
      svg += `<line x1="${xHi}" y1="${y - 4}" x2="${xHi}" y2="${y + 4}" stroke="${colors[0]}" stroke-width="1.5"/>`;

      // Marker
      const markerSize = 3 + (row.weight / maxWeight) * 6;

      if (row.isPooled) {
        const half = markerSize + 1;
        svg += `<polygon points="${xEst},${y - half} ${xEst + half * 1.5},${y} ${xEst},${y + half} ${xEst - half * 1.5},${y}" fill="${colors[1]}" stroke="white" stroke-width="1"/>`;
      } else {
        svg += `<rect x="${xEst - markerSize}" y="${y - markerSize}" width="${markerSize * 2}" height="${markerSize * 2}" fill="${colors[0]}" stroke="white" stroke-width="1"/>`;
      }

      // Value label. Three significant figures, as in the 2×2 analysis: two
      // fixed decimals printed a lower bound of 0.004 as "0.00" on a log axis.
      if (showLabels) {
        const valText = `${formatSigFigs(row.estimate, 3)} (${formatSigFigs(row.lower, 3)}, ${formatSigFigs(row.upper, 3)})`;
        svg += svgText(margin.left + plotW + 8, y, valText, {
          anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em',
        });
      }
    }

    // Footnotes, one line each
    notes.forEach((note, i) => {
      svg += svgText(margin.left, margin.top + plotH + 58 + i * 14, note, {
        anchor: 'start', fontSize: 10, fill: '#888',
      });
    });

    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [forestData, scaleType, showNullLine, showLabels, colorScheme, title, subtitle, source, dataMode, measureType, filterDescription]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    const measureLabel = dataMode === 'calculate'
      ? (measureType === 'oddsRatio' ? 'Odds Ratio' : measureType === 'riskRatio' ? 'Risk Ratio' : 'Risk Difference')
      : 'Estimate';
    const columns = [
      { header: 'Exposure', key: 'label' },
      { header: measureLabel, key: 'estimate' },
      { header: 'Lower 95% CI', key: 'lower' },
      { header: 'Upper 95% CI', key: 'upper' },
      { header: 'Weight (N)', key: 'weight' },
      { header: 'Note', key: 'note' },
    ];
    const rows = forestData.map(r => ({
      label: r.label,
      estimate: r.note ? null : r.estimate,
      lower: r.note ? null : r.lower,
      upper: r.note ? null : r.upper,
      weight: r.weight,
      note: r.note ?? (r.zeroCell ? 'Zero cell: OR and CI add 0.5 to every cell' : ''),
    }));
    return {
      title,
      subtitle: subtitle || undefined,
      source: source || undefined,
      columns,
      rows,
    };
  }, [forestData, title, subtitle, source, dataMode, measureType]);

  const displayTitle = title || 'Forest Plot';

  // --- Toggle exposure selection ---
  const toggleExposure = (expKey: string) => {
    setSelectedExposures(prev =>
      prev.includes(expKey) ? prev.filter(k => k !== expKey) : [...prev, expKey]
    );
  };

  const updateExposedValue = (expKey: string, value: string) => {
    setExposurePositiveValues(prev => ({ ...prev, [expKey]: value }));
    // Drop a saved comparison group equal to the new exposed value
    if (levelKey(exposureReferenceValues[expKey]) === levelKey(value)) {
      setExposureReferenceValues(prev => {
        const next = { ...prev };
        delete next[expKey];
        return next;
      });
    }
  };

  // Select all food/exposure-like columns
  const selectAllExposures = () => {
    setSelectedExposures(exposureColumns.map(c => c.key));
  };


  const clearAllExposures = () => {
    setSelectedExposures([]);
  };

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Forest Plot Configuration</h3>

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
                <p>{'\u2022'} Displaying effect estimates (odds ratios, relative risks) with confidence intervals</p>
                <p>{'\u2022'} Comparing results across multiple studies, subgroups, or strata</p>
                <p>{'\u2022'} Showing which factors are statistically significant (those whose CI does not cross the null line)</p>
                <p>{'\u2022'} Meta-analyses or systematic reviews of epidemiological studies</p>
                <p className="text-blue-500 italic mt-2">The standard way to show several effect estimates and their uncertainty side by side.</p>
              </div>
            )}
          </div>

          <VisualizationTip
            tip="Forest plots are the gold standard for displaying effect estimates with uncertainty. Each row shows a point estimate and its confidence interval. If the CI crosses the null line, the result is not statistically significant."
            context="Essential for analytic epidemiology, meta-analyses, and comparing risk factors across subgroups."
          />

          {/* Data Mode Toggle */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-1">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Data Source</h4>
            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              <button
                onClick={() => setDataMode('calculate')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  dataMode === 'calculate'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Calculate from Data
              </button>
              <button
                onClick={() => setDataMode('manual')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  dataMode === 'manual'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Pre-computed Columns
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {dataMode === 'calculate'
                ? 'Select an outcome and exposures — LineList will calculate the measures of association and confidence intervals automatically.'
                : 'Map columns that already contain effect estimates and confidence intervals.'}
            </p>
          </div>

          {dataMode === 'calculate' ? (
            <>
              {/* Outcome / Case Definition */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Case Definition</h4>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Outcome Variable <span className="text-red-500">*</span></label>
                  <select
                    value={outcomeVar}
                    onChange={e => {
                      setOutcomeVar(e.target.value);
                      setCaseValues(new Set());
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select variable...</option>
                    {caseDefinitionColumns.map(col => (
                      <option key={col.key} value={col.key}>{col.label}</option>
                    ))}
                  </select>
                </div>

                {!outcomeVar && (
                  <p className="text-xs text-gray-500">
                    Choose the variable that records who became ill or who is a case.
                  </p>
                )}

                {outcomeVar && outcomeLevels.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Which values mean "case"? <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {outcomeLevels.map(level => (
                        <label key={level.key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={caseKeys.has(level.key)}
                            onChange={(e) => {
                              // Compared by level, so a saved "yes" unticks "Yes"
                              const next = new Set(
                                Array.from(caseValues).filter(v => levelKey(v) !== level.key)
                              );
                              if (e.target.checked) next.add(level.label);
                              setCaseValues(next);
                            }}
                            className="rounded border-gray-300"
                          />
                          {level.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Measure of Association */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Measure of Association</h4>
                <select
                  value={measureType}
                  onChange={e => setMeasureType(e.target.value as MeasureType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="oddsRatio">Odds Ratio (OR)</option>
                  <option value="riskRatio">Risk Ratio (RR)</option>
                  <option value="riskDifference">Risk Difference (RD)</option>
                </select>
              </div>

              {/* Exposure Selection */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">Exposures</h4>
                  <div className="flex gap-1">
                    <button
                      onClick={selectAllExposures}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      All
                    </button>
                    <span className="text-xs text-gray-400">|</span>
                    <button
                      onClick={clearAllExposures}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      None
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {exposureColumns.map(col => {
                    const isSelected = selectedExposures.includes(col.key);
                    const setup = exposureSetups.get(col.key);
                    const levels = setup?.levels ?? [];
                    const exposed = setup?.exposed ?? null;
                    const reference = setup?.reference ?? null;
                    return (
                      <div key={col.key}>
                        <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleExposure(col.key)}
                            className="rounded border-gray-300"
                          />
                          {col.label}
                        </label>
                        {isSelected && (
                          <div className="ml-6 mt-1 space-y-1">
                            <select
                              value={exposed?.label ?? ''}
                              onChange={e => updateExposedValue(col.key, e.target.value)}
                              aria-label={`Exposed value for ${col.label}`}
                              className={`w-full px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-blue-500 ${
                                exposed ? 'border-gray-200 bg-gray-50' : 'border-amber-500 bg-amber-50'
                              }`}
                            >
                              {!exposed && <option value="">Choose exposed value…</option>}
                              {levels.map(level => (
                                <option key={level.key} value={level.label}>{level.label} = Exposed</option>
                              ))}
                            </select>
                            {exposed && (levels.length > 2 || !reference) && (
                              <select
                                value={reference?.label ?? ''}
                                onChange={e => setExposureReferenceValues(prev => ({
                                  ...prev, [col.key]: e.target.value,
                                }))}
                                aria-label={`Comparison group for ${col.label}`}
                                className={`w-full px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-blue-500 ${
                                  reference ? 'border-gray-200 bg-gray-50' : 'border-amber-500 bg-amber-50'
                                }`}
                              >
                                {!reference && <option value="">Choose comparison group…</option>}
                                {levels.filter(level => level.key !== exposed.key).map(level => (
                                  <option key={level.key} value={level.label}>{level.label} = Comparison</option>
                                ))}
                              </select>
                            )}
                            <input
                              type="text"
                              value={customLabels[col.key] || ''}
                              onChange={e => setCustomLabels(prev => ({
                                ...prev, [col.key]: e.target.value,
                              }))}
                              aria-label={`Row label for ${col.label}`}
                              placeholder={`${col.label} (${exposed?.label ?? '...'} vs. ${reference?.label ?? '...'})`}
                              className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-gray-50 focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedExposures.length > 0 && (
                  <p className="text-xs text-gray-500">
                    {selectedExposures.length} exposure{selectedExposures.length !== 1 ? 's' : ''} selected
                  </p>
                )}

                {calculated.needsChoice.length > 0 && (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2" role="status">
                    Not drawn yet: {calculated.needsChoice.join(', ')}. Choose which value means
                    &ldquo;exposed&rdquo; (and the comparison group) above; LineList could not tell from the values.
                  </p>
                )}

                {filterDescription && (
                  <p className="text-xs text-gray-500">
                    Using the 2×2 tab&rsquo;s filter: {filterDescription} ({filteredRecords.length} of {dataset.records.length} records).
                  </p>
                )}
              </div>
            </>
          ) : (
            /* Manual mode: column mapping */
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">Data Mapping</h4>

              <VariableMapper
                label="Study/Subgroup Label"
                description="Text column identifying each study or row"
                columns={dataset.columns}
                value={labelCol}
                onChange={setLabelCol}
                filterTypes={['text', 'categorical']}
                required
              />

              <VariableMapper
                label="Point Estimate"
                description="Numeric column with OR, RR, or effect estimate"
                columns={dataset.columns}
                value={estimateCol}
                onChange={setEstimateCol}
                filterTypes={['number']}
                required
              />

              <VariableMapper
                label="Lower CI"
                description="Lower confidence limit"
                columns={dataset.columns}
                value={lowerCICol}
                onChange={setLowerCICol}
                filterTypes={['number']}
                required
              />

              <VariableMapper
                label="Upper CI"
                description="Upper confidence limit"
                columns={dataset.columns}
                value={upperCICol}
                onChange={setUpperCICol}
                filterTypes={['number']}
                required
              />

              <VariableMapper
                label="Weight (Optional)"
                description="Study weight — affects marker size"
                columns={dataset.columns}
                value={weightCol}
                onChange={setWeightCol}
                filterTypes={['number']}
                placeholder="None (equal weights)"
              />
            </div>
          )}

          {/* Options (shared) */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Options</h4>

            {dataMode === 'manual' && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Effect Measure</label>
                <select
                  value={effectMeasure}
                  onChange={e => setEffectMeasure(e.target.value as 'ratio' | 'difference')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="ratio">Ratio (OR, RR) — Log Scale</option>
                  <option value="difference">Difference (RD, MD) — Linear</option>
                </select>
              </div>
            )}

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
              <select
                value={colorScheme}
                onChange={e => setColorScheme(e.target.value as ChartColorScheme)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="evergreen">Evergreen</option>
                <option value="colorblind">Colorblind-safe</option>
                <option value="grayscale">Grayscale</option>
                <option value="blue">Blue</option>
                <option value="warm">Warm</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showNullLine}
                onChange={e => setShowNullLine(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show null effect line
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={e => setShowLabels(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show estimate labels
            </label>
          </div>

          {/* Annotations */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Annotations</h4>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
              <input
                type="text"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <input
                type="text"
                value={source}
                onChange={e => setSource(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-w-0">
        {svgContent ? (
          <ChartContainer
            title={displayTitle}
            subtitle={subtitle || undefined}
            source={source || undefined}
            svgContent={svgContent}
            excelData={excelData}
            filename="forest-plot"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure the forest plot</p>
            <p className="text-gray-400 text-sm mt-2">
              {dataMode === 'calculate'
                ? 'Select an outcome variable, define cases, and choose exposures to compare. LineList will calculate the effect estimates and 95% confidence intervals automatically.'
                : 'Select a label column, point estimate, and confidence interval columns to generate the chart.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
