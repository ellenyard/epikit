import React, { useRef, useState } from 'react';
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

const ClipboardIcon = (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
  </svg>
);

export function ChartContainer({ title, subtitle, source, svgContent, children, filename = 'chart' }: ChartContainerProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [copyLabel, setCopyLabel] = useState('Copy to Clipboard');

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

  const handleCopyToClipboard = async () => {
    if (!chartRef.current) return;
    try {
      const canvas = document.createElement('canvas');
      const rect = chartRef.current.getBoundingClientRect();
      const scale = 2; // retina quality
      canvas.width = rect.width * scale;
      canvas.height = rect.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Use html2canvas-like approach via SVG foreignObject
      const svgData = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml">
              ${chartRef.current.innerHTML}
            </div>
          </foreignObject>
        </svg>`;

      const img = new Image();
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });

      canvas.toBlob(async (pngBlob) => {
        if (pngBlob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': pngBlob }),
            ]);
            setCopyLabel('Copied!');
            setTimeout(() => setCopyLabel('Copy to Clipboard'), 2000);
          } catch {
            // Fallback: copy SVG as text
            if (svgContent) {
              await navigator.clipboard.writeText(svgContent);
              setCopyLabel('Copied SVG!');
              setTimeout(() => setCopyLabel('Copy to Clipboard'), 2000);
            }
          }
        }
      }, 'image/png');
    } catch {
      // Final fallback: copy raw SVG
      if (svgContent) {
        try {
          await navigator.clipboard.writeText(svgContent);
          setCopyLabel('Copied SVG!');
          setTimeout(() => setCopyLabel('Copy to Clipboard'), 2000);
        } catch {
          setCopyLabel('Copy failed');
          setTimeout(() => setCopyLabel('Copy to Clipboard'), 2000);
        }
      }
    }
  };

  const actions = [
    { label: 'Export SVG', onClick: handleExportSVG, icon: ExportIcons.download, disabled: !svgContent },
    { label: 'Export PNG', onClick: handleExportPNG, icon: ExportIcons.image, variant: 'secondary' as const },
    { label: copyLabel, onClick: handleCopyToClipboard, icon: ClipboardIcon, variant: 'secondary' as const },
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
