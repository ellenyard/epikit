import { useState, useMemo, useEffect } from 'react';
import type { Dataset, CaseRecord } from '../../types/analysis';
import { calculateTwoByTwo, calculateCrossTabulation } from '../../utils/statistics';
import type { TwoByTwoResults, CrossTabResults } from '../../utils/statistics';
import { TwoByTwoTutorial } from '../tutorials/TwoByTwoTutorial';
import { TabHeader, HelpPanel, ResultsActions, ExportIcons } from '../shared';

interface TwoByTwoAnalysisProps {
  dataset: Dataset;
  initialExposure?: string;
}

type StudyDesign = 'cohort' | 'case-control' | 'group-comparison';

interface ExposureResult {
  exposureVar: string;
  exposureLabel: string;
  exposedValue: string;
  results: TwoByTwoResults;
}

export function TwoByTwoAnalysis({ dataset, initialExposure }: TwoByTwoAnalysisProps) {
  // Study design
  const [studyDesign, setStudyDesign] = useState<StudyDesign>('cohort');

  // Outcome/case definition (like Attack Rates pattern)
  const [outcomeVar, setOutcomeVar] = useState<string>('');
  const [caseValues, setCaseValues] = useState<Set<string>>(new Set());

  // Multi-exposure selection (for cohort/case-control)
  const [selectedExposures, setSelectedExposures] = useState<string[]>([]);
  // For each exposure, store which value means "exposed" (default to "Yes")
  const [exposurePositiveValues, setExposurePositiveValues] = useState<Record<string, string>>({});

  // Compare Proportions: characteristic (rows) and column (groups) variables
  const [groupVar, setGroupVar] = useState<string>('');
  const [colVar, setColVar] = useState<string>('');

  // Get columns suitable for case definition (categorical columns)
  const caseDefinitionColumns = useMemo(() => {
    return dataset.columns.filter(col => {
      if (col.type === 'number' && !col.key.toLowerCase().includes('age')) return false;
      if (col.type === 'date') return false;
      if (col.key === 'id' || col.key === 'case_id' || col.key === 'participant_id') return false;
      if (col.key.includes('latitude') || col.key.includes('longitude')) return false;

      // Check number of unique values
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
      if (col.key === outcomeVar) return false; // Don't show outcome var as exposure option

      // Check number of unique values (for categorical exposure)
      const uniqueValues = new Set(dataset.records.map(r => r[col.key])).size;
      return uniqueValues >= 2 && uniqueValues <= 20;
    });
  }, [dataset, outcomeVar]);

  // Auto-detect outcome variable on mount
  useEffect(() => {
    if (!outcomeVar && caseDefinitionColumns.length > 0) {
      // Try to find common case-related columns
      const commonCaseColumns = ['ill', 'case_status', 'case', 'status', 'outcome'];
      const found = caseDefinitionColumns.find(col =>
        commonCaseColumns.some(name => col.key.toLowerCase().includes(name))
      );
      if (found) {
        setOutcomeVar(found.key);
        // Auto-select likely case values
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
    }
  }, [caseDefinitionColumns, dataset.records, outcomeVar]);

  // Auto-select initial exposure when provided from parent (e.g., from Variable Explorer)
  useEffect(() => {
    if (initialExposure && exposureColumns.some(col => col.key === initialExposure)) {
      if (!selectedExposures.includes(initialExposure)) {
        setSelectedExposures(prev => [...prev, initialExposure]);
        // Set default exposed value
        if (!exposurePositiveValues[initialExposure]) {
          const values = new Set<string>();
          dataset.records.forEach(r => {
            const v = r[initialExposure];
            if (v !== null && v !== undefined && v !== '') {
              values.add(String(v));
            }
          });
          const valuesArray = Array.from(values).sort();
          const positiveKeywords = ['yes', 'true', '1', 'positive', 'exposed'];
          const found = valuesArray.find(v =>
            positiveKeywords.some(kw => v.toLowerCase() === kw)
          );
          const defaultValue = found || valuesArray[0] || '';
          if (defaultValue) {
            setExposurePositiveValues(prev => ({ ...prev, [initialExposure]: defaultValue }));
          }
        }
      }
    }
  }, [initialExposure, exposureColumns, selectedExposures, exposurePositiveValues, dataset.records]);

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

  // Auto-detect "Yes" as exposed value for an exposure
  const detectExposedValue = (expVar: string): string => {
    const values = getExposureValues(expVar);
    // Try common positive indicators
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

  // Export dataset with only the records used in the current analysis
  const exportDatasetCSV = () => {
    if (!outcomeVar || caseValues.size === 0 || selectedExposures.length === 0) return;

    // Filter to only records with valid outcome and at least one valid exposure
    const analysisRecords = dataset.records.filter(record => {
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
  };

  // Calculate 2x2 results for each selected exposure
  const exposureResults: ExposureResult[] = useMemo(() => {
    if (!outcomeVar || caseValues.size === 0 || selectedExposures.length === 0) {
      return [];
    }

    const results = selectedExposures.map(expVar => {
      const exposedValue = exposurePositiveValues[expVar] || detectExposedValue(expVar);
      let a = 0, b = 0, c = 0, d = 0;

      dataset.records.forEach((record: CaseRecord) => {
        const expValue = record[expVar];

        // Skip records with missing exposure values
        if (expValue === null || expValue === undefined || expValue === '') {
          return;
        }

        const exposed = String(expValue) === exposedValue;
        const diseased = isCase(record);

        if (exposed && diseased) a++;
        else if (exposed && !diseased) b++;
        else if (!exposed && diseased) c++;
        else if (!exposed && !diseased) d++;
      });

      const results = calculateTwoByTwo({ a, b, c, d });
      const col = dataset.columns.find(c => c.key === expVar);

      return {
        exposureVar: expVar,
        exposureLabel: col?.label || expVar,
        exposedValue,
        results,
      };
    });

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
  }, [dataset.records, dataset.columns, outcomeVar, caseValues, selectedExposures, exposurePositiveValues, studyDesign]);

  // Count total cases
  const totalCases = useMemo(() => {
    return dataset.records.filter(isCase).length;
  }, [dataset.records, outcomeVar, caseValues]);

  // Calculate cross-tabulation results (for group-comparison study design)
  const crossTabResults: CrossTabResults | null = useMemo(() => {
    if (studyDesign !== 'group-comparison' || !colVar || !groupVar) {
      return null;
    }

    const data: { rowValue: string; colValue: string }[] = [];

    dataset.records.forEach((record: CaseRecord) => {
      const rowValue = record[groupVar];
      const colValue = record[colVar];
      // Skip records with missing values
      if (rowValue === null || rowValue === undefined || rowValue === '' ||
          colValue === null || colValue === undefined || colValue === '') {
        return;
      }

      data.push({
        rowValue: String(rowValue),
        colValue: String(colValue),
      });
    });

    if (data.length === 0) return null;

    return calculateCrossTabulation(data);
  }, [studyDesign, dataset.records, colVar, groupVar]);

  const formatNumber = (n: number, decimals: number = 2): string => {
    if (!isFinite(n)) return 'Undefined';
    return n.toFixed(decimals);
  };

  // Format to significant figures
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

  const formatCI = (ci: [number, number]): string => {
    if (!isFinite(ci[0]) || !isFinite(ci[1])) return '(Undefined)';
    return `(${ci[0].toFixed(2)} - ${ci[1].toFixed(2)})`;
  };

  // Toggle exposure selection
  const toggleExposure = (expVar: string) => {
    setSelectedExposures(prev => {
      if (prev.includes(expVar)) {
        return prev.filter(v => v !== expVar);
      } else {
        // Set default exposed value when adding
        if (!exposurePositiveValues[expVar]) {
          const defaultValue = detectExposedValue(expVar);
          setExposurePositiveValues(p => ({ ...p, [expVar]: defaultValue }));
        }
        return [...prev, expVar];
      }
    });
  };

  // Update exposed value for a specific exposure
  const updateExposedValue = (expVar: string, value: string) => {
    setExposurePositiveValues(prev => ({ ...prev, [expVar]: value }));
  };

  // Render summary table for multiple exposures
  const renderSummaryTable = () => {
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
                    <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      Exposed
                    </th>
                    <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      Not Exposed
                    </th>
                    <th colSpan={2} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Attack rate ratio
                    </th>
                  </tr>
                  {/* Second header row - individual columns */}
                  <tr>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      # Ill
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      <div className="flex items-center justify-center gap-1">
                        <span>Attack Rate</span>
                        <div className="group relative">
                          <svg className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <div className="invisible group-hover:visible absolute z-10 w-64 p-2 mt-1 text-xs font-normal normal-case bg-gray-900 text-white rounded shadow-lg -left-28">
                            CDC Definition: The proportion of exposed persons who became ill during the outbreak period. Calculated as: (# Ill among Exposed / Total Exposed) × 100. In outbreak settings, attack rate is often used as a synonym for risk.
                          </div>
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      # Ill
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      <div className="flex items-center justify-center gap-1">
                        <span>Attack Rate</span>
                        <div className="group relative">
                          <svg className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <div className="invisible group-hover:visible absolute z-10 w-64 p-2 mt-1 text-xs font-normal normal-case bg-gray-900 text-white rounded shadow-lg -left-28">
                            CDC Definition: The proportion of unexposed persons who became ill during the outbreak period. Calculated as: (# Ill among Unexposed / Total Unexposed) × 100. In outbreak settings, attack rate is often used as a synonym for risk.
                          </div>
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-center gap-1">
                        <span>ARR</span>
                        <div className="group relative">
                          <svg className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <div className="invisible group-hover:visible absolute z-10 w-72 p-2 mt-1 text-xs font-normal normal-case bg-gray-900 text-white rounded shadow-lg -left-32">
                            CDC Definition: Attack Rate Ratio (also called Risk Ratio or Relative Risk) compares the risk of illness between exposed and unexposed groups. Calculated as: Attack Rate (Exposed) / Attack Rate (Unexposed). An ARR &gt; 1.0 indicates increased risk for the exposed group; ARR &lt; 1.0 suggests the exposure may be protective.
                          </div>
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      95% CI
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
                      <span>CASES (n={exposureResults.length > 0 ? exposureResults[0].results.totalDisease : 0})</span>
                      <div className="group relative">
                        <svg className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="invisible group-hover:visible absolute z-10 w-64 p-2 mt-1 text-xs font-normal normal-case bg-gray-900 text-white rounded shadow-lg -left-28">
                          The number and percentage of cases with each exposure level. The percentage represents the proportion of all cases that were exposed.
                        </div>
                      </div>
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-1">
                      <span>CONTROLS (n={exposureResults.length > 0 ? exposureResults[0].results.totalNoDisease : 0})</span>
                      <div className="group relative">
                        <svg className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="invisible group-hover:visible absolute z-10 w-64 p-2 mt-1 text-xs font-normal normal-case bg-gray-900 text-white rounded shadow-lg -left-28">
                          The number and percentage of controls with each exposure level. The percentage represents the proportion of all controls that were exposed.
                        </div>
                      </div>
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    OR
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    95% CI
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {exposureResults.map((result) => {
                const r = result.results;
                const isSignificant = r.chiSquarePValue < 0.05;
                const measure = studyDesign === 'cohort' ? r.riskRatio : r.oddsRatio;
                const ci = studyDesign === 'cohort' ? r.riskRatioCI : r.oddsRatioCI;

                return (
                  <tr key={result.exposureVar}>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">
                      {result.exposureLabel}
                      <span className="text-xs text-gray-500 ml-1">({result.exposedValue})</span>
                    </td>
                    {studyDesign === 'cohort' ? (
                      <>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.table.a}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.totalExposed}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900 border-r border-gray-200">
                          {formatPercent(r.attackRateExposed * 100, r.total)}%
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.table.c}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.totalUnexposed}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900 border-r border-gray-200">
                          {formatPercent(r.attackRateUnexposed * 100, r.total)}%
                        </td>
                        <td className={`px-3 py-2 text-sm text-center font-semibold ${isSignificant ? 'text-gray-900' : 'text-gray-900'}`}>
                          {formatNumber(measure)}
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-500">
                          {formatCI(ci)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">
                          {r.table.a} ({formatPercent((r.table.a / r.totalDisease) * 100, r.total)}%)
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">
                          {r.table.b} ({formatPercent((r.table.b / r.totalNoDisease) * 100, r.total)}%)
                        </td>
                        <td className={`px-3 py-2 text-sm text-center font-semibold ${isSignificant ? 'text-gray-900' : 'text-gray-900'}`}>
                          {formatNumber(measure)}
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-500">
                          {formatCI(ci)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
          {studyDesign === 'cohort'
            ? 'AR = Attack Rate (Row %), RR = Risk Ratio. These are bivariate risk ratios (associations were run one at a time).'
            : 'Percentages are column percentages. OR = Odds Ratio. These are bivariate odds ratios (associations were run one at a time).'}
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
            <span className="text-sm text-gray-900">Cohort (Attack Rates)</span>
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
            <span className="text-sm text-gray-900">Case-Control (Odds Ratios)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="studyDesign"
              value="group-comparison"
              checked={studyDesign === 'group-comparison'}
              onChange={() => setStudyDesign('group-comparison')}
              className="w-4 h-4 text-gray-700 focus:ring-gray-500"
            />
            <span className="text-sm text-gray-900">Compare Proportions</span>
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {studyDesign === 'cohort' && 'Compare attack rates between exposed and unexposed groups.'}
          {studyDesign === 'case-control' && 'Compare odds of exposure between cases and controls.'}
          {studyDesign === 'group-comparison' && 'Compare outcome proportions across multiple groups (e.g., age groups, regions).'}
        </p>
      </div>

      {/* Outcome Variable - for Cohort/Case-Control only */}
      {studyDesign !== 'group-comparison' && (
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
            {outcomeVar && outcomeValues.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Values that count as a case
                </label>
                <div className="flex flex-wrap gap-2">
                  {outcomeValues.map(value => (
                    <label
                      key={value}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors ${
                        caseValues.has(value)
                          ? 'bg-gray-700 text-white'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={caseValues.has(value)}
                        onChange={(e) => {
                          const newSet = new Set(caseValues);
                          if (e.target.checked) {
                            newSet.add(value);
                          } else {
                            newSet.delete(value);
                          }
                          setCaseValues(newSet);
                        }}
                        className="sr-only"
                      />
                      {value}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {outcomeVar && caseValues.size > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-sm text-gray-700">
                <strong>{totalCases}</strong> cases identified out of <strong>{dataset.records.length}</strong> records
                ({formatPercent((totalCases / dataset.records.length) * 100, dataset.records.length)}%)
              </div>
              {/* Case/Control mapping display */}
              {outcomeValues.length > 0 && (
                <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Value Mapping</div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">{studyDesign === 'case-control' ? 'Case:' : 'Ill:'}</span>
                      <span className="text-gray-600">{Array.from(caseValues).join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">{studyDesign === 'case-control' ? 'Control:' : 'Not Ill:'}</span>
                      <span className="text-gray-600">
                        {outcomeValues.filter(v => !caseValues.has(v)).join(', ') || '(none)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {outcomeVar && caseValues.size === 0 && (
            <div className="mt-3 text-sm text-gray-600">
              Please select which values count as cases
          </div>
        )}
        </div>
      )}

      {/* Column (Groups) Variable - for Compare Proportions only */}
      {studyDesign === 'group-comparison' && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Column (Groups)</h4>
          <p className="text-xs text-gray-600 mb-3">
            <strong>Select the variable for column groups</strong> (e.g., severity, outcome status). All values of this variable will be displayed as columns in the table.
          </p>
          <select
            value={colVar}
            onChange={(e) => setColVar(e.target.value)}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
          >
            <option value="">Select column variable...</option>
            {caseDefinitionColumns
              .filter(col => col.key !== groupVar) // Exclude row variable
              .map(col => {
                const uniqueValues = new Set(dataset.records.map(r => r[col.key])).size;
                return (
                  <option key={col.key} value={col.key}>
                    {col.label} ({uniqueValues} groups)
                  </option>
                );
              })}
          </select>
          {colVar && (
            <div className="mt-3 text-sm text-gray-600">
              Column groups: {Array.from(new Set(dataset.records.map(r => r[colVar]).filter(v => v !== null && v !== undefined && v !== ''))).sort().join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Exposure Selection (for cohort/case-control) */}
      {outcomeVar && caseValues.size > 0 && studyDesign !== 'group-comparison' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Exposure Variables</h4>
          <p className="text-xs text-gray-600 mb-3">
            <strong>Select one or more exposure variables to analyze.</strong> For each selected variable, use the dropdown to specify which value should be treated as the <strong>"exposed"</strong> group (e.g., "Yes" for ate the food, or the specific food item). The other values will be grouped as "unexposed."
          </p>
          <div className="flex flex-wrap gap-2">
            {exposureColumns.map(col => {
              const isSelected = selectedExposures.includes(col.key);
              const exposedValue = exposurePositiveValues[col.key] || detectExposedValue(col.key);
              const values = getExposureValues(col.key);

              return (
                <div key={col.key} className="relative group">
                  <button
                    onClick={() => toggleExposure(col.key)}
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
                    <div className="mt-1">
                      <select
                        value={exposedValue}
                        onChange={(e) => updateExposedValue(col.key, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-gray-500"
                      >
                        {values.map(v => (
                          <option key={v} value={v}>{v} = Exposed</option>
                        ))}
                      </select>
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
        </div>
      )}

      {/* Characteristic Variable Selection (for group-comparison) */}
      {colVar && studyDesign === 'group-comparison' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Characteristic (Rows)</h4>
          <p className="text-xs text-gray-600 mb-3">
            <strong>Select the characteristic to compare across</strong> (e.g., age group, sex, region).
            The analysis will compare proportions across all values of this characteristic.
          </p>
          <select
            value={groupVar}
            onChange={(e) => setGroupVar(e.target.value)}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
          >
            <option value="">Select row variable...</option>
            {caseDefinitionColumns
              .filter(col => col.key !== colVar) // Exclude column variable
              .map(col => {
                const uniqueValues = new Set(dataset.records.map(r => r[col.key])).size;
                return (
                  <option key={col.key} value={col.key}>
                    {col.label} ({uniqueValues} groups)
                  </option>
                );
              })}
          </select>
          {groupVar && (
            <div className="mt-3 text-sm text-gray-600">
              Row groups: {Array.from(new Set(dataset.records.map(r => r[groupVar]).filter(v => v !== null && v !== undefined && v !== ''))).sort().join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Results for Cohort/Case-Control */}
      {exposureResults.length > 0 && studyDesign !== 'group-comparison' && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900">Summary Table</h4>
          {renderSummaryTable()}

          {/* Interpretation Example for Cohort Studies */}
          {studyDesign === 'cohort' && exposureResults.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h5 className="text-sm font-semibold text-gray-900 mb-2">How to Interpret Your Results</h5>
              {(() => {
                const firstResult = exposureResults[0];
                const arr = firstResult.results.riskRatio;
                const ci = firstResult.results.riskRatioCI;
                const exposureName = firstResult.exposureLabel.toLowerCase();
                const exposedValue = firstResult.exposedValue;
                const isSignificant = firstResult.results.chiSquarePValue < 0.05;
                const ciIncludesOne = ci[0] <= 1.0 && ci[1] >= 1.0;

                return (
                  <p className="text-sm text-gray-700 leading-relaxed">
                    <strong>Example interpretation using {firstResult.exposureLabel}:</strong> The attack rate ratio (ARR) for {exposureName} is {formatNumber(arr)} with a 95% CI of {formatCI(ci)}.
                    This means that people who were exposed to {exposureName} ({exposedValue}) were {formatNumber(arr)} times {arr > 1 ? 'more' : 'less'} likely to become ill compared to those who were not exposed.
                    The 95% confidence interval {formatCI(ci)} {ciIncludesOne ? 'includes' : 'does not include'} 1.0, indicating this association is {isSignificant ? 'statistically significant (p < 0.05)' : 'not statistically significant (p ≥ 0.05)'}.
                    This suggests a {arr > 2 ? 'strong' : arr > 1.5 ? 'moderate' : arr > 1 ? 'weak' : ''} {arr > 1 ? 'positive association' : arr < 1 ? 'protective effect' : 'no association'} between the exposure and illness.
                    An ARR greater than 1.0 indicates increased risk, while an ARR less than 1.0 suggests the exposure may be protective.
                    The confidence interval tells us the range of plausible values for the true ARR in the population.
                  </p>
                );
              })()}
            </div>
          )}

          {/* Interpretation Example for Case-Control Studies */}
          {studyDesign === 'case-control' && exposureResults.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h5 className="text-sm font-semibold text-gray-900 mb-2">How to Interpret Your Results</h5>
              {(() => {
                const firstResult = exposureResults[0];
                const or = firstResult.results.oddsRatio;
                const ci = firstResult.results.oddsRatioCI;
                const exposureName = firstResult.exposureLabel.toLowerCase();
                const exposedValue = firstResult.exposedValue;
                const isSignificant = firstResult.results.chiSquarePValue < 0.05;
                const ciIncludesOne = ci[0] <= 1.0 && ci[1] >= 1.0;

                return (
                  <p className="text-sm text-gray-700 leading-relaxed">
                    <strong>Example interpretation using {firstResult.exposureLabel}:</strong> The odds ratio (OR) for {exposureName} is {formatNumber(or)} with a 95% CI of {formatCI(ci)}.
                    This means that cases had {formatNumber(or)} times the odds of being exposed to {exposureName} ({exposedValue}) compared to controls.
                    The 95% confidence interval {formatCI(ci)} {ciIncludesOne ? 'includes' : 'does not include'} 1.0, indicating this association is {isSignificant ? 'statistically significant (p < 0.05)' : 'not statistically significant (p ≥ 0.05)'}.
                    This suggests a {or > 3 ? 'strong' : or > 2 ? 'moderate' : or > 1 ? 'weak' : ''} {or > 1 ? 'positive association' : or < 1 ? 'protective effect' : 'no association'} between the exposure and illness.
                    An OR greater than 1.0 indicates that cases had higher odds of exposure (suggesting the exposure may increase risk),
                    while an OR less than 1.0 suggests cases had lower odds of exposure (suggesting the exposure may be protective).
                    The confidence interval tells us the range of plausible values for the true OR in the population.
                  </p>
                );
              })()}
            </div>
          )}

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

      {/* Results for Compare Proportions */}
      {crossTabResults && studyDesign === 'group-comparison' && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900">Cross-Tabulation Results</h4>

          {/* Cross-Tab Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dataset.columns.find(c => c.key === groupVar)?.label || 'Characteristic'}
                    </th>
                    {crossTabResults.columnValues.map(colValue => (
                      <th key={colValue} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {colValue}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {crossTabResults.rows.map((row) => (
                    <tr key={row.rowValue}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {row.rowValue}
                      </td>
                      {crossTabResults.columnValues.map(colValue => (
                        <td key={colValue} className="px-4 py-3 text-sm text-center text-gray-900">
                          {row.counts[colValue]}
                          <span className="text-gray-500 text-xs ml-1">
                            ({row.total > 0 ? formatPercent((row.counts[colValue] / row.total) * 100, crossTabResults.grandTotal) : 0}%)
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm text-center text-gray-900 border-l border-gray-200">
                        {row.total}
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="bg-gray-50 font-medium">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      Total
                    </td>
                    {crossTabResults.columnValues.map(colValue => (
                      <td key={colValue} className="px-4 py-3 text-sm text-center text-gray-900">
                        {crossTabResults.columnTotals[colValue]}
                        <span className="text-gray-500 text-xs ml-1">
                          ({crossTabResults.grandTotal > 0 ? formatPercent((crossTabResults.columnTotals[colValue] / crossTabResults.grandTotal) * 100, crossTabResults.grandTotal) : 0}%)
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-3 text-sm text-center text-gray-900 border-l border-gray-200">
                      {crossTabResults.grandTotal}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
              Row percentages shown in parentheses
            </div>
          </div>

          {/* Chi-Square Results */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-3">Statistical Test</h5>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(crossTabResults.chiSquare.chiSquare)}
                </p>
                <p className="text-xs text-gray-500">Chi-Square</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {crossTabResults.chiSquare.degreesOfFreedom}
                </p>
                <p className="text-xs text-gray-500">Degrees of Freedom</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${crossTabResults.chiSquare.pValue < 0.05 ? 'text-green-600' : 'text-gray-900'}`}>
                  {crossTabResults.chiSquare.pValue < 0.001 ? '< 0.001' : formatNumber(crossTabResults.chiSquare.pValue, 3)}
                </p>
                <p className="text-xs text-gray-500">p-value</p>
              </div>
            </div>
          </div>

          {/* Interpretation */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">How to Interpret Your Results</h5>
            <p className="text-sm text-gray-700 leading-relaxed">
              The chi-square test examines whether there is a significant association between {dataset.columns.find(c => c.key === groupVar)?.label || 'the row variable'} and {dataset.columns.find(c => c.key === colVar)?.label || 'the column variable'}.
              {crossTabResults.chiSquare.pValue < 0.05 ? (
                <span>
                  {' '}The p-value ({crossTabResults.chiSquare.pValue < 0.001 ? '< 0.001' : formatNumber(crossTabResults.chiSquare.pValue, 3)}) is less than 0.05,
                  indicating a <strong>statistically significant association</strong> between the variables.
                  The distribution of column values differs across the row categories.
                </span>
              ) : (
                <span>
                  {' '}The p-value ({formatNumber(crossTabResults.chiSquare.pValue, 3)}) is greater than 0.05,
                  indicating <strong>no statistically significant association</strong> between the variables.
                  The observed differences could be due to chance.
                </span>
              )}
            </p>
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

      {outcomeVar && caseValues.size > 0 && studyDesign !== 'group-comparison' && selectedExposures.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          Select one or more exposure variables to see the analysis
        </div>
      )}

      {studyDesign === 'group-comparison' && colVar && !groupVar && (
        <div className="text-center py-8 text-gray-400">
          Select a characteristic (row variable) to see the comparison
        </div>
      )}

      {studyDesign === 'group-comparison' && !colVar && (
        <div className="text-center py-8 text-gray-400">
          Select a column variable to begin
        </div>
      )}

      {studyDesign !== 'group-comparison' && (!outcomeVar || caseValues.size === 0) && (
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
