import { useState, useMemo, useEffect } from 'react';
import type { Dataset, CaseRecord } from '../../types/analysis';
import { calculateTwoByTwo } from '../../utils/statistics';
import type { TwoByTwoResults } from '../../utils/statistics';

interface TwoByTwoAnalysisProps {
  dataset: Dataset;
}

type StudyDesign = 'cohort' | 'case-control';

interface ExposureResult {
  exposureVar: string;
  exposureLabel: string;
  exposedValue: string;
  results: TwoByTwoResults;
}

export function TwoByTwoAnalysis({ dataset }: TwoByTwoAnalysisProps) {
  // Study design
  const [studyDesign, setStudyDesign] = useState<StudyDesign>('cohort');

  // Outcome/case definition (like Attack Rates pattern)
  const [outcomeVar, setOutcomeVar] = useState<string>('');
  const [caseValues, setCaseValues] = useState<Set<string>>(new Set());

  // Multi-exposure selection
  const [selectedExposures, setSelectedExposures] = useState<string[]>([]);
  // For each exposure, store which value means "exposed" (default to "Yes")
  const [exposurePositiveValues, setExposurePositiveValues] = useState<Record<string, string>>({});

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

  // Calculate 2x2 results for each selected exposure
  const exposureResults: ExposureResult[] = useMemo(() => {
    if (!outcomeVar || caseValues.size === 0 || selectedExposures.length === 0) {
      return [];
    }

    return selectedExposures.map(expVar => {
      const exposedValue = exposurePositiveValues[expVar] || detectExposedValue(expVar);
      let a = 0, b = 0, c = 0, d = 0;

      dataset.records.forEach((record: CaseRecord) => {
        const exposed = String(record[expVar]) === exposedValue;
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
  }, [dataset.records, dataset.columns, outcomeVar, caseValues, selectedExposures, exposurePositiveValues]);

  // Count total cases
  const totalCases = useMemo(() => {
    return dataset.records.filter(isCase).length;
  }, [dataset.records, outcomeVar, caseValues]);

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

  const formatPValue = (p: number): string => {
    if (p < 0.001) return '< 0.001';
    return p.toFixed(4);
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

  // Render single exposure detailed view
  const renderDetailedView = (result: ExposureResult) => {
    const results = result.results;
    const outcomeLabel = dataset.columns.find(c => c.key === outcomeVar)?.label || outcomeVar;
    const caseLabel = Array.from(caseValues).join(', ');

    return (
      <div className="space-y-6">
        {/* 2x2 Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700"></th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700" colSpan={2}>
                  {outcomeLabel}: {caseLabel}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700" rowSpan={2}>Total</th>
              </tr>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">{result.exposureLabel}</th>
                <th className="px-4 py-2 text-center text-sm font-medium text-green-700">Case</th>
                <th className="px-4 py-2 text-center text-sm font-medium text-red-700">Non-Case</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-200">
                <td className="px-4 py-3 text-sm font-medium text-gray-700">{result.exposedValue} (Exposed)</td>
                <td className="px-4 py-3 text-center text-lg font-semibold text-gray-900">{results.table.a}</td>
                <td className="px-4 py-3 text-center text-lg font-semibold text-gray-900">{results.table.b}</td>
                <td className="px-4 py-3 text-center text-sm font-medium text-gray-600">{results.totalExposed}</td>
              </tr>
              <tr className="border-t border-gray-200">
                <td className="px-4 py-3 text-sm font-medium text-gray-700">Other (Unexposed)</td>
                <td className="px-4 py-3 text-center text-lg font-semibold text-gray-900">{results.table.c}</td>
                <td className="px-4 py-3 text-center text-lg font-semibold text-gray-900">{results.table.d}</td>
                <td className="px-4 py-3 text-center text-sm font-medium text-gray-600">{results.totalUnexposed}</td>
              </tr>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-700">Total</td>
                <td className="px-4 py-3 text-center text-sm font-medium text-gray-600">{results.totalDisease}</td>
                <td className="px-4 py-3 text-center text-sm font-medium text-gray-600">{results.totalNoDisease}</td>
                <td className="px-4 py-3 text-center text-sm font-bold text-gray-900">{results.total}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Attack Rates / Exposure Rates based on study design */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-3">
            {studyDesign === 'cohort' ? 'Attack Rates (Row %)' : 'Exposure Rates (Column %)'}
          </h4>
          <div className="grid grid-cols-3 gap-4">
            {studyDesign === 'cohort' ? (
              <>
                <div>
                  <p className="text-xs text-blue-700">Exposed</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {formatPercent(results.attackRateExposed * 100, results.total)}%
                  </p>
                  <p className="text-xs text-blue-600">
                    ({results.table.a} / {results.totalExposed})
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">Unexposed</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {formatPercent(results.attackRateUnexposed * 100, results.total)}%
                  </p>
                  <p className="text-xs text-blue-600">
                    ({results.table.c} / {results.totalUnexposed})
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">Overall</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {formatPercent(results.attackRateTotal * 100, results.total)}%
                  </p>
                  <p className="text-xs text-blue-600">
                    ({results.totalDisease} / {results.total})
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs text-blue-700">Cases Exposed</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {formatPercent((results.table.a / results.totalDisease) * 100, results.total)}%
                  </p>
                  <p className="text-xs text-blue-600">
                    ({results.table.a} / {results.totalDisease})
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">Controls Exposed</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {formatPercent((results.table.b / results.totalNoDisease) * 100, results.total)}%
                  </p>
                  <p className="text-xs text-blue-600">
                    ({results.table.b} / {results.totalNoDisease})
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">Overall Exposed</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {formatPercent((results.totalExposed / results.total) * 100, results.total)}%
                  </p>
                  <p className="text-xs text-blue-600">
                    ({results.totalExposed} / {results.total})
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Measure of Association (only show appropriate one based on study design) */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Measure of Association</h4>
          <div className="space-y-4">
            {studyDesign === 'cohort' ? (
              <>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Risk Ratio (RR)</p>
                    <p className="text-xs text-gray-500">Relative Risk</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(results.riskRatio)}</p>
                    <p className="text-xs text-gray-500">95% CI: {formatCI(results.riskRatioCI)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Risk Difference (RD)</p>
                    <p className="text-xs text-gray-500">Attributable Risk</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-gray-900">{formatPercent(results.riskDifference * 100, results.total)}%</p>
                    <p className="text-xs text-gray-500">95% CI: ({formatPercent(results.riskDifferenceCI[0] * 100, results.total)} - {formatPercent(results.riskDifferenceCI[1] * 100, results.total)})</p>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Attributable Risk %</p>
                    <p className="text-xs text-gray-500">Among exposed</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-gray-900">{formatPercent(results.attributableRiskPercent, results.total)}%</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">Odds Ratio (OR)</p>
                  <p className="text-xs text-gray-500">For case-control studies</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">{formatNumber(results.oddsRatio)}</p>
                  <p className="text-xs text-gray-500">95% CI: {formatCI(results.oddsRatioCI)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Statistical Tests */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Statistical Tests</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-900">Chi-square (Yates corrected)</p>
                <p className="text-xs text-gray-500">df = 1</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-900">{formatNumber(results.chiSquare, 3)}</p>
                <p className={`text-xs font-medium ${results.chiSquarePValue < 0.05 ? 'text-green-600' : 'text-gray-500'}`}>
                  p = {formatPValue(results.chiSquarePValue)}
                  {results.chiSquarePValue < 0.05 && ' *'}
                </p>
              </div>
            </div>

            {results.fisherExactPValue !== null && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">Fisher's Exact Test</p>
                  <p className="text-xs text-gray-500">Two-tailed</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-semibold ${results.fisherExactPValue < 0.05 ? 'text-green-600' : 'text-gray-900'}`}>
                    p = {formatPValue(results.fisherExactPValue)}
                    {results.fisherExactPValue < 0.05 && ' *'}
                  </p>
                </div>
              </div>
            )}
          </div>
          <p className="mt-4 text-xs text-gray-500">* Statistically significant at p &lt; 0.05</p>
        </div>

        {/* Interpretation */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-yellow-900 mb-2">Interpretation</h4>
          <p className="text-sm text-yellow-800">
            {studyDesign === 'cohort' ? (
              results.riskRatio > 1 ? (
                <>
                  Those exposed to <strong>{result.exposedValue}</strong> had{' '}
                  <strong>{formatNumber(results.riskRatio)} times</strong> the risk of{' '}
                  being a case compared to those not exposed
                  {results.chiSquarePValue < 0.05 ? ' (statistically significant)' : ' (not statistically significant)'}.
                </>
              ) : results.riskRatio < 1 ? (
                <>
                  Exposure to <strong>{result.exposedValue}</strong> appears to be{' '}
                  <strong>protective</strong> (RR = {formatNumber(results.riskRatio)})
                  {results.chiSquarePValue < 0.05 ? ' (statistically significant)' : ' (not statistically significant)'}.
                </>
              ) : (
                <>
                  There is <strong>no association</strong> between <strong>{result.exposedValue}</strong> and{' '}
                  being a case (RR = 1.0).
                </>
              )
            ) : (
              results.oddsRatio > 1 ? (
                <>
                  Cases had <strong>{formatNumber(results.oddsRatio)} times</strong> the odds of{' '}
                  exposure to <strong>{result.exposedValue}</strong> compared to controls
                  {results.chiSquarePValue < 0.05 ? ' (statistically significant)' : ' (not statistically significant)'}.
                </>
              ) : results.oddsRatio < 1 ? (
                <>
                  Exposure to <strong>{result.exposedValue}</strong> appears to be{' '}
                  <strong>protective</strong> (OR = {formatNumber(results.oddsRatio)})
                  {results.chiSquarePValue < 0.05 ? ' (statistically significant)' : ' (not statistically significant)'}.
                </>
              ) : (
                <>
                  There is <strong>no association</strong> between <strong>{result.exposedValue}</strong> and{' '}
                  case status (OR = 1.0).
                </>
              )
            )}
          </p>
        </div>
      </div>
    );
  };

  // Render summary table for multiple exposures
  const renderSummaryTable = () => {
    return (
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Exposure
                </th>
                {studyDesign === 'cohort' ? (
                  <>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Exp Cases
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Exp
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AR (Exp)
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unexp Cases
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Unexp
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AR (Unexp)
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      RR
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      95% CI
                    </th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cases (n, %)
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Controls (n, %)
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      OR
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      95% CI
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {exposureResults.map((result) => {
                const r = result.results;
                const isSignificant = r.chiSquarePValue < 0.05;
                const measure = studyDesign === 'cohort' ? r.riskRatio : r.oddsRatio;
                const ci = studyDesign === 'cohort' ? r.riskRatioCI : r.oddsRatioCI;

                return (
                  <tr key={result.exposureVar} className={isSignificant ? 'bg-green-50' : ''}>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">
                      {result.exposureLabel}
                      <span className="text-xs text-gray-500 ml-1">({result.exposedValue})</span>
                    </td>
                    {studyDesign === 'cohort' ? (
                      <>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.table.a}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.totalExposed}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">
                          {formatPercent(r.attackRateExposed * 100, r.total)}%
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.table.c}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">{r.totalUnexposed}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-900">
                          {formatPercent(r.attackRateUnexposed * 100, r.total)}%
                        </td>
                        <td className={`px-3 py-2 text-sm text-center font-semibold ${isSignificant ? 'text-green-700' : 'text-gray-900'}`}>
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
                        <td className={`px-3 py-2 text-sm text-center font-semibold ${isSignificant ? 'text-green-700' : 'text-gray-900'}`}>
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
            ? 'AR = Attack Rate (Row %), RR = Risk Ratio. Green highlighting indicates p < 0.05.'
            : 'Percentages are column percentages. OR = Odds Ratio. Green highlighting indicates p < 0.05.'}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Study Design Selector */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 mb-3">Study Design</label>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="studyDesign"
              value="cohort"
              checked={studyDesign === 'cohort'}
              onChange={() => setStudyDesign('cohort')}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-900">Retrospective Cohort Investigation</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="studyDesign"
              value="case-control"
              checked={studyDesign === 'case-control'}
              onChange={() => setStudyDesign('case-control')}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-900">Case-Control Investigation</span>
          </label>
        </div>
      </div>

      {/* Outcome Variable */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Outcome Variable
            </label>
            <select
              value={outcomeVar}
              onChange={(e) => {
                setOutcomeVar(e.target.value);
                setCaseValues(new Set());
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                        ? 'bg-blue-600 text-white'
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
          <div className="mt-3 text-sm text-blue-800">
            <strong>{totalCases}</strong> cases identified out of <strong>{dataset.records.length}</strong> records
            ({formatPercent((totalCases / dataset.records.length) * 100, dataset.records.length)}%)
          </div>
        )}
        {outcomeVar && caseValues.size === 0 && (
          <div className="mt-3 text-sm text-amber-700">
            Please select which values count as cases
          </div>
        )}
      </div>

      {/* Exposure Selection */}
      {outcomeVar && caseValues.size > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Exposure Variables</h4>
          <p className="text-xs text-gray-500 mb-3">Select one or more exposure variables to analyze. Click to change the exposed value.</p>
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
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span className={`w-4 h-4 flex items-center justify-center rounded ${isSelected ? 'bg-blue-500' : 'bg-gray-300'}`}>
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
                        className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
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

      {/* Results */}
      {exposureResults.length > 1 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900">Summary Table</h4>
          {renderSummaryTable()}
        </div>
      )}

      {exposureResults.length === 1 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900">
            Detailed Analysis: {exposureResults[0].exposureLabel}
          </h4>
          {renderDetailedView(exposureResults[0])}
        </div>
      )}

      {outcomeVar && caseValues.size > 0 && selectedExposures.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          Select one or more exposure variables to see the analysis
        </div>
      )}

      {(!outcomeVar || caseValues.size === 0) && (
        <div className="text-center py-8 text-gray-400">
          Define the case definition above to begin analysis
        </div>
      )}
    </div>
  );
}
