// Download any blob as a file
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export SVG string to file
export function exportSVG(svgContent: string, filename: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  downloadBlob(blob, filename);
}

// Export an HTML element as PNG using html2canvas (or fallback)
export async function exportPNG(element: HTMLElement, filename: string): Promise<void> {
  // Try to use html2canvas if available, otherwise use canvas fallback
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
    });
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename);
    }, 'image/png');
  } catch {
    // Fallback: create SVG-based PNG
    console.warn('html2canvas not available, using SVG export as fallback');
  }
}

// Standard chart dimensions
export interface ChartDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

export function getDefaultDimensions(chartType: string): ChartDimensions {
  // Return sensible defaults per chart type
  const defaults: Record<string, ChartDimensions> = {
    bar: { width: 800, height: 500, margin: { top: 50, right: 40, bottom: 60, left: 180 } }, // Wide left margin for labels
    line: { width: 800, height: 450, margin: { top: 50, right: 40, bottom: 80, left: 60 } },
    slope: { width: 600, height: 500, margin: { top: 60, right: 120, bottom: 40, left: 120 } },
    lollipop: { width: 800, height: 500, margin: { top: 50, right: 60, bottom: 60, left: 180 } },
    grouped: { width: 800, height: 500, margin: { top: 50, right: 40, bottom: 80, left: 60 } },
    bullet: { width: 800, height: 400, margin: { top: 50, right: 40, bottom: 40, left: 180 } },
    waffle: { width: 500, height: 500, margin: { top: 60, right: 20, bottom: 80, left: 20 } },
    dot: { width: 800, height: 500, margin: { top: 50, right: 60, bottom: 60, left: 180 } },
    heatmap: { width: 700, height: 500, margin: { top: 60, right: 80, bottom: 80, left: 120 } },
    paired: { width: 800, height: 500, margin: { top: 50, right: 60, bottom: 60, left: 120 } },
  };
  return defaults[chartType] || defaults.bar;
}

// SVG helper: escape XML special characters
export function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// SVG helper: generate axis line
export function svgAxisLine(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="1"/>`;
}

// SVG helper: generate horizontal gridline
export function svgGridLine(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#E5E7EB" stroke-width="1"/>`;
}

// SVG helper: generate text element with standard font
export function svgText(x: number, y: number, text: string, options: {
  anchor?: 'start' | 'middle' | 'end';
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fill?: string;
  rotate?: number;
  dy?: string;
} = {}): string {
  const { anchor = 'middle', fontSize = 12, fontWeight = 'normal', fill = '#333', rotate, dy } = options;
  const transform = rotate ? ` transform="rotate(${rotate}, ${x}, ${y})"` : '';
  const dyAttr = dy ? ` dy="${dy}"` : '';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fill="${fill}"${transform}${dyAttr}>${escapeXml(text)}</text>`;
}

// Generate SVG wrapper with white background
export function svgWrapper(width: number, height: number, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${content}</svg>`;
}

// Generate chart title and subtitle
export function svgTitle(width: number, title: string, subtitle?: string): string {
  let svg = svgText(width / 2, 25, title, { fontSize: 18, fontWeight: 'bold', fill: '#111' });
  if (subtitle) {
    svg += svgText(width / 2, 45, subtitle, { fontSize: 13, fill: '#666' });
  }
  return svg;
}

// Generate source annotation at bottom
export function svgSource(_width: number, height: number, source: string): string {
  return svgText(10, height - 8, `Source: ${source}`, { anchor: 'start', fontSize: 10, fill: '#999' });
}
