import { useState, useMemo } from 'react';
import type { Dataset } from '../../types/analysis';

interface AttackRatesProps {
  dataset: Dataset;
}

interface StratumData {
  stratum: string;
  cases: number;
  population: number | null;
  attackRate: number | null;
  ciLower: number | null;
  ciUpper: number | null;
}

// Wilson score interval for binomial proportion
function wilsonScoreInterval(x: number, n: number, confidence: number = 0.95): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 0 };
  if (x === 0) return { lower: 0, upper: 1 - Math.pow(1 - confidence, 1 / n) };
  if (x === n) return { lower: Math.pow(1 - confidence, 1 / n), upper: 1 };

  const z = 1.96; // 95% CI
  const p = x / n;
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);

  return {
    lower: Math.max(0, (centre - margin) / denominator),
    upper: Math.min(1, (centre + margin) / denominator),
  };
}

function formatPercent(value: number | null, decimals: number = 2): string {
  if (value === null) return '-';
  return (value * 100).toFixed(decimals) + '%';
}

function formatCI(lower: number | null, upper: number | null): string {
  if (lower === null || upper === null) return '-';
  return `${(lower * 100).toFixed(2)}-${(upper * 100).toFixed(2)}%`;
}

export function AttackRates({ dataset }: AttackRatesProps) {
  const [stratifyBy, setStratifyBy] = useState<string | null>(null);
  const [populations, setPopulations] = useState<Record<string, number | null>>({});
  const [overallPopulation, setOverallPopulation] = useState<number | null>(null);

  // Get columns suitable for stratification (text columns with reasonable number of unique values)
  const stratificationColumns = useMemo(() => {
    return dataset.columns.filter(col => {
      if (col.type === 'number' && !col.key.toLowerCase().includes('age')) return false;
      if (col.type === 'date') return false;
      if (col.key === 'id' || col.key === 'case_id') return false;

      // Check number of unique values
      const uniqueValues = new Set(dataset.records.map(r => r[col.key])).size;
      return uniqueValues >= 2 && uniqueValues <= 20;
    });
  }, [dataset]);

  // Calculate strata data
  const strataData = useMemo((): StratumData[] => {
    if (!stratifyBy) {
      // Overall only
      const cases = dataset.records.length;
      const pop = overallPopulation;

      if (pop && pop > 0) {
        const rate = cases / pop;
        const ci = wilsonScoreInterval(cases, pop);
        return [{
          stratum: 'Overall',
          cases,
          population: pop,
          attackRate: rate,
          ciLower: ci.lower,
          ciUpper: ci.upper,
        }];
      }

      return [{
        stratum: 'Overall',
        cases,
        population: null,
        attackRate: null,
        ciLower: null,
        ciUpper: null,
      }];
    }

    // Get unique values for the selected column
    const valueCounts = new Map<string, number>();
    dataset.records.forEach(record => {
      const value = String(record[stratifyBy] ?? 'Unknown');
      valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
    });

    // Sort by value (attempt numeric sort if possible)
    const sortedValues = Array.from(valueCounts.keys()).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    return sortedValues.map(stratum => {
      const cases = valueCounts.get(stratum) || 0;
      const pop = populations[stratum] ?? null;

      if (pop && pop > 0) {
        const rate = cases / pop;
        const ci = wilsonScoreInterval(cases, pop);
        return {
          stratum,
          cases,
          population: pop,
          attackRate: rate,
          ciLower: ci.lower,
          ciUpper: ci.upper,
        };
      }

      return {
        stratum,
        cases,
        population: null,
        attackRate: null,
        ciLower: null,
        ciUpper: null,
      };
    });
  }, [dataset, stratifyBy, populations, overallPopulation]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalCases = strataData.reduce((sum, s) => sum + s.cases, 0);
    const totalPop = strataData.every(s => s.population !== null)
      ? strataData.reduce((sum, s) => sum + (s.population || 0), 0)
      : null;

    if (totalPop && totalPop > 0) {
      const rate = totalCases / totalPop;
      const ci = wilsonScoreInterval(totalCases, totalPop);
      return { cases: totalCases, population: totalPop, attackRate: rate, ciLower: ci.lower, ciUpper: ci.upper };
    }

    return { cases: totalCases, population: null, attackRate: null, ciLower: null, ciUpper: null };
  }, [strataData]);

  const handlePopulationChange = (stratum: string, value: string) => {
    const numValue = value === '' ? null : parseInt(value, 10);
    if (stratifyBy) {
      setPopulations(prev => ({ ...prev, [stratum]: numValue }));
    } else {
      setOverallPopulation(numValue);
    }
  };

  // Calculate max attack rate for chart scaling
  const maxRate = useMemo(() => {
    const rates = strataData.map(s => s.ciUpper || s.attackRate || 0).filter(r => r > 0);
    return rates.length > 0 ? Math.max(...rates) : 0;
  }, [strataData]);

  const hasCalculatedRates = strataData.some(s => s.attackRate !== null);

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Attack Rate Analysis</h2>

        {/* Stratification selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Stratify by (optional)
          </label>
          <select
            value={stratifyBy || ''}
            onChange={(e) => {
              setStratifyBy(e.target.value || null);
              setPopulations({});
            }}
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">None (overall only)</option>
            {stratificationColumns.map(col => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
        </div>

        {/* Population entry table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {stratifyBy ? stratificationColumns.find(c => c.key === stratifyBy)?.label || 'Stratum' : 'Group'}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cases</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Population</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Attack Rate</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">95% CI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {strataData.map((row) => (
                <tr key={row.stratum} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.stratum}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{row.cases}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min="0"
                      value={stratifyBy ? (populations[row.stratum] ?? '') : (overallPopulation ?? '')}
                      onChange={(e) => handlePopulationChange(row.stratum, e.target.value)}
                      placeholder="Enter population"
                      className="w-32 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                    {formatPercent(row.attackRate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">
                    {formatCI(row.ciLower, row.ciUpper)}
                  </td>
                </tr>
              ))}
              {stratifyBy && strataData.length > 1 && (
                <tr className="bg-gray-50 font-medium">
                  <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{totals.cases}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {totals.population !== null ? totals.population.toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {formatPercent(totals.attackRate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">
                    {formatCI(totals.ciLower, totals.ciUpper)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bar chart visualization */}
        {hasCalculatedRates && stratifyBy && strataData.length > 1 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-4">
              Attack Rate by {stratificationColumns.find(c => c.key === stratifyBy)?.label}
            </h3>
            <div className="space-y-3">
              {strataData.filter(s => s.attackRate !== null).map((row) => (
                <div key={row.stratum} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-gray-700 truncate" title={row.stratum}>
                    {row.stratum}
                  </div>
                  <div className="flex-1 relative h-8">
                    {/* CI range bar (lighter) */}
                    {row.ciLower !== null && row.ciUpper !== null && maxRate > 0 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-2 bg-blue-200 rounded"
                        style={{
                          left: `${(row.ciLower / maxRate) * 100}%`,
                          width: `${((row.ciUpper - row.ciLower) / maxRate) * 100}%`,
                        }}
                      />
                    )}
                    {/* Point estimate bar */}
                    {row.attackRate !== null && maxRate > 0 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-6 bg-blue-500 rounded"
                        style={{ width: `${(row.attackRate / maxRate) * 100}%` }}
                      />
                    )}
                  </div>
                  <div className="w-20 text-sm text-gray-900 text-right">
                    {formatPercent(row.attackRate)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-4 h-3 bg-blue-500 rounded" />
                <span>Attack Rate</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-2 bg-blue-200 rounded" />
                <span>95% CI</span>
              </div>
            </div>
          </div>
        )}

        {/* Help text */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-2">About Attack Rates</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Attack Rate</strong> = (Cases / Population at Risk) × 100</li>
            <li>• Enter the population at risk for each group to calculate rates</li>
            <li>• <strong>95% CI</strong> (Confidence Interval) shows the range where the true rate likely falls</li>
            <li>• Uses the Wilson score interval method</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
