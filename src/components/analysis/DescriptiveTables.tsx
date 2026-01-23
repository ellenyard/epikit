import { useState } from 'react';
import type { Dataset } from '../../types/analysis';
import { TabHeader, HelpPanel } from '../shared';
import { SingleVariable } from './SingleVariable';
import { OneWaySection } from './OneWaySection';
import { TwoWayTableBuilder } from './TwoWayTableBuilder';

interface DescriptiveTablesProps {
  dataset: Dataset;
  onNavigateTo2x2?: () => void;
  onExportDataset?: () => void;
}

type Section = 'single' | 'oneway' | 'twoway';

export function DescriptiveTables({ dataset, onNavigateTo2x2, onExportDataset }: DescriptiveTablesProps) {
  const [activeSection, setActiveSection] = useState<Section>('single');

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* TabHeader */}
      <TabHeader
        title="Descriptive Tables"
        description="Summarize and cross-tabulate variables with counts and clear denominators."
      />

      {/* Section Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveSection('single')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeSection === 'single'
              ? 'border-gray-700 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Single Variable
        </button>
        <button
          onClick={() => setActiveSection('oneway')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeSection === 'oneway'
              ? 'border-gray-700 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          One-Way Tables
        </button>
        <button
          onClick={() => setActiveSection('twoway')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeSection === 'twoway'
              ? 'border-gray-700 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Two-Way Tables
        </button>
      </div>

      {/* Active Section Content */}
      <div className="flex-1">
        {activeSection === 'single' && <SingleVariable dataset={dataset} onExportDataset={onExportDataset} />}
        {activeSection === 'oneway' && <OneWaySection dataset={dataset} onExportDataset={onExportDataset} />}
        {activeSection === 'twoway' && <TwoWayTableBuilder dataset={dataset} onNavigateTo2x2={onNavigateTo2x2} onExportDataset={onExportDataset} />}
      </div>

      {/* Unified Help Panel */}
      <HelpPanel title="About Descriptive Tables">
        <div className="text-sm text-gray-700 space-y-4">
          <p>
            The Descriptive Tables tab provides three ways to summarize your data:
          </p>

          <div className="space-y-3">
            <div>
              <strong className="text-gray-900">Single Variable</strong>
              <p className="text-gray-600 mt-1">
                Explore frequency distributions and summary statistics for individual variables.
                View histograms, box plots, and density plots for numeric data, or bar charts
                for categorical data. Useful for data quality checks and understanding distributions.
              </p>
            </div>

            <div>
              <strong className="text-gray-900">One-Way Tables</strong>
              <p className="text-gray-600 mt-1">
                Create frequency tables for multiple variables at once. Choose between expanded
                (all values) or condensed (single value of interest) views. Drag to reorder
                variables in the output table.
              </p>
            </div>

            <div>
              <strong className="text-gray-900">Two-Way Tables</strong>
              <p className="text-gray-600 mt-1">
                Build cross-tabulations showing the relationship between two categorical variables.
                View counts and percentages (row, column, and overall) with explicit denominators.
                High-cardinality variables (more than 30 unique values) will trigger a warning.
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>Note:</strong> Two-way tables in this section show descriptive counts and
              percentages only. For analytic comparisons with measures of association (risk ratios,
              odds ratios, confidence intervals), use the <strong>2×2 Analysis</strong> tab instead.
            </p>
          </div>
        </div>
      </HelpPanel>
    </div>
  );
}
