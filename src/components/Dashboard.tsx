import React, { useState } from 'react';
import type { Dataset } from '../types/analysis';
import { isSampleDataset } from '../data/demoData';
import { Dialog } from './shared';
import { LogoMark } from './shared/LogoMark';
import { FEEDBACK_EMAIL, FEEDBACK_MAILTO, FEEDBACK_PRIVACY_NOTE } from '../utils/contact';

interface DashboardProps {
  datasets: Dataset[];
  onNavigate: (module: string) => void;
  onImportData: () => void;
  onSelectDataset: (datasetId: string) => void;
  onDeleteDataset: (id: string) => void;
}

const primaryButton =
  'px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const secondaryButton =
  'px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

// A single-peaked outbreak curve: a slow start, a peak, a long tail.
const CURVE_HEIGHTS = [1, 1, 2, 3, 5, 8, 12, 15, 13, 10, 7, 5, 4, 3, 2, 2, 1, 1];
const BAR_WIDTH = 16;
const BAR_GAP = 4;
const CURVE_WIDTH = CURVE_HEIGHTS.length * (BAR_WIDTH + BAR_GAP);
// Where the dashed exposure line sits, just before the first rise.
const EXPOSURE_X = 3 * (BAR_WIDTH + BAR_GAP) - BAR_GAP / 2;

/**
 * A faint epidemic curve with a dashed exposure line, drawn behind the page
 * title. It is decoration only, so it is hidden from screen readers and
 * drawn in code rather than loaded as an image (about 1 KB, sharp at any
 * size). "stretch" fills its box, for the full-width strip on phones;
 * otherwise it keeps its shape and sits in the bottom-right corner.
 */
const EpiCurveMotif: React.FC<{ className: string; stretch?: boolean }> = ({ className, stretch }) => (
  <svg
    viewBox={`0 0 ${CURVE_WIDTH} 100`}
    preserveAspectRatio={stretch ? 'none' : 'xMaxYMax meet'}
    aria-hidden="true"
    focusable="false"
    className={`pointer-events-none absolute ${className}`}
  >
    <g fill="#3b82f6">
      {CURVE_HEIGHTS.map((h, i) => (
        <rect key={i} x={i * (BAR_WIDTH + BAR_GAP)} y={100 - h * 6} width={BAR_WIDTH} height={h * 6} rx="2" />
      ))}
    </g>
    <line
      x1={EXPOSURE_X}
      y1="4"
      x2={EXPOSURE_X}
      y2="100"
      stroke="#1e293b"
      strokeWidth="1.5"
      strokeDasharray="4 4"
      opacity="0.6"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

const UploadFileIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 18v-6" />
    <path d="m9 15 3-3 3 3" />
  </svg>
);

const GraduationCapIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M22 10 12 5 2 10l10 5 10-5z" />
    <path d="M6 12v5c3 2 9 2 12 0v-5" />
  </svg>
);

/**
 * The app home at /app/. Most visitors arrive here directly from a shared
 * link, never seeing the marketing page, so this screen has to say where to
 * start: import your own data, or take the tutorial. The samples live on the
 * tutorial page; this list is only the person's own data.
 */
