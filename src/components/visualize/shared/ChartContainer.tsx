import React, { useRef } from 'react';
import { ResultsActions, ExportIcons } from '../../shared/ResultsActions';
import { exportSVG, exportPNG } from '../../../utils/chartExport';

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  source?: string;
  svgContent?: string;  // For SVG export
  children: React.ReactNode;
  filename?: string;
}

export function ChartContainer({ title, subtitle, source, svgContent, children, filename = 'chart' }: ChartContainerProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  const handleExportSVG = () => {
    if (svgContent) {
      exportSVG(svgContent, `${filename}.svg`);
    }
  };

  const handleExportPNG = async () => {
    if (chartRef.current) {
      await exportPNG(chartRef.current, `${filename}.png`);
    }
  };

  const actions = [
    { label: 'Export SVG', onClick: handleExportSVG, icon: ExportIcons.download, disabled: !svgContent },
    { label: 'Export PNG', onClick: handleExportPNG, icon: ExportIcons.image, variant: 'secondary' as const },
  ];

  return (
    <div>
      <div ref={chartRef} className="bg-white border border-gray-200 rounded-lg p-6">
        {/* Chart header */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>

        {/* Chart content */}
        <div className="overflow-x-auto">
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
