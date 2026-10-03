import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Dataset, CaseRecord } from '../../types/analysis';
import { calculateTwoByTwo } from '../../utils/statistics';
import type { TwoByTwoResults } from '../../utils/statistics';
import { formatSigFigs, formatStatPercent } from '../../utils/localeNumbers';
import { formatPValue } from '../../utils/statFormat';
import {
  caseKeySet,
  collectLevels,
  levelKey,
  outcomeCandidateColumns,
  resolveExposureSetup,
  suggestOutcome,
  tabulateTwoByTwo,
} from '../../utils/twoByTwoSetup';
import type { ExposureSetup } from '../../utils/twoByTwoSetup';
import {
  chooseTwoByTwoTest,
  interpretCaseControl,
  interpretCohort,
} from '../../utils/twoByTwoInterpretation';
import type { TwoByTwoTest } from '../../utils/twoByTwoInterpretation';
import { TwoByTwoTutorial } from '../tutorials/TwoByTwoTutorial';
import { TabHeader, HelpPanel, ResultsActions, ExportIcons, StatTooltip, statDefinitions } from '../shared';
import { collectCategoryValues, countInCategory, filterByCategoryValues, isMissingValue } from '../../utils/recordFilter';


interface TwoByTwoAnalysisProps {
  dataset: Dataset;
  initialExposure?: string;
}

type StudyDesign = 'cohort' | 'case-control';

interface ExposureResult {
  exposureVar: string;
  exposureLabel: string;
  exposedValue: string;
  /** The comparison ("unexposed") level, named so the reader can see what the exposed were compared with. */
  referenceValue: string;
  results: TwoByTwoResults;
  /** The test whose p-value is shown; null when the table has an empty row or column. */
  test: TwoByTwoTest | null;
  /** Records left out because their exposure is a third category, neither exposed nor the comparison group. */
  otherLevels: number;
}

interface TwoByTwoSettings {
  studyDesign: StudyDesign;
  outcomeVar: string;
  caseValues: string[];
  selectedExposures: string[];
  exposurePositiveValues: Record<string, string>;
  exposureReferenceValues: Record<string, string>;
  filterBy: string;
  selectedFilterValues: string[];
}

/**
 * The settings saved for a dataset. When no outcome was saved, one is
 * pre-selected only if a column's name says it is the outcome and its values
 * split into cases and non-cases; otherwise the choice is left to the user.
 */
function loadSettings(dataset: Dataset): TwoByTwoSettings {
  let saved: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(`epikit_twobytwo_${dataset.id}`);
    saved = raw ? JSON.parse(raw) : {};
  } catch {
    saved = {};
  }

  let outcomeVar = (saved.outcomeVar as string) || '';
  let caseValues = Array.isArray(saved.caseValues) ? saved.caseValues as string[] : [];
  if (!outcomeVar) {
    const found = suggestOutcome(dataset.columns, dataset.records);
    if (found) {
      outcomeVar = found.key;
      caseValues = found.caseValues;
    }
  }

  return {
    studyDesign: (saved.studyDesign as StudyDesign) || 'cohort',
    outcomeVar,
    caseValues,
    selectedExposures: Array.isArray(saved.selectedExposures) ? saved.selectedExposures as string[] : [],
    exposurePositiveValues: (saved.exposurePositiveValues as Record<string, string>) || {},
    exposureReferenceValues: (saved.exposureReferenceValues as Record<string, string>) || {},
    filterBy: (saved.filterBy as string) ?? '',
    selectedFilterValues: Array.isArray(saved.selectedFilterValues) ? saved.selectedFilterValues as string[] : [],
  };
}

