import React, { useState } from 'react';
import type { Dataset } from '../types/analysis';
import { Dialog } from './shared';
import { pathForModule } from '../utils/appRoutes';
import {
  OUTBREAK_SAMPLE_ID,
  NUTRITION_SAMPLE_ID,
  SURVEILLANCE_SAMPLE_ID,
  sampleSize,
} from '../data/sampleDatasets';

/**
 * The tutorial at /app/tutorial/: the example datasets, each with a few
 * suggested first steps that open the sample straight into the right tool.
 *
 * Opening a sample (or a step) loads it into this browser only then; a sample
 * already here can be put back as shipped, or removed to free space.
 */

type ToolModule = 'review' | 'epicurve' | 'maps' | 'analysis' | 'visualize';

const TOOL_NAMES: Record<ToolModule, string> = {
  review: 'Review/Clean',
  epicurve: 'Epi Curve',
  maps: 'Maps',
  analysis: 'Analysis',
  visualize: 'Visualize',
};

interface FirstStep {
  tool: ToolModule;
  title: string;
  detail: string;
}

interface SampleGuide {
  id: string;
  title: string;
  description: string;
  steps: FirstStep[];
}

const SAMPLE_GUIDES: SampleGuide[] = [
  {
    id: OUTBREAK_SAMPLE_ID,
    title: 'Foodborne outbreak at a community picnic',
    description:
      'A retrospective cohort of picnic attendees: symptoms, onset dates and times, what each person ate and drank, and household locations. Some answers are entered inconsistently, as they often are in the field.',
    steps: [
      {
        tool: 'review',
        title: 'Clean the line list',
        detail: 'Run the data checks, and look for answers recorded more than one way, such as y/n next to Yes/No.',
      },
      {
        tool: 'epicurve',
        title: 'Draw the epidemic curve',
        detail: 'Plot onset dates and times. Try 12-hour bins, and stratify by case status.',
      },
      {
        tool: 'analysis',
        title: 'Find the likely vehicle',
        detail: 'In Test (2×2), compare attack rates among people who did and did not eat each food.',
      },
      {
        tool: 'maps',
        title: 'Map where cases live',
        detail: 'Make a spot map from the household coordinates.',
      },
    ],
  },
  {
    id: SURVEILLANCE_SAMPLE_ID,
    title: 'Monthly disease surveillance reports',
    description:
      'Four years (2022–2025) of monthly reports from five districts for malaria, acute watery diarrhea, and measles, with cases, deaths, population, and reporting completeness.',
    steps: [
      {
        tool: 'epicurve',
        title: 'See the seasonal pattern',
        detail: 'Plot report dates in monthly bins, stratified by disease. The counts come from Cases Reported.',
      },
      {
        tool: 'visualize',
        title: 'Compare districts over time',
        detail: 'Draw a line chart of cases by report date, or a heatmap of month by district.',
      },
      {
        tool: 'visualize',
        title: 'Check reporting completeness',
        detail: 'Use a bullet chart to compare each district’s reporting completeness with its target.',
      },
    ],
  },
  {
    id: NUTRITION_SAMPLE_ID,
    title: 'Child nutrition survey',
    description:
      'A rapid assessment of children aged 6–59 months in 30 survey clusters, measured in 2020 and again in 2025: weight, height, MUAC, z-scores, malnutrition status, and vitamin A and measles coverage.',
    steps: [
      {
        tool: 'review',
        title: 'Check the measurements',
        detail: 'Run the data checks, and look over the ranges for weight, height, and MUAC.',
      },
      {
        tool: 'analysis',
        title: 'Tabulate malnutrition',
        detail: 'Explore acute malnutrition (WHZ), then build a table of it by age group.',
      },
      {
        tool: 'visualize',
        title: 'Show change over time',
        detail: 'Use a slope chart to compare vitamin A or measles coverage between 2020 and 2025.',
      },
    ],
  },
];

interface TutorialProps {
  datasets: Dataset[];
  onOpenSample: (id: string) => void;
  onResetSample: (id: string) => void;
  onRemoveSample: (id: string) => void;
  onNavigate: (module: string) => void;
  onImportData: () => void;
  onOpenHelp: () => void;
}

const primaryButton =
  'px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const secondaryButton =
  'px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const textButton =
  'text-button text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2 rounded focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

type PendingAction = { kind: 'reset' | 'remove'; dataset: Dataset } | null;

