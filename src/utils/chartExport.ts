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

// Convert SVG string to a PNG blob via canvas (reliable, no html2canvas needed)
function svgToPngBlob(svgContent: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Parse SVG to get dimensions
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;
    const width = parseFloat(svgEl.getAttribute('width') || '800');
    const height = parseFloat(svgEl.getAttribute('height') || '500');

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Could not get canvas context'));

    const img = new Image();
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error('Failed to create PNG blob'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG as image'));
    };
    img.src = url;
  });
}

// Export SVG content as PNG file (converts SVG → canvas → PNG)
export async function exportPNG(svgContent: string, filename: string): Promise<void> {
  try {
    const pngBlob = await svgToPngBlob(svgContent);
    downloadBlob(pngBlob, filename);
  } catch (err) {
    console.error('PNG export failed:', err);
  }
}

// Copy SVG content as PNG image to clipboard
export async function copyChartToClipboard(svgContent: string): Promise<'copied' | 'copied-svg' | 'failed'> {
  try {
    const pngBlob = await svgToPngBlob(svgContent);
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob }),
    ]);
    return 'copied';
  } catch {
    // Fallback: copy SVG as text
    try {
      await navigator.clipboard.writeText(svgContent);
      return 'copied-svg';
    } catch {
      return 'failed';
    }
  }
}

// Export chart data to Excel via SheetJS
export async function exportExcel(
  data: ExcelExportData,
  filename: string
): Promise<void> {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Build the worksheet data: header row + data rows
    const wsData: (string | number | null)[][] = [];

    // Add title as first row if provided
    if (data.title) {
      wsData.push([data.title]);
      if (data.subtitle) wsData.push([data.subtitle]);
      wsData.push([]); // blank row
    }

    // Header row
    wsData.push(data.columns.map(c => c.header));

    // Data rows
    for (const row of data.rows) {
      wsData.push(data.columns.map(c => row[c.key] ?? null));
    }

    // Add source row if provided
    if (data.source) {
      wsData.push([]);
      wsData.push([`Source: ${data.source}`]);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-size columns (approximate)
    const colWidths = data.columns.map((c) => {
      let maxLen = c.header.length;
      for (const row of data.rows) {
        const val = row[c.key];
        const len = val != null ? String(val).length : 0;
        if (len > maxLen) maxLen = len;
      }
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Chart Data');
    XLSX.writeFile(wb, filename);
  } catch (err) {
    console.error('Excel export failed:', err);
  }
}

// Data structure for Excel export
export interface ExcelExportColumn {
  header: string;
  key: string;
}

export interface ExcelExportData {
  title?: string;
  subtitle?: string;
  source?: string;
  columns: ExcelExportColumn[];
  rows: Record<string, string | number | null>[];
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
    dumbbell: { width: 800, height: 500, margin: { top: 60, right: 60, bottom: 60, left: 180 } },
    forest: { width: 800, height: 500, margin: { top: 60, right: 60, bottom: 60, left: 180 } },
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
