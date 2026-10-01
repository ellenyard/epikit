import { useState } from 'react';
import type { ReactNode } from 'react';
import { ResultsActions, ExportIcons } from '../../shared';
import {
  exportChartPNG,
  exportChartSVG,
  copyChartToClipboard,
  exportExcel,
  chartFilename,
} from '../../../utils/chartExport';
import type { ExcelExportData } from '../../../utils/chartExport';

interface ChartContainerProps {
  /** The chart's title. Names the downloaded files; the drawing carries its own copy. */
  title: string;
  /** Accepted for the callers that pass them; the drawing shows both itself. */
  subtitle?: string;
  source?: string;
  svgContent?: string;  // SVG string used for PNG and SVG export and the clipboard
  children: ReactNode;
  /** Filename used when the title is empty or has nothing a file system accepts. */
  filename?: string;
  excelData?: ExcelExportData;  // Structured data for Excel export
}

const ClipboardIcon = (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
  </svg>
);

const ExcelIcon = (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const VectorIcon = (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v11m0 0l-4-4m4 4l4-4" />
  </svg>
);

export function ChartContainer({ title, svgContent, children, filename = 'chart', excelData }: ChartContainerProps) {
  const [copyLabel, setCopyLabel] = useState('Copy to Clipboard');
  const [exportError, setExportError] = useState('');

  // Every chart names its files after its title, so a folder of exported
  // figures can be told apart.
  const baseName = chartFilename(title, filename);

  const handleExportPNG = async () => {
    if (!svgContent) return;
    const ok = await exportChartPNG(svgContent, `${baseName}.png`);
    setExportError(ok
      ? ''
      : 'The PNG could not be created. Try Export SVG, or shorten any unusually long labels and try again.');
  };

  const handleExportSVG = () => {
    if (!svgContent) return;
    try {
      exportChartSVG(svgContent, `${baseName}.svg`);
      setExportError('');
    } catch (err) {
      console.error('SVG export failed:', err);
      setExportError('The SVG could not be created.');
    }
  };

  const handleCopyToClipboard = async () => {
    if (!svgContent) return;
    const result = await copyChartToClipboard(svgContent);
    if (result === 'copied') {
      setCopyLabel('Copied!');
    } else if (result === 'copied-svg') {
      setCopyLabel('Copied SVG!');
    } else {
      setCopyLabel('Copy failed');
    }
    setTimeout(() => setCopyLabel('Copy to Clipboard'), 2000);
  };

  const handleExportExcel = async () => {
    if (excelData) {
      await exportExcel(excelData, `${baseName}.xlsx`);
    }
  };

  const actions = [
    { label: 'Export PNG', onClick: handleExportPNG, icon: ExportIcons.image, disabled: !svgContent },
    { label: 'Export SVG', onClick: handleExportSVG, icon: VectorIcon, variant: 'secondary' as const, disabled: !svgContent },
    { label: copyLabel, onClick: handleCopyToClipboard, icon: ClipboardIcon, variant: 'secondary' as const, disabled: !svgContent },
    { label: 'Export to Excel', onClick: handleExportExcel, icon: ExcelIcon, variant: 'secondary' as const, disabled: !excelData },
  ];

  return (
    <div>
      {/* The title, subtitle and source are part of the drawing, so what is on
          screen is what is exported. They used to be repeated here in HTML,
          which showed each of them twice. */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-6">
        {/* Chart content - the SVG scales down to fit a narrow container */}
        <div className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto">
          {children}
        </div>
      </div>

      <ResultsActions actions={actions} />

      {exportError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {exportError}
        </p>
      )}
    </div>
  );
}