export const Tutorial: React.FC<TutorialProps> = ({
  datasets,
  onOpenSample,
  onResetSample,
  onRemoveSample,
  onNavigate,
  onImportData,
  onOpenHelp,
}) => {
  const [pending, setPending] = useState<PendingAction>(null);

  const open = (id: string, tool: ToolModule) => {
    onOpenSample(id);
    onNavigate(tool);
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <a
          href={pathForModule('dashboard')}
          onClick={(e) => { e.preventDefault(); onNavigate('dashboard'); }}
          className={`inline-block mb-4 py-1 ${textButton}`}
        >
          ← Home
        </a>

        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-900">Tutorial</h1>
          <p className="mt-2 text-gray-600 max-w-2xl">
            Practice on an example dataset before you bring your own. The examples are made up for
            training. Changes you make to them stay in this browser and never touch your own data.
          </p>
        </header>

        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
          Example datasets
        </h2>
        <div className="space-y-5 mb-10">
          {SAMPLE_GUIDES.map((guide) => {
            const loaded = datasets.find((d) => d.id === guide.id) ?? null;
            const size = sampleSize(guide.id);
            const headingId = `sample-${guide.id}`;
            return (
              <section
                key={guide.id}
                aria-labelledby={headingId}
                className="rounded-lg border border-gray-200 p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id={headingId} className="text-lg font-semibold text-gray-900">
                      {guide.title}
                    </h3>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {size.records.toLocaleString('en-US')} records · {size.variables} variables
                    </p>
                  </div>
                  <button onClick={() => open(guide.id, 'review')} className={`self-start shrink-0 ${primaryButton}`}>
                    Open the data
                  </button>
                </div>
                <p className="mt-3 text-sm text-gray-700 max-w-2xl">{guide.description}</p>

                <h4 className="mt-4 text-sm font-semibold text-gray-900">Suggested first steps</h4>
                <ol className="mt-2 divide-y divide-gray-100 border-y border-gray-100">
                  {guide.steps.map((step, index) => (
                    <li
                      key={step.title}
                      className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4"
                    >
                      <div className="flex gap-3 min-w-0">
                        <span
                          className="shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{step.title}</p>
                          <p className="text-sm text-gray-600">{step.detail}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => open(guide.id, step.tool)}
                        className={`self-start sm:self-center shrink-0 ml-9 sm:ml-0 ${secondaryButton}`}
                        aria-label={`Open ${TOOL_NAMES[step.tool]}: ${step.title}`}
                      >
                        Open {TOOL_NAMES[step.tool]} →
                      </button>
                    </li>
                  ))}
                </ol>

                {loaded && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                    <span>In this browser.</span>
                    <button onClick={() => setPending({ kind: 'reset', dataset: loaded })} className={textButton}>
                      Start over
                    </button>
                    <button onClick={() => setPending({ kind: 'remove', dataset: loaded })} className={textButton}>
                      Remove
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <section className="border-t border-gray-200 pt-6 space-y-4 text-sm text-gray-700">
          <p>
            Review/Clean, Epi Curve, Spot Map, and 2&times;2 each have a <strong>How to Use This Tool</strong>{' '}
            panel with step-by-step instructions. For more, see{' '}
            <a
              href={`${pathForModule('dashboard')}?action=help`}
              onClick={(e) => { e.preventDefault(); onOpenHelp(); }}
              className="text-blue-700 hover:text-blue-900 underline underline-offset-2"
            >
              Help &amp; Tutorials
            </a>
            .
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-gray-900">Ready for your own data?</span>
            <button onClick={onImportData} className={primaryButton}>
              Import data
            </button>
          </div>
        </section>
      </div>

      {pending && (
        <Dialog onClose={() => setPending(null)} labelledBy="sample-action-title" className="max-w-md p-6">
          <h3 id="sample-action-title" className="text-lg font-semibold text-gray-900 mb-2">
            {pending.kind === 'reset' ? 'Start over with this example?' : 'Remove this example?'}
          </h3>
          <p className="text-gray-600 mb-4">
            {pending.kind === 'reset'
              ? 'This puts the data back as it was when you first opened it. Your edits to it, and its edit history, will be lost.'
              : 'This removes the example and its edit history from this browser. You can open it again from this page at any time.'}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setPending(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (pending.kind === 'reset') onResetSample(pending.dataset.id);
                else onRemoveSample(pending.dataset.id);
                setPending(null);
              }}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                pending.kind === 'reset' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {pending.kind === 'reset' ? 'Start over' : 'Remove'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
};
