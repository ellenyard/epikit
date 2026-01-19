import { useState, useMemo } from 'react';
import type { Dataset, CaseRecord } from '../../types/analysis';
import { calculateTwoByTwo } from '../../utils/statistics';
import type { TwoByTwoResults } from '../../utils/statistics';

interface TwoByTwoAnalysisProps {
  dataset: Dataset;
}

export function TwoByTwoAnalysis({ dataset }: TwoByTwoAnalysisProps) {
  const [exposureVar, setExposureVar] = useState<string>('');
  const [exposureValue, setExposureValue] = useState<string>('');
  const [outcomeVar, setOutcomeVar] = useState<string>('');
  const [outcomeValue, setOutcomeValue] = useState<string>('');

  // Get unique values for selected variables
  const exposureValues = useMemo(() => {
    if (!exposureVar) return [];
    const values = new Set<string>();
    dataset.records.forEach(r => {
      const v = r[exposureVar];
      if (v !== null && v !== undefined && v !== '') {
        values.add(String(v));
      }
    });
    return Array.from(values).sort();
  }, [dataset.records, exposureVar]);

  const outcomeValues = useMemo(() => {
    if (!outcomeVar) return [];
    const values = new Set<string>();
    dataset.records.forEach(r => {
      const v = r[outcomeVar];
      if (v !== null && v !== undefined && v !== '') {
        values.add(String(v));
      }
    });
    return Array.from(values).sort();
  }, [dataset.records, outcomeVar]);

  // Calculate 2x2 table
  const results: TwoByTwoResults | null = useMemo(() => {
    if (!exposureVar || !exposureValue || !outcomeVar || !outcomeValue) {
      return null;
    }

    let a = 0, b = 0, c = 0, d = 0;

    dataset.records.forEach((record: CaseRecord) => {
      const exposed = String(record[exposureVar]) === exposureValue;
      const diseased = String(record[outcomeVar]) === outcomeValue;

      if (exposed && diseased) a++;
      else if (exposed && !diseased) b++;
      else if (!exposed && diseased) c++;
      else if (!exposed && !diseased) d++;
    });

    return calculateTwoByTwo({ a, b, c, d });
  }, [dataset.records, exposureVar, exposureValue, outcomeVar, outcomeValue]);

  const formatNumber = (n: number, decimals: number = 2): string => {
    if (!isFinite(n)) return 'Undefined';
    return n.toFixed(decimals);
  };

  const formatCI = (ci: [number, number]): string => {
    if (!isFinite(ci[0]) || !isFinite(ci[1])) return '(Undefined)';
    return `(${ci[0].toFixed(2)} - ${ci[1].toFixed(2)})`;
  };

  const formatPValue = (p: number): string => {
    if (p < 0.001) return '< 0.001';
    return p.toFixed(4);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">2x2 Table Analysis</h3>
        <p className="text-sm text-gray-600 mb-4">
          Select an exposure variable and an outcome variable to calculate measures of association.
        </p>
      </div>

      {/* Variable Selection */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Exposure Variable</label>
          <select
            value={exposureVar}
            onChange={(e) => { setExposureVar(e.target.value); setExposureValue(''); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select variable...</option>
            {dataset.columns.map(col => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
          {exposureVar && (
            <>
              <label className="block text-sm font-medium text-gray-700">Exposed value (Yes/Case)</label>
              <select
                value={exposureValue}
                onChange={(e) => setExposureValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select value...</option>
                {exposureValues.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </>
          )}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Outcome Variable</label>
          <select
            value={outcomeVar}
            onChange={(e) => { setOutcomeVar(e.target.value); setOutcomeValue(''); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select variable...</option>
            {dataset.columns.map(col => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
          {outcomeVar && (
            <>
              <label className="block text-sm font-medium text-gray-700">Disease/Outcome value (Yes/Case)</label>
              <select
                value={outcomeValue}
                onChange={(e) => setOutcomeValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select value...</option>
                {outcomeValues.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* 2x2 Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700"></th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700" colSpan={2}>
                    {outcomeVar}: {outcomeValue}
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700" rowSpan={2}>Total</th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">{exposureVar}</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-green-700">Yes</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-red-700">No</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-200">
                  <td className="px-4 py-3 text-sm font-medium text-gray-700">{exposureValue} (Exposed)</td>
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

          {/* Attack Rates */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-3">Attack Rates</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-blue-700">Exposed</p>
                <p className="text-lg font-semibold text-blue-900">
                  {formatNumber(results.attackRateExposed * 100)}%
                </p>
                <p className="text-xs text-blue-600">
                  ({results.table.a} / {results.totalExposed})
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-700">Unexposed</p>
                <p className="text-lg font-semibold text-blue-900">
                  {formatNumber(results.attackRateUnexposed * 100)}%
                </p>
                <p className="text-xs text-blue-600">
                  ({results.table.c} / {results.totalUnexposed})
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-700">Overall</p>
                <p className="text-lg font-semibold text-blue-900">
                  {formatNumber(results.attackRateTotal * 100)}%
                </p>
                <p className="text-xs text-blue-600">
                  ({results.totalDisease} / {results.total})
                </p>
              </div>
            </div>
          </div>

          {/* Measures of Association */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">Measures of Association</h4>
            <div className="space-y-4">
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
                  <p className="text-sm font-medium text-gray-900">Odds Ratio (OR)</p>
                  <p className="text-xs text-gray-500">For case-control studies</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">{formatNumber(results.oddsRatio)}</p>
                  <p className="text-xs text-gray-500">95% CI: {formatCI(results.oddsRatioCI)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-900">Risk Difference (RD)</p>
                  <p className="text-xs text-gray-500">Attributable Risk</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">{formatNumber(results.riskDifference * 100)}%</p>
                  <p className="text-xs text-gray-500">95% CI: {formatCI([results.riskDifferenceCI[0] * 100, results.riskDifferenceCI[1] * 100])}</p>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">Attributable Risk %</p>
                  <p className="text-xs text-gray-500">Among exposed</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">{formatNumber(results.attributableRiskPercent)}%</p>
                </div>
              </div>
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
              {results.riskRatio > 1 ? (
                <>
                  Those exposed to <strong>{exposureValue}</strong> had{' '}
                  <strong>{formatNumber(results.riskRatio)} times</strong> the risk of{' '}
                  <strong>{outcomeValue}</strong> compared to those not exposed
                  {results.chiSquarePValue < 0.05 ? ' (statistically significant)' : ' (not statistically significant)'}.
                </>
              ) : results.riskRatio < 1 ? (
                <>
                  Exposure to <strong>{exposureValue}</strong> appears to be{' '}
                  <strong>protective</strong> against <strong>{outcomeValue}</strong>{' '}
                  (RR = {formatNumber(results.riskRatio)})
                  {results.chiSquarePValue < 0.05 ? ' (statistically significant)' : ' (not statistically significant)'}.
                </>
              ) : (
                <>
                  There is <strong>no association</strong> between <strong>{exposureValue}</strong> and{' '}
                  <strong>{outcomeValue}</strong> (RR = 1.0).
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {!results && exposureVar && outcomeVar && (
        <div className="text-center py-8 text-gray-400">
          Select values for both variables to see the analysis
        </div>
      )}
    </div>
  );
}
