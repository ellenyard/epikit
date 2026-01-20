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

// Expandable refresher component
function Refresher({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-600 text-lg">💡</span>
          <span className="font-medium text-amber-900">{title}</span>
        </div>
        <svg
          className={`w-5 h-5 text-amber-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 py-4 bg-white border-t border-amber-200">
          {children}
        </div>
      )}
    </div>
  );
}

export function AttackRates({ dataset }: AttackRatesProps) {
  const [stratifyBy, setStratifyBy] = useState<string | null>(null);
  const [populations, setPopulations] = useState<Record<string, number | null>>({});
  const [overallPopulation, setOverallPopulation] = useState<number | null>(null);
  const [showRefresher, setShowRefresher] = useState(false);

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

        {/* Refresher Toggle */}
        <div className="mt-6">
          <button
            onClick={() => setShowRefresher(!showRefresher)}
            className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-800 font-medium"
          >
            <span className="text-lg">💡</span>
            <span>{showRefresher ? 'Hide' : 'Show'} Refresher: Attack Rates & Confidence Intervals</span>
            <svg
              className={`w-4 h-4 transition-transform ${showRefresher ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Refresher Content */}
        {showRefresher && (
          <div className="mt-4 space-y-4">
            <Refresher title="What is an Attack Rate?">
              <div className="space-y-3 text-sm text-gray-700">
                <p>
                  An <strong>attack rate</strong> (also called <strong>incidence proportion</strong>) measures
                  the proportion of a population that develops disease during an outbreak or defined time period.
                </p>
                <div className="bg-gray-50 p-3 rounded-lg font-mono text-center">
                  Attack Rate = (Number of Cases / Population at Risk) × 100
                </div>
                <p>
                  <strong>Example:</strong> If 25 people become ill out of 500 attendees at a wedding,
                  the attack rate is 25/500 × 100 = <strong>5%</strong>.
                </p>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="font-medium text-blue-900 mb-1">Key Points:</p>
                  <ul className="text-blue-800 space-y-1 list-disc list-inside">
                    <li>The denominator must be the population <em>at risk</em> of developing the disease</li>
                    <li>Everyone in the denominator should have had the opportunity to become a case</li>
                    <li>Attack rates are typically expressed as percentages</li>
                  </ul>
                </div>
              </div>
            </Refresher>

            <Refresher title="Why Stratify by Group?">
              <div className="space-y-3 text-sm text-gray-700">
                <p>
                  <strong>Stratification</strong> means calculating separate attack rates for different
                  subgroups (e.g., by age, sex, exposure status, or location).
                </p>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="font-medium text-blue-900 mb-1">Stratification helps you:</p>
                  <ul className="text-blue-800 space-y-1 list-disc list-inside">
                    <li>Identify which groups are most affected</li>
                    <li>Generate hypotheses about risk factors</li>
                    <li>Target interventions to high-risk populations</li>
                    <li>Detect confounding in your analysis</li>
                  </ul>
                </div>
                <p>
                  <strong>Example:</strong> Overall attack rate might be 10%, but stratifying by age could
                  reveal that children under 5 have a 25% attack rate while adults have only 5%.
                </p>
              </div>
            </Refresher>

            <Refresher title="What is a 95% Confidence Interval?">
              <div className="space-y-3 text-sm text-gray-700">
                <p>
                  A <strong>confidence interval (CI)</strong> provides a range of values that likely
                  contains the true attack rate in the population, accounting for sampling variability.
                </p>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium mb-2">If your attack rate is 5.0% (95% CI: 3.2-7.4%):</p>
                  <p>
                    This means if you repeated the study many times, 95% of the calculated
                    confidence intervals would contain the true population attack rate.
                  </p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="font-medium text-blue-900 mb-1">Interpreting CIs:</p>
                  <ul className="text-blue-800 space-y-1 list-disc list-inside">
                    <li><strong>Narrow CI</strong> = more precise estimate (larger sample size)</li>
                    <li><strong>Wide CI</strong> = less precise estimate (smaller sample size)</li>
                    <li>If two CIs don't overlap, the difference is likely statistically significant</li>
                    <li>CIs that overlap substantially suggest no significant difference</li>
                  </ul>
                </div>
              </div>
            </Refresher>

            <Refresher title="Comparing Attack Rates Between Groups">
              <div className="space-y-3 text-sm text-gray-700">
                <p>
                  When comparing attack rates between groups (e.g., exposed vs. unexposed), you can calculate:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium mb-1">Risk Ratio (Relative Risk)</p>
                    <p className="font-mono text-xs mb-2">RR = Attack Rate (exposed) / Attack Rate (unexposed)</p>
                    <p className="text-xs">RR of 2.0 means exposed group is 2× more likely to become ill</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium mb-1">Risk Difference (Attributable Risk)</p>
                    <p className="font-mono text-xs mb-2">RD = Attack Rate (exposed) - Attack Rate (unexposed)</p>
                    <p className="text-xs">RD of 10% means 10 additional cases per 100 people due to exposure</p>
                  </div>
                </div>
                <p className="text-gray-500 italic">
                  Tip: Use the 2×2 Table tab for exposure-outcome analysis with risk ratios and odds ratios.
                </p>
              </div>
            </Refresher>

            <Refresher title="Common Pitfalls to Avoid">
              <div className="space-y-3 text-sm text-gray-700">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <span className="text-red-500">✗</span>
                    <div>
                      <p className="font-medium">Wrong denominator</p>
                      <p className="text-gray-500">Using total population instead of population at risk</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-red-500">✗</span>
                    <div>
                      <p className="font-medium">Including non-susceptible people</p>
                      <p className="text-gray-500">E.g., including vaccinated people in denominator for vaccine-preventable disease</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-red-500">✗</span>
                    <div>
                      <p className="font-medium">Comparing rates from different time periods</p>
                      <p className="text-gray-500">Attack rates should cover the same time period for valid comparison</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-red-500">✗</span>
                    <div>
                      <p className="font-medium">Ignoring confidence intervals</p>
                      <p className="text-gray-500">A higher point estimate doesn't always mean a real difference</p>
                    </div>
                  </div>
                </div>
              </div>
            </Refresher>
          </div>
        )}
      </div>
    </div>
  );
}