export const Dashboard: React.FC<DashboardProps> = ({
  datasets,
  onNavigate,
  onImportData,
  onSelectDataset,
  onDeleteDataset,
}) => {
  const [deleteConfirmDataset, setDeleteConfirmDataset] = useState<Dataset | null>(null);

  // Most recent first. Samples are listed on the tutorial page instead.
  const ownDatasets = datasets
    .filter((d) => !isSampleDataset(d.id))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const hasOwnData = ownDatasets.length > 0;

  const handleDatasetClick = (dataset: Dataset) => {
    onSelectDataset(dataset.id);
    onNavigate('review');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* The logo and name on a soft band with a faint epi curve behind
            them. On a phone the curve runs as a strip under the name, so it
            never sits behind the text; from tablet width up it moves to the
            right-hand side. Returning users get a shorter band, so their
            list stays near the top. */}
        <header
          className={`relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 ${
            hasOwnData ? 'mb-6 px-5 pt-4 pb-9 md:py-4' : 'mb-8 px-5 pt-6 pb-14 sm:px-7 md:pt-7 md:pb-7'
          }`}
        >
          <EpiCurveMotif
            stretch
            className={`left-5 bottom-0 w-[calc(100%-2.5rem)] opacity-[0.12] md:hidden ${hasOwnData ? 'h-5' : 'h-9'}`}
          />
          <EpiCurveMotif
            className={`hidden md:block right-5 bottom-0 opacity-[0.14] ${hasOwnData ? 'h-[80%] w-[35%]' : 'h-[85%] w-[45%]'}`}
          />
          <div className="relative flex items-center gap-4">
            <LogoMark size={hasOwnData ? 40 : 52} className="shrink-0" />
            <h1 className="text-gray-900">
              <span className={`block font-semibold leading-tight ${hasOwnData ? 'text-2xl' : 'text-3xl'}`}>
                LineList
              </span>
              <span className="sr-only">: </span>
              <span className={`block font-normal text-slate-600 ${hasOwnData ? 'text-base' : 'mt-1 text-lg'}`}>
                The Epidemiologist&rsquo;s Toolkit
              </span>
            </h1>
          </div>
        </header>

        {hasOwnData ? (
          // Once someone has their own data, the list is what they came back
          // for, so the two ways in shrink to a row of buttons above it.
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button onClick={onImportData} className={primaryButton}>
              Import data
            </button>
            <button onClick={() => onNavigate('tutorial')} className={secondaryButton}>
              Tutorial
            </button>
          </div>
        ) : (
          // The two ways in. Import comes first in the markup, so it is also
          // first when the cards stack on a phone.
          <div className="grid gap-4 sm:grid-cols-2 mb-10">
            <section
              aria-labelledby="path-import"
              className="flex flex-col rounded-lg border border-blue-200 bg-blue-50 p-5"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <UploadFileIcon />
              </div>
              <h2 id="path-import" className="text-base font-semibold text-gray-900">
                Start with your data
              </h2>
              <p className="mt-1 flex-1 text-sm text-gray-600">
                Import a CSV or Excel file, or paste rows from a spreadsheet.
              </p>
              <button onClick={onImportData} className={`mt-4 self-start ${primaryButton}`}>
                Import data
              </button>
            </section>
            <section
              aria-labelledby="path-tutorial"
              className="flex flex-col rounded-lg border border-gray-200 bg-white p-5"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <GraduationCapIcon />
              </div>
              <h2 id="path-tutorial" className="text-base font-semibold text-gray-900">
                New here? Take the tutorial
              </h2>
              <p className="mt-1 flex-1 text-sm text-gray-600">
                Practice on example datasets.
              </p>
              <button onClick={() => onNavigate('tutorial')} className={`mt-4 self-start ${secondaryButton}`}>
                Start the tutorial
              </button>
            </section>
          </div>
        )}

        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Your data
            </h2>
            {hasOwnData && (
              <span className="text-sm text-gray-500">
                {ownDatasets.length} dataset{ownDatasets.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {hasOwnData ? (
            <ul className="border border-gray-200 rounded-md divide-y divide-gray-200">
              {ownDatasets.map((dataset) => (
                <li key={dataset.id} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50">
                  <button
                    onClick={() => handleDatasetClick(dataset)}
                    // min-w-0 lets the button shrink below its content on a
                    // phone, so a long name truncates instead of pushing the
                    // date and delete button off the right edge.
                    className="flex-1 min-w-0 flex items-baseline justify-between gap-4 text-left focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900 truncate">{dataset.name}</span>
                      <span className="block text-sm text-gray-500">
                        {dataset.records.length} record{dataset.records.length !== 1 ? 's' : ''}
                        {' · '}
                        {dataset.columns.length} variable{dataset.columns.length !== 1 ? 's' : ''}
                      </span>
                    </span>
                    <span className="hidden sm:inline text-sm text-gray-400 flex-shrink-0">
                      {formatDate(dataset.updatedAt)}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmDataset(dataset);
                    }}
                    className="p-2 text-gray-400 hover:text-red-700 rounded focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 flex-shrink-0"
                    title={`Delete ${dataset.name}`}
                    aria-label={`Delete ${dataset.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600 border border-dashed border-gray-300 rounded-md px-4 py-5">
              Nothing imported yet. Files you import will be listed here.
            </p>
          )}
        </section>

        <section className="border-t border-gray-200 pt-6 text-sm text-gray-600 space-y-2">
          <p>
            Datasets and edits are saved in this browser only. Closing the tab is safe; your
            work will be here when you return. Nothing is sent to LineList, and no one else who
            uses this site can see your data.
          </p>
          <p>
            To move work to another computer or keep a backup, use <strong>Save Project</strong> in
            the toolbar, and <strong>Load Project</strong> to restore it. A project file carries
            your datasets, edit history, and the analysis you have set up.
          </p>
          <p>
            Noticed an error or have a suggestion? Email{' '}
            <a href={FEEDBACK_MAILTO} className="text-blue-700 hover:text-blue-900 underline underline-offset-2">
              {FEEDBACK_EMAIL}
            </a>
            . {FEEDBACK_PRIVACY_NOTE}
          </p>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmDataset && (
        <Dialog
          onClose={() => setDeleteConfirmDataset(null)}
          labelledBy="delete-dataset-title"
          className="max-w-md p-6"
        >
            <h3 id="delete-dataset-title" className="text-lg font-semibold text-gray-900 mb-2">Delete Dataset?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete "<span className="font-medium">{deleteConfirmDataset.name}</span>"?
              This will permanently remove {deleteConfirmDataset.records.length} record{deleteConfirmDataset.records.length !== 1 ? 's' : ''} and all associated edit history. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmDataset(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteDataset(deleteConfirmDataset.id);
                  setDeleteConfirmDataset(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
        </Dialog>
      )}
    </div>
  );
};
