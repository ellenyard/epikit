import { useState, useMemo } from 'react';
import type { Dataset } from '../../types/analysis';
import { TabHeader, HelpPanel } from '../shared';

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
  const [caseVariable, setCaseVariable] = useState<string>('');
  const [caseValues, setCaseValues] = useState<Set<string>>(new Set());
  const [stratifyBy, setStratifyBy] = useState<string | null>(null);
  const [populations, setPopulations] = useState<Record<string, number | null>>({});
  const [overallPopulation, setOverallPopulation] = useState<number | null>(null);

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

  // Get unique values for the selected case definition variable
  const caseVariableValues = useMemo(() => {
    if (!caseVariable) return [];
    const values = new Set(dataset.records.map(r => String(r[caseVariable] ?? '')));
    return Array.from(values).filter(v => v !== '').sort();
  }, [dataset, caseVariable]);

  // Auto-detect case variable on mount
  useMemo(() => {
    if (!caseVariable && caseDefinitionColumns.length > 0) {
      // Try to find common case-related columns
      const commonCaseColumns = ['ill', 'case_status', 'case', 'status', 'outcome'];
      const found = caseDefinitionColumns.find(col =>
        commonCaseColumns.some(name => col.key.toLowerCase().includes(name))
      );
      if (found) {
        setCaseVariable(found.key);
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
  }, [caseDefinitionColumns, dataset.records]);

  // Get columns suitable for stratification (text columns with reasonable number of unique values)
  const stratificationColumns = useMemo(() => {
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

  // Function to check if a record is a case
  const isCase = (record: Record<string, unknown>): boolean => {
    if (!caseVariable || caseValues.size === 0) return false;
    const value = String(record[caseVariable] ?? '');
    return caseValues.has(value);
  };

  // Count total cases
  const totalCases = useMemo(() => {
    return dataset.records.filter(isCase).length;
  }, [dataset.records, caseVariable, caseValues]);

  // Calculate strata data
  const strataData = useMemo((): StratumData[] => {
    if (!stratifyBy) {
      // Overall only - use total records as population, cases as defined by case definition
      const cases = totalCases;
      const pop = overallPopulation ?? dataset.records.length;

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

    // Get unique values for the selected column and count cases/population per stratum
    const strataCounts = new Map<string, { cases: number; population: number }>();
    dataset.records.forEach(record => {
      const rawValue = record[stratifyBy];
      const stratumValue = (rawValue === null || rawValue === undefined || rawValue === '')
        ? 'Unknown'
        : String(rawValue);
      const current = strataCounts.get(stratumValue) || { cases: 0, population: 0 };
      current.population += 1;
      if (isCase(record)) {
        current.cases += 1;
      }
      strataCounts.set(stratumValue, current);
    });

    // Sort by value (attempt numeric sort if possible)
    const sortedValues = Array.from(strataCounts.keys()).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    return sortedValues.map(stratum => {
      const counts = strataCounts.get(stratum) || { cases: 0, population: 0 };
      const pop = populations[stratum] ?? counts.population;

      if (pop > 0) {
        const rate = counts.cases / pop;
        const ci = wilsonScoreInterval(counts.cases, pop);
        return {
          stratum,
          cases: counts.cases,
          population: pop,
          attackRate: rate,
          ciLower: ci.lower,
          ciUpper: ci.upper,
        };
      }

      return {
        stratum,
        cases: counts.cases,
        population: pop,
        attackRate: null,
        ciLower: null,
        ciUpper: null,
      };
    });
  }, [dataset, stratifyBy, populations, overallPopulation, totalCases, caseVariable, caseValues]);

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
        {/* TabHeader */}
        <TabHeader
          title="Attack Rates"
          description="Calculate attack rates by exposure group and compare risk."
        />

        {/* Case Definition */}
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Case Definition</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Case variable
              </label>
              <select
                value={caseVariable}
                onChange={(e) => {
                  setCaseVariable(e.target.value);
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
            {caseVariable && caseVariableValues.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Values that count as a case
                </label>
                <div className="flex flex-wrap gap-2">
                  {caseVariableValues.map(value => (
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
          {caseVariable && caseValues.size > 0 && (
            <div className="mt-3 text-sm text-gray-700">
              <strong>{totalCases}</strong> cases identified out of <strong>{dataset.records.length}</strong> records
              ({((totalCases / dataset.records.length) * 100).toFixed(1)}%)
            </div>
          )}
          {caseVariable && caseValues.size === 0 && (
            <div className="mt-3 text-sm text-gray-600">
              Please select which values count as cases
            </div>
          )}
        </div>

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
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
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
                      className="w-32 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
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
                        className="absolute top-1/2 -translate-y-1/2 h-2 bg-gray-300 rounded"
                        style={{
                          left: `${(row.ciLower / maxRate) * 100}%`,
                          width: `${((row.ciUpper - row.ciLower) / maxRate) * 100}%`,
                        }}
                      />
                    )}
                    {/* Point estimate bar */}
                    {row.attackRate !== null && maxRate > 0 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-6 bg-gray-600 rounded"
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
                <div className="w-4 h-3 bg-gray-600 rounded" />
                <span>Attack Rate</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-2 bg-gray-300 rounded" />
                <span>95% CI</span>
              </div>
            </div>
          </div>
        )}

        {/* Help Panel */}
        <HelpPanel title="About Attack Rates">
          <div className="text-sm text-gray-700 space-y-3">
            <p>
              <strong>Attack rates</strong> measure the proportion of a population that develops illness
              during an outbreak. They are calculated as the number of cases divided by the population
              at risk, expressed as a percentage.
            </p>
            <p>
              <strong>Case Definition:</strong> Select the variable that indicates whether someone is a case,
              then choose which values count as cases (e.g., "Yes", "Confirmed").
            </p>
            <p>
              <strong>Stratification:</strong> Optionally stratify by a grouping variable (e.g., food item,
              age group) to compare attack rates across groups.
            </p>
            <p>
              <strong>Population:</strong> Enter the population at risk for each group. If left blank, the
              tool uses the number of records in your dataset as a proxy for population.
            </p>
          </div>
        </HelpPanel>

      </div>
    </div>
  );
}