export function TwoByTwoAnalysis({ dataset, initialExposure }: TwoByTwoAnalysisProps) {
  // Persistence key for this dataset
  const persistenceKey = `epikit_twobytwo_${dataset.id}`;

  // Load persisted state once during initialization
  const [initial] = useState<TwoByTwoSettings>(() => loadSettings(dataset));

  // Study design
  const [studyDesign, setStudyDesign] = useState<StudyDesign>(initial.studyDesign);

  // Outcome/case definition (like Attack Rates pattern)
  const [outcomeVar, setOutcomeVar] = useState<string>(initial.outcomeVar);
  const [caseValues, setCaseValues] = useState<Set<string>>(() => new Set(initial.caseValues));

  // Multi-exposure selection (for cohort/case-control)
  const [selectedExposures, setSelectedExposures] = useState<string[]>(initial.selectedExposures);
  // For each exposure, the value the user chose as "exposed". Unset means it
  // is recognised from the values, or asked for when it cannot be.
  const [exposurePositiveValues, setExposurePositiveValues] = useState<Record<string, string>>(initial.exposurePositiveValues);
  // For each exposure, the comparison group the user chose
  const [exposureReferenceValues, setExposureReferenceValues] = useState<Record<string, string>>(initial.exposureReferenceValues);

  // Filter state
  const [filterBy, setFilterBy] = useState<string>(initial.filterBy);
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(() => new Set(initial.selectedFilterValues));
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);

  // Reload persisted state when the dataset actually changes. Done while
  // rendering rather than in an effect, so the save effect below never runs
  // with the previous dataset's state under the new dataset's storage key.
  const [loadedDatasetId, setLoadedDatasetId] = useState(dataset.id);
  if (loadedDatasetId !== dataset.id) {
    const next = loadSettings(dataset);
    setLoadedDatasetId(dataset.id);
    setStudyDesign(next.studyDesign);
    setOutcomeVar(next.outcomeVar);
    setCaseValues(new Set(next.caseValues));
    setSelectedExposures(next.selectedExposures);
    setExposurePositiveValues(next.exposurePositiveValues);
    setExposureReferenceValues(next.exposureReferenceValues);
    setFilterBy(next.filterBy);
    setSelectedFilterValues(new Set(next.selectedFilterValues));
    setShowAllFilterValues(false);
  }

  // Save state to localStorage when it changes
  useEffect(() => {
    try {
      const toSave = {
        studyDesign,
        outcomeVar,
        caseValues: Array.from(caseValues),
        selectedExposures,
        exposurePositiveValues,
        exposureReferenceValues,
        filterBy,
        selectedFilterValues: Array.from(selectedFilterValues),
      };
      localStorage.setItem(persistenceKey, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save 2x2 analysis settings:', e);
    }
  }, [persistenceKey, studyDesign, outcomeVar, caseValues, selectedExposures,
    exposurePositiveValues, exposureReferenceValues, filterBy, selectedFilterValues]);

  // Get columns suitable for case definition (categorical columns, and
  // numeric ones with few distinct values so a 1/0-coded outcome can be used)
  const caseDefinitionColumns = useMemo(
    () => outcomeCandidateColumns(dataset.columns, dataset.records),
    [dataset]
  );

  // Distinct values of the selected outcome variable. Trimmed and
  // case-folded, so "Yes" and "yes " are one choice rather than two.
  const outcomeLevels = useMemo(() => {
    if (!outcomeVar) return [];
    return collectLevels(dataset.records, outcomeVar);
  }, [dataset.records, outcomeVar]);

  // The chosen case values in the form records are compared against
  const caseKeys = useMemo(() => caseKeySet(caseValues), [caseValues]);


  // Get columns suitable for exposure variables
  const exposureColumns = useMemo(() => {
    return dataset.columns.filter(col => {
      if (col.type === 'date') return false;
      if (col.key === 'id' || col.key === 'case_id' || col.key === 'participant_id') return false;
      if (col.key.includes('latitude') || col.key.includes('longitude')) return false;
      if (col.key === outcomeVar) return false; // Don't show outcome var as exposure option

      // Check number of unique values (for categorical exposure)
      const uniqueValues = new Set(dataset.records.map(r => r[col.key])).size;
      return uniqueValues >= 2 && uniqueValues <= 20;
    });
  }, [dataset, outcomeVar]);

  // Get unique values for the filter dropdown
  const filterValues = useMemo(() => {
    if (!filterBy) return [];
    return collectCategoryValues(dataset.records, filterBy);
  }, [dataset.records, filterBy]);

  // Apply filter to records
  const filteredRecords = useMemo(
    () => filterByCategoryValues(dataset.records, filterBy, selectedFilterValues),
    [dataset.records, filterBy, selectedFilterValues]
  );

  // For every candidate exposure: its levels, which one counts as exposed and
  // which it is compared with. A saved choice wins; otherwise the levels are
  // recognised from their wording, and left unset when they cannot be.
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

  // Check if a record is a case
  const isCase = useCallback((record: CaseRecord): boolean => {
    if (!outcomeVar || caseKeys.size === 0) return false;
    return caseKeys.has(levelKey(record[outcomeVar]));
  }, [caseKeys, outcomeVar]);

  // Auto-select initial exposure when provided from parent (e.g., from Variable
  // Explorer). Applied once per value, so the exposure can be deselected again.
  const [appliedInitialExposure, setAppliedInitialExposure] = useState<string | undefined>(undefined);
  if (initialExposure && initialExposure !== appliedInitialExposure
    && exposureColumns.some(col => col.key === initialExposure)) {
    setAppliedInitialExposure(initialExposure);
    if (!selectedExposures.includes(initialExposure)) {
      setSelectedExposures([...selectedExposures, initialExposure]);
    }
  }

  // Export dataset with only the records used in the current analysis
  const exportDatasetCSV = useCallback(() => {
    if (!outcomeVar || caseValues.size === 0 || selectedExposures.length === 0) return;

    // Filter to only records with valid outcome and at least one valid exposure
    const analysisRecords = filteredRecords.filter(record => {
      // Must have valid outcome
      const outcomeValue = record[outcomeVar];
      if (outcomeValue === null || outcomeValue === undefined || String(outcomeValue).trim() === '') {
        return false;
      }

      // Must have at least one valid exposure value
      return selectedExposures.some(expVar => {
        const expValue = record[expVar];
        return expValue !== null && expValue !== undefined && String(expValue).trim() !== '';
      });
    });

    // Create CSV
    const headers = dataset.columns.map(col => col.label);
    let csv = headers.join(',') + '\n';

    analysisRecords.forEach(record => {
      const row = dataset.columns.map(col => {
        const value = record[col.key];
        const strValue = value === null || value === undefined ? '' : String(value);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      });
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `2x2_analysis_data_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [outcomeVar, caseValues, selectedExposures, filteredRecords, dataset.columns]);

  // Calculate 2x2 results for each selected exposure
  const exposureResults: ExposureResult[] = useMemo(() => {
    if (!outcomeVar || caseKeys.size === 0 || selectedExposures.length === 0) {
      return [];
    }

    const results: ExposureResult[] = [];
    for (const expVar of selectedExposures) {
      const setup = exposureSetups.get(expVar);
      // No result until both groups are known: a guessed "exposed" value
      // produces a clean, inverted estimate rather than an obvious error.
      if (!setup || !setup.exposed || !setup.reference) continue;

      const counts = tabulateTwoByTwo(
        filteredRecords,
        expVar,
        setup.exposed.key,
        setup.reference.key,
        outcomeVar,
        caseKeys
      );
      const twoByTwo = calculateTwoByTwo(counts.table);
      const col = dataset.columns.find(c => c.key === expVar);

      results.push({
        exposureVar: expVar,
        exposureLabel: col?.label || expVar,
        exposedValue: setup.exposed.label,
        referenceValue: setup.reference.label,
        results: twoByTwo,
        test: chooseTwoByTwoTest(twoByTwo),
        otherLevels: counts.otherLevels,
      });
    }

    // Sort by proportion of cases exposed (for case-control) or attack rate among exposed (for cohort)
    // Both in descending order (highest first)
    return results.sort((a, b) => {
      if (studyDesign === 'cohort') {
        // Sort by attack rate among exposed (descending)
        return b.results.attackRateExposed - a.results.attackRateExposed;
      } else {
        // Sort by proportion of cases exposed (descending)
        const propA = a.results.totalDisease > 0 ? a.results.table.a / a.results.totalDisease : 0;
        const propB = b.results.totalDisease > 0 ? b.results.table.a / b.results.totalDisease : 0;
        return propB - propA;
      }
    });
  }, [filteredRecords, dataset.columns, outcomeVar, caseKeys, selectedExposures, exposureSetups, studyDesign]);

  // Selected exposures that cannot be analysed until the user says which
  // value means exposed, or what to compare it with
  const exposuresNeedingChoice = useMemo(() => {
    return selectedExposures
      .map(expVar => {
        const setup = exposureSetups.get(expVar);
        if (!setup || (setup.exposed && setup.reference)) return null;
        const col = dataset.columns.find(c => c.key === expVar);
        return { key: expVar, label: col?.label || expVar, needs: setup.exposed ? 'reference' : 'exposed' };
      })
      .filter((item): item is { key: string; label: string; needs: string } => item !== null);
  }, [selectedExposures, exposureSetups, dataset.columns]);

  // Count total cases
  const totalCases = useMemo(() => {
    return filteredRecords.filter(isCase).length;
  }, [filteredRecords, isCase]);

  // Count total non-cases (records with a valid outcome value that is not a case)
  const totalNonCases = useMemo(() => {
    if (!outcomeVar || caseKeys.size === 0) return 0;
    return filteredRecords.filter(record => {
      if (isMissingValue(record[outcomeVar])) return false;
      return !isCase(record);
    }).length;
  }, [filteredRecords, outcomeVar, caseKeys, isCase]);


  const formatMeasure = (n: number): string => {
    if (!isFinite(n)) return 'Undefined';
    return formatSigFigs(n, 3);
  };

  const formatCI = (ci: [number, number]): string => {
    if (!isFinite(ci[0]) || !isFinite(ci[1])) return '(Undefined)';
    return `(${formatSigFigs(ci[0], 3)} - ${formatSigFigs(ci[1], 3)})`;
  };

  // Toggle exposure selection
  const toggleExposure = (expVar: string) => {
    setSelectedExposures(prev =>
      prev.includes(expVar) ? prev.filter(v => v !== expVar) : [...prev, expVar]
    );
  };

  // Update exposed value for a specific exposure
  const updateExposedValue = (expVar: string, value: string) => {
    setExposurePositiveValues(prev => ({ ...prev, [expVar]: value }));
    // A saved reference equal to the new exposed value is dropped, so a new
    // one is worked out rather than comparing a group with itself
    if (levelKey(exposureReferenceValues[expVar]) === levelKey(value)) {
      setExposureReferenceValues(prev => {
        const next = { ...prev };
        delete next[expVar];
        return next;
      });
    }
  };


  // Update reference value for a specific exposure
  const updateReferenceValue = (expVar: string, value: string) => {
    setExposureReferenceValues(prev => ({ ...prev, [expVar]: value }));
  };

  // Render summary table for multiple exposures
  const renderSummaryTable = () => {
    const anyFisher = exposureResults.some(r => r.test?.test === 'fisher');
    const anyCorrectedOR = studyDesign === 'case-control' && exposureResults.some(r => r.results.oddsRatioCorrected);
    const headerCell = 'px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider';

    return (
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {studyDesign === 'cohort' ? (
                <>
                  {/* First header row - parent groups */}
                  <tr className="border-b border-gray-200">
                    <th rowSpan={2} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      Exposure
                    </th>
                    <th colSpan={3} className={`${headerCell} border-r border-gray-200`}>
                      Exposed
                    </th>
                    <th colSpan={3} className={`${headerCell} border-r border-gray-200`}>
                      Comparison group
                    </th>
                    <th colSpan={2} className={`${headerCell} border-r border-gray-200`}>
                      Risk ratio
                    </th>
                    <th rowSpan={2} className={headerCell}>
                      <div className="flex items-center justify-center gap-1">
                        <span>p-value</span>
                        <StatTooltip {...statDefinitions.pValue} />
                      </div>
                    </th>
                  </tr>
                  {/* Second header row - individual columns */}
                  <tr>
                    <th className={headerCell}>
                      # Ill
                    </th>
                    <th className={headerCell}>
                      Total
                    </th>
                    <th className={`${headerCell} border-r border-gray-200`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Attack Rate</span>
                        <StatTooltip {...statDefinitions.attackRate} />
                      </div>
                    </th>
                    <th className={headerCell}>
                      # Ill
                    </th>
                    <th className={headerCell}>
                      Total
                    </th>
                    <th className={`${headerCell} border-r border-gray-200`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Attack Rate</span>
                        <StatTooltip {...statDefinitions.attackRate} />
                      </div>
                    </th>
                    <th className={headerCell}>
                      <div className="flex items-center justify-center gap-1">
                        <span>RR</span>
                        <StatTooltip {...statDefinitions.riskRatio} />
                      </div>
                    </th>
                    <th className={`${headerCell} border-r border-gray-200`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>95% CI</span>
                        <StatTooltip {...statDefinitions.confidenceInterval} />
                      </div>
                    </th>
                  </tr>
                </>
              ) : (
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Exposure
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-1">
                      <span>Cases exposed (of {totalCases} cases)</span>
                      <StatTooltip
                        term="Cases exposed"
                        definition="The number of cases who were exposed, and the percentage of cases with a recorded exposure that this represents."
                      />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-1">
                      <span>Controls exposed (of {totalNonCases} controls)</span>
                      <StatTooltip
                        term="Controls exposed"
                        definition="The number of controls who were exposed, and the percentage of controls with a recorded exposure that this represents."
                      />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-1">
                      <span>OR</span>
                      <StatTooltip {...statDefinitions.oddsRatio} />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-1">
                      <span>95% CI</span>
                      <StatTooltip {...statDefinitions.confidenceInterval} />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-1">
                      <span>p-value</span>
                      <StatTooltip {...statDefinitions.pValue} />
                    </div>
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {exposureResults.map((result) => {
                const r = result.results;
                const measure = studyDesign === 'cohort' ? r.riskRatio : r.oddsRatio;
                const ci = studyDesign === 'cohort' ? r.riskRatioCI : r.oddsRatioCI;
                const corrected = studyDesign === 'case-control' && r.oddsRatioCorrected;
                const pValueCell = (
                  <td className="px-3 py-2 text-sm text-center text-gray-900 whitespace-nowrap">
                    {result.test
                      ? `${formatPValue(result.test.pValue)}${result.test.test === 'fisher' ? ' \u2021' : ''}`
                      : '\u2014'}
                  </td>
                );

                return (
                  <tr key={result.exposureVar}>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">
                      {result.exposureLabel}
                      <span className="block text-xs font-normal text-gray-500">
                        {result.exposedValue} vs. {result.referenceValue}
                      </span>
                      {result.otherLevels > 0 && (
                        <span className="block text-xs font-normal text-amber-700">
                          {result.otherLevels} in other categories not included
                        </span>
                      )}
                    </td>
                    {studyDesign === 'cohort' ? (
                      <>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.table.a}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.totalExposed}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900 border-r border-gray-200">
                          {formatStatPercent(r.attackRateExposed * 100, r.total)}%
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.table.c}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.totalUnexposed}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900 border-r border-gray-200">
                          {formatStatPercent(r.attackRateUnexposed * 100, r.total)}%
                        </td>
                        <td className="px-3 py-2 text-sm text-center font-semibold text-gray-900">
                          {formatMeasure(measure)}
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-500 border-r border-gray-200 whitespace-nowrap">
                          {formatCI(ci)}
                        </td>
                        {pValueCell}
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">
                          {r.table.a} ({r.totalDisease > 0 ? `${formatStatPercent((r.table.a / r.totalDisease) * 100, r.total)}%` : '—'})
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">
                          {r.table.b} ({r.totalNoDisease > 0 ? `${formatStatPercent((r.table.b / r.totalNoDisease) * 100, r.total)}%` : '—'})
                        </td>
                        <td className="px-3 py-2 text-sm text-center font-semibold text-gray-900 whitespace-nowrap">
                          {formatMeasure(measure)}{corrected ? ' \u2020' : ''}
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-500 whitespace-nowrap">
                          {formatCI(ci)}
                        </td>
                        {pValueCell}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 space-y-1">
          <p>
            {studyDesign === 'cohort'
              ? 'Risk ratios (cohort design). Attack rate = number ill ÷ total in that group. RR = risk ratio: the attack rate in the exposed divided by the attack rate in the comparison group, with a 95% confidence interval (log method).'
              : 'Odds ratios (case-control design). Percentages are of the cases, and of the controls, with a recorded exposure, so their denominators can be smaller than the totals in the headings. OR = odds ratio, with a 95% confidence interval (Woolf method).'}
          </p>
          {anyCorrectedOR && (
            <p>
              † A cell of this 2×2 table is zero, so the odds ratio cannot be calculated directly. The OR and CI shown add 0.5 to every cell (Haldane-Anscombe correction) and are approximate.
            </p>
          )}
          <p>
            p-values are from the chi-square test with Yates’ continuity correction{anyFisher ? ', except where marked ‡' : ''}.
            {anyFisher && ' ‡ Fisher’s exact test (two-sided), shown instead because at least one expected cell count is below 5, where chi-square is unreliable.'}
          </p>
          <p>
            Each exposure is analysed on its own (unadjusted). Records with a missing exposure or outcome, or in a category other than the two being compared, are left out of that row.
          </p>
        </div>
      </div>
    );
  };


  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* TabHeader */}
      <TabHeader
        title="2×2 Tables"
        description="Compare exposure and outcome with a 2×2 table and measures of association."
      />

      {/* Filter Data */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Filter Data (optional)</h4>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Filter by</label>
          <select
            value={filterBy}
            onChange={(e) => {
              // A new filter variable starts with nothing selected
              setFilterBy(e.target.value);
              setSelectedFilterValues(new Set());
              setShowAllFilterValues(false);
            }}
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
              <div className="space-y-1 max-h-32 overflow-auto">
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
        {filterBy && selectedFilterValues.size > 0 && (
          <div className="mt-2 text-xs text-gray-600">
            Showing <span className="font-medium">{filteredRecords.length}</span> of {dataset.records.length} records
          </div>
        )}
      </div>

      {/* Study Design Selector */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 mb-3">Analysis Type</label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="studyDesign"
              value="cohort"
              checked={studyDesign === 'cohort'}
              onChange={() => setStudyDesign('cohort')}
              className="w-4 h-4 text-gray-700 focus:ring-gray-500"
            />
            <span className="text-sm text-gray-900">Cohort design (attack rates, risk ratios)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="studyDesign"
              value="case-control"
              checked={studyDesign === 'case-control'}
              onChange={() => setStudyDesign('case-control')}
              className="w-4 h-4 text-gray-700 focus:ring-gray-500"
            />
            <span className="text-sm text-gray-900">Case-control design (odds ratios)</span>
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {studyDesign === 'cohort' && 'Compare attack rates between exposed and unexposed groups.'}
          {studyDesign === 'case-control' && 'Compare odds of exposure between cases and controls.'}
        </p>
      </div>

      {/* Outcome Variable */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Outcome Variable</h4>
          <p className="text-xs text-gray-600 mb-3">
            <strong>Select the variable that defines your outcome of interest</strong> (e.g., illness status, case status). Then choose which values represent a "case" (e.g., "Yes", "Confirmed", "Probable"). The remaining values will be treated as non-cases or controls.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Variable
              </label>
              <select
                value={outcomeVar}
                onChange={(e) => {
                  setOutcomeVar(e.target.value);
                  setCaseValues(new Set());
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
              >
                <option value="">Select variable...</option>
                {caseDefinitionColumns.map(col => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </select>
            </div>
            {outcomeVar && outcomeLevels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Values that count as a case
                </label>
                <div className="flex flex-wrap gap-2">
                  {outcomeLevels.map(level => {
                    const checked = caseKeys.has(level.key);
                    return (
                      <label
                        key={level.key}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors ${
                          checked
                            ? 'bg-gray-700 text-white'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            // Compared by level, so a saved "yes" unticks "Yes"
                            const newSet = new Set(
                              Array.from(caseValues).filter(v => levelKey(v) !== level.key)
                            );
                            if (e.target.checked) newSet.add(level.label);
                            setCaseValues(newSet);
                          }}
                          className="sr-only"
                        />
                        {level.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {outcomeVar && caseKeys.size > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-sm text-gray-700">
                <strong>{totalCases}</strong> cases identified out of <strong>{filteredRecords.length}</strong> records
                ({formatStatPercent((totalCases / filteredRecords.length) * 100, filteredRecords.length)}%)
              </div>
              {/* Case/Control mapping display */}
              {outcomeLevels.length > 0 && (
                <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Value Mapping</div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">{studyDesign === 'case-control' ? 'Case:' : 'Ill:'}</span>
                      <span className="text-gray-600">
                        {outcomeLevels.filter(l => caseKeys.has(l.key)).map(l => l.label).join(', ') || '(none)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">{studyDesign === 'case-control' ? 'Control:' : 'Not Ill:'}</span>
                      <span className="text-gray-600">
                        {outcomeLevels.filter(l => !caseKeys.has(l.key)).map(l => l.label).join(', ') || '(none)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {outcomeVar && caseKeys.size === 0 && (
            <div className="mt-3 text-sm text-gray-600">
              Please select which values count as cases
          </div>
        )}
          {!outcomeVar && caseDefinitionColumns.length > 0 && (
            <div className="mt-3 text-sm text-gray-600">
              Choose the variable that records who became ill (or who is a case). LineList only pre-selects one when a column&rsquo;s name and values make it clear.
            </div>
          )}
      </div>

      {/* Exposure Selection */}
      {outcomeVar && caseKeys.size > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Exposure Variables</h4>
          <p className="text-xs text-gray-600 mb-3">
            <strong>Select one or more exposure variables to analyze.</strong> For each selected variable, check the dropdown that says which value is the <strong>&ldquo;exposed&rdquo;</strong> group. Common codings (Yes/No, Y/N, Oui/Non, Sí/No, 1/0, True/False) are recognised; anything else you choose yourself. For variables with more than two values, a second dropdown sets the <strong>comparison group</strong> &mdash; only those two groups are compared, and both are named in the results.
          </p>
          <div className="flex flex-wrap gap-2">
            {exposureColumns.map(col => {
              const isSelected = selectedExposures.includes(col.key);
              const setup = exposureSetups.get(col.key);
              const levels = setup?.levels ?? [];
              const exposed = setup?.exposed ?? null;
              const reference = setup?.reference ?? null;

              return (
                <div key={col.key} className="relative group">
                  <button
                    onClick={() => toggleExposure(col.key)}
                    aria-pressed={isSelected}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span className={`w-4 h-4 flex items-center justify-center rounded ${isSelected ? 'bg-gray-600' : 'bg-gray-300'}`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                    {col.label}
                  </button>
                  {isSelected && (
                    <div className="mt-1 flex flex-col gap-1">
                      <select
                        value={exposed?.label ?? ''}
                        onChange={(e) => updateExposedValue(col.key, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Exposed value for ${col.label}`}
                        className={`text-xs px-2 py-1 border rounded focus:ring-1 focus:ring-gray-500 ${
                          exposed ? 'border-gray-300' : 'border-amber-500 bg-amber-50'
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
                          onChange={(e) => updateReferenceValue(col.key, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Comparison group for ${col.label}`}
                          className={`text-xs px-2 py-1 border rounded focus:ring-1 focus:ring-gray-500 ${
                            reference ? 'border-gray-300' : 'border-amber-500 bg-amber-50'
                          }`}
                        >
                          {!reference && <option value="">Choose comparison group…</option>}
                          {levels.filter(level => level.key !== exposed.key).map(level => (
                            <option key={level.key} value={level.label}>{level.label} = Comparison</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {selectedExposures.length > 0 && (
            <div className="mt-3 text-sm text-gray-600">
              {selectedExposures.length} exposure{selectedExposures.length !== 1 ? 's' : ''} selected
            </div>
          )}
          {exposuresNeedingChoice.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900" role="status">
              <p className="font-medium">
                No result is shown yet for: {exposuresNeedingChoice.map(e => e.label).join(', ')}
              </p>
              <p className="mt-1 text-xs">
                LineList could not tell from the values which one means &ldquo;exposed&rdquo; (or which group to compare it with). Choose it in the dropdown under the variable; guessing could turn the result upside down.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {exposureResults.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900">Summary Table</h4>
          {renderSummaryTable()}

          {/* Interpretation of the first row, in the terms of what the table shows */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">How to Interpret Your Results</h5>
            {(() => {
              const firstResult = exposureResults[0];
              const labels = {
                exposure: firstResult.exposureLabel,
                exposed: firstResult.exposedValue,
                reference: firstResult.referenceValue,
              };
              const sentences = studyDesign === 'cohort'
                ? interpretCohort(firstResult.results, labels)
                : interpretCaseControl(firstResult.results, labels);

              return (
                <p className="text-sm text-gray-700 leading-relaxed">
                  <strong>Example interpretation using {firstResult.exposureLabel}:</strong> {sentences.join(' ')}
                </p>
              );
            })()}
          </div>

          {/* Results Actions */}
          <ResultsActions
            actions={[
              {
                label: 'Export Dataset CSV',
                onClick: exportDatasetCSV,
                icon: ExportIcons.csv,
                variant: 'secondary',
              },
            ]}
          />
        </div>
      )}

      {outcomeVar && caseKeys.size > 0 && selectedExposures.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          Select one or more exposure variables to see the analysis
        </div>
      )}

      {(!outcomeVar || caseKeys.size === 0) && (
        <div className="text-center py-8 text-gray-400">
          Define the outcome variable above to begin analysis
        </div>
      )}

      {/* Help Panel */}
      <HelpPanel title="Tutorial: 2×2 Tables">
        <TwoByTwoTutorial />
      </HelpPanel>
    </div>
  );
}
