import { useState, useMemo, useEffect } from 'react';
import type { Dataset, CaseRecord } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { calculateTwoByTwo } from '../../../utils/statistics';
import { getChartColors, type ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgAxisLine,
  svgGridLine,
  escapeXml,
  type ExcelExportData,
} from '../../../utils/chartExport';

interface ForestRow {
  label: string;
  estimate: number;
  lower: number;
  upper: number;
  weight: number;
  isPooled: boolean;
}

type DataMode = 'manual' | 'calculate';
type MeasureType = 'oddsRatio' | 'riskRatio' | 'riskDifference';

export function ForestPlot({ dataset }: { dataset: Dataset }) {
  // --- Load saved 2×2 analysis settings so forest plot matches ---
  const twoByTwoSaved = useMemo(() => {
    try {
      const raw = localStorage.getItem(`epikit_twobytwo_${dataset.id}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [dataset.id]);

  // --- Data mode toggle ---
  const [dataMode, setDataMode] = useState<DataMode>('calculate');

  // --- Manual mode state (pre-computed columns) ---
  const [labelCol, setLabelCol] = useState('');
  const [estimateCol, setEstimateCol] = useState('');
  const [lowerCICol, setLowerCICol] = useState('');
  const [upperCICol, setUpperCICol] = useState('');
  const [weightCol, setWeightCol] = useState('');

  // --- Calculate mode state (initialized from 2×2 analysis if available) ---
  const [outcomeVar, setOutcomeVar] = useState<string>(() =>
    (twoByTwoSaved.outcomeVar as string) || ''
  );
  const [caseValues, setCaseValues] = useState<Set<string>>(() => {
    const arr = twoByTwoSaved.caseValues;
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  });
  const [selectedExposures, setSelectedExposures] = useState<string[]>(() => {
    const arr = twoByTwoSaved.selectedExposures;
    return Array.isArray(arr) ? arr as string[] : [];
  });
  const [exposurePositiveValues, setExposurePositiveValues] = useState<Record<string, string>>(() =>
    (twoByTwoSaved.exposurePositiveValues as Record<string, string>) || {}
  );
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

  // --- Calculate mode helpers ---

  // Get columns suitable for case definition
  const caseDefinitionColumns = useMemo(() => {
    return dataset.columns.filter(col => {
      if (col.type === 'number' && !col.key.toLowerCase().includes('age')) return false;
      if (col.type === 'date') return false;
      if (col.key === 'id' || col.key === 'case_id' || col.key === 'participant_id') return false;
      if (col.key.includes('latitude') || col.key.includes('longitude')) return false;
      const uniqueValues = new Set(dataset.records.map(r => r[col.key])).size;
      return uniqueValues >= 2 && uniqueValues <= 20;
    });
  }, [dataset]);

  // Get unique values for the selected outcome variable
  const outcomeValues = useMemo(() => {
    if (!outcomeVar) return [];
    const values = new Set(dataset.records.map(r => String(r[outcomeVar] ?? '')));
    return Array.from(values).filter(v => v !== '').sort();
  }, [dataset.records, outcomeVar]);

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
      };
      localStorage.setItem(persistenceKey, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to sync forest plot settings:', e);
    }
  }, [dataMode, dataset.id, outcomeVar, caseValues, selectedExposures, exposurePositiveValues]);

  // Auto-detect outcome variable (only if nothing was loaded from 2×2 settings)
  useEffect(() => {
    if (dataMode !== 'calculate' || outcomeVar) return;
    const commonCaseColumns = ['ill', 'case_status', 'case', 'status', 'outcome'];
    const found = caseDefinitionColumns.find(col =>
      commonCaseColumns.some(name => col.key.toLowerCase().includes(name))
    );
    if (found) {
      setOutcomeVar(found.key);
      const values = new Set(dataset.records.map(r => String(r[found.key] ?? '')));
      const caseKeywords = ['yes', 'confirmed', 'probable', 'suspected', 'positive', 'case'];
      const autoSelected = new Set<string>();
      values.forEach(v => {
        if (caseKeywords.some(kw => v.toLowerCase().includes(kw))) {
          autoSelected.add(v);
        }
      });
      if (autoSelected.size > 0) {
        setCaseValues(autoSelected);
      }
    }
  }, [dataMode, caseDefinitionColumns, dataset.records, outcomeVar]);

  // Get unique values for a specific exposure variable
  const getExposureValues = (expVar: string): string[] => {
    const values = new Set<string>();
    dataset.records.forEach(r => {
      const v = r[expVar];
      if (v !== null && v !== undefined && v !== '') {
        values.add(String(v));
      }
    });
    return Array.from(values).sort();
  };

  // Auto-detect "Yes" as exposed value
  const detectExposedValue = (expVar: string): string => {
    const values = getExposureValues(expVar);
    const positiveKeywords = ['yes', 'true', '1', 'positive', 'exposed'];
    const found = values.find(v =>
      positiveKeywords.some(kw => v.toLowerCase() === kw)
    );
    return found || values[0] || '';
  };

  // Check if a record is a case
  const isCase = (record: CaseRecord): boolean => {
    if (!outcomeVar || caseValues.size === 0) return false;
    const value = String(record[outcomeVar] ?? '');
    return caseValues.has(value);
  };

  // Sync effectMeasure when measureType changes
  useEffect(() => {
    if (dataMode === 'calculate') {
      setEffectMeasure(measureType === 'riskDifference' ? 'difference' : 'ratio');
    }
  }, [dataMode, measureType]);

  // --- Calculate forest data from 2x2 analysis ---
  const calculatedForestData = useMemo((): ForestRow[] => {
    if (dataMode !== 'calculate') return [];
    if (!outcomeVar || caseValues.size === 0 || selectedExposures.length === 0) return [];

    const rows: ForestRow[] = [];

    for (const expVar of selectedExposures) {
      const exposedValue = exposurePositiveValues[expVar] || detectExposedValue(expVar);
      let a = 0, b = 0, c = 0, d = 0;

      dataset.records.forEach((record: CaseRecord) => {
        const expValue = record[expVar];
        if (expValue === null || expValue === undefined || expValue === '') return;

        const exposed = String(expValue) === exposedValue;
        const diseased = isCase(record);

        if (exposed && diseased) a++;
        else if (exposed && !diseased) b++;
        else if (!exposed && diseased) c++;
        else if (!exposed && !diseased) d++;
      });

      const results = calculateTwoByTwo({ a, b, c, d });

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

      // Skip if result is not usable
      if (!isFinite(estimate) || isNaN(estimate)) continue;
      if (!isFinite(lower) || !isFinite(upper)) continue;
      // For ratio measures, skip non-positive
      if (measureType !== 'riskDifference' && (estimate <= 0 || lower <= 0 || upper <= 0)) continue;

      // Use custom label if set, otherwise show comparison
      const col = dataset.columns.find(c => c.key === expVar);
      const colLabel = col ? col.label : expVar;
      const label = customLabels[expVar]
        || `${colLabel} (${exposedValue} vs. rest)`;

      rows.push({
        label,
        estimate,
        lower: Math.min(lower, upper),
        upper: Math.max(lower, upper),
        weight: results.total, // weight by total sample size
        isPooled: false,
      });
    }

    return rows;
  }, [dataMode, dataset, outcomeVar, caseValues, selectedExposures, exposurePositiveValues, customLabels, measureType]);

  // --- Manual mode: process data from columns ---
  const manualForestData = useMemo((): ForestRow[] => {
    if (dataMode !== 'manual') return [];
    if (!labelCol || !estimateCol || !lowerCICol || !upperCICol) return [];

    const rows: ForestRow[] = [];

    for (const record of dataset.records) {
      const label = record[labelCol];
      const est = Number(record[estimateCol]);
      const lo = Number(record[lowerCICol]);
      const hi = Number(record[upperCICol]);
      const wt = weightCol ? Number(record[weightCol]) : 1;

      if (label == null || label === '' || isNaN(est) || isNaN(lo) || isNaN(hi)) continue;
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
  const forestData = dataMode === 'calculate' ? calculatedForestData : manualForestData;

  // Generate SVG
  const svgContent = useMemo(() => {
    if (forestData.length === 0) return '';

    const useLog = effectMeasure === 'ratio';
    const toScale = (v: number) => useLog ? Math.log(v) : v;
    const nullValue = useLog ? 0 : 0; // log(1)=0 for ratio, 0 for difference

    const dims = getDefaultDimensions('forest');
    const rowHeight = 30;
    const minPlotHeight = forestData.length * rowHeight;
    const width = dims.width;
    const height = Math.max(dims.height, minPlotHeight + dims.margin.top + dims.margin.bottom);
    const margin = { ...dims.margin, right: showLabels ? 180 : 60 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Compute scale range from all CI bounds
    const allScaled = forestData.flatMap(r => [toScale(r.lower), toScale(r.estimate), toScale(r.upper)]);
    let minVal = Math.min(...allScaled, nullValue);
    let maxVal = Math.max(...allScaled, nullValue);
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

      // Label on left
      const labelText = row.label.length > 32 ? row.label.slice(0, 30) + '\u2026' : row.label;
      svg += svgText(margin.left - 8, y, escapeXml(labelText), {
        anchor: 'end', fontSize: 11, fill: row.isPooled ? '#000' : '#333',
        fontWeight: row.isPooled ? 'bold' : 'normal', dy: '0.35em',
      });

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

      // Value label
      if (showLabels) {
        const estDisplay = row.estimate.toFixed(2);
        const loDisplay = row.lower.toFixed(2);
        const hiDisplay = row.upper.toFixed(2);
        const valText = `${estDisplay} (${loDisplay}, ${hiDisplay})`;
        svg += svgText(margin.left + plotW + 8, y, valText, {
          anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em',
        });
      }
    }


    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [forestData, effectMeasure, showNullLine, showLabels, colorScheme, title, subtitle, source, dataMode, measureType]);

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
    ];
    const rows = forestData.map(r => ({
      label: r.label,
      estimate: r.estimate,
      lower: r.lower,
      upper: r.upper,
      weight: r.weight,
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
    setSelectedExposures(prev => {
      if (prev.includes(expKey)) {
        return prev.filter(k => k !== expKey);
      }
      // Auto-detect exposed value when adding
      if (!exposurePositiveValues[expKey]) {
        const detected = detectExposedValue(expKey);
        if (detected) {
          setExposurePositiveValues(p => ({ ...p, [expKey]: detected }));
        }
      }
      return [...prev, expKey];
    });
  };

  // Select all food/exposure-like columns
  const selectAllExposures = () => {
    const allKeys = exposureColumns.map(c => c.key);
    const newPositiveValues = { ...exposurePositiveValues };
    allKeys.forEach(key => {
      if (!newPositiveValues[key]) {
        newPositiveValues[key] = detectExposedValue(key);
      }
    });
    setExposurePositiveValues(newPositiveValues);
    setSelectedExposures(allKeys);
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
                <p>{'\u2022'} Showing which factors are statistically significant (CI crossing the null line)</p>
                <p>{'\u2022'} Meta-analyses or systematic reviews of epidemiological studies</p>
                <p className="text-blue-500 italic mt-2">CDC provides forest plot templates. The gold standard for displaying pooled epidemiological evidence.</p>
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
                ? 'Select an outcome and exposures — EpiKit will calculate the measures of association and confidence intervals automatically.'
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

                {outcomeVar && outcomeValues.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Which values mean "case"? <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {outcomeValues.map(val => (
                        <label key={val} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={caseValues.has(val)}
                            onChange={() => {
                              setCaseValues(prev => {
                                const next = new Set(prev);
                                if (next.has(val)) next.delete(val);
                                else next.add(val);
                                return next;
                              });
                            }}
                            className="rounded border-gray-300"
                          />
                          {val}
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
                              value={exposurePositiveValues[col.key] || ''}
                              onChange={e => setExposurePositiveValues(prev => ({
                                ...prev, [col.key]: e.target.value,
                              }))}
                              className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-gray-50 focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">Exposed value...</option>
                              {getExposureValues(col.key).map(v => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={customLabels[col.key] || ''}
                              onChange={e => setCustomLabels(prev => ({
                                ...prev, [col.key]: e.target.value,
                              }))}
                              placeholder={`${col.label} (${exposurePositiveValues[col.key] || '...'} vs. rest)`}
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
                ? 'Select an outcome variable, define cases, and choose exposures to compare. EpiKit will calculate the effect estimates and 95% confidence intervals automatically.'
                : 'Select a label column, point estimate, and confidence interval columns to generate the chart.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
