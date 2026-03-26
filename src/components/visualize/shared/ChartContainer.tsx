import React, { useRef, useState, useEffect } from 'react';
import { ResultsActions, ExportIcons } from '../../shared/ResultsActions';
import { exportPNG, copyChartToClipboard, exportExcel } from '../../../utils/chartExport';
import type { ExcelExportData } from '../../../utils/chartExport';

/** Hook that tracks the width of a container element */
export function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setWidth(el.clientWidth);
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  source?: string;
  svgContent?: string;  // SVG string used for PNG export and clipboard
  children: React.ReactNode;
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

export function ChartContainer({ title, subtitle, source, svgContent, children, filename = 'chart', excelData }: ChartContainerProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [copyLabel, setCopyLabel] = useState('Copy to Clipboard');

  const handleExportPNG = async () => {
    if (svgContent) {
      await exportPNG(svgContent, `${filename}.png`);
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
      await exportExcel(excelData, `${filename}.xlsx`);
    }
  };

  const actions = [
    { label: 'Export PNG', onClick: handleExportPNG, icon: ExportIcons.image, disabled: !svgContent },
    { label: copyLabel, onClick: handleCopyToClipboard, icon: ClipboardIcon, variant: 'secondary' as const, disabled: !svgContent },
    { label: 'Export to Excel', onClick: handleExportExcel, icon: ExcelIcon, variant: 'secondary' as const, disabled: !excelData },
  ];

  return (
    <div>
      <div ref={chartRef} className="bg-white border border-gray-200 rounded-lg p-3 sm:p-6">
        {/* Chart header */}
        <div className="mb-4">
          <h3 className="text-base sm:text-lg font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs sm:text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>

        {/* Chart content - scales SVGs to fit container on mobile */}
        <div className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto">
          {children}
        </div>

        {/* Source line */}
        {source && (
          <p className="text-xs text-gray-400 mt-4 pt-2 border-t border-gray-100">
            Source: {source}
          </p>
        )}
      </div>

      <ResultsActions actions={actions} />
    </div>
  );
}
