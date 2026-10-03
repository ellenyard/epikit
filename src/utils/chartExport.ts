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

/**
 * Export a chart as PNG and report whether it worked.
 *
 * exportPNG above swallows a failure and only logs it, so a click on the
 * button could do nothing at all with no word to the user. Kept as it is for
 * its existing callers; the chart gallery uses this form and shows the result.
 */
export async function exportChartPNG(svgContent: string, filename: string): Promise<boolean> {
  try {
    const pngBlob = await svgToPngBlob(svgContent);
    downloadBlob(pngBlob, filename);
    return true;
  } catch (err) {
    console.error('PNG export failed:', err);
    return false;
  }
}

/**
 * Font stack written into an exported SVG file.
 *
 * On screen the charts name the system UI font first, which only a browser
 * understands. Word, PowerPoint and Illustrator read the first family in the
 * list and nothing after it, and substitute their default serif when they do
 * not recognise it, so a figure pasted into a report arrived set in Times. A
 * file leads with a font that is installed everywhere.
 */
export const EXPORT_FONT_FAMILY = "Arial, Helvetica, 'Liberation Sans', sans-serif";

/** An SVG string as a file that stands on its own outside the app. */
export function toStandaloneSvg(svgContent: string): string {
  const portable = svgContent
    .split(`font-family="${CHART_FONT_FAMILY}"`).join(`font-family="${EXPORT_FONT_FAMILY}"`)
    .split(`font-family: ${CHART_FONT_FAMILY};`).join(`font-family: ${EXPORT_FONT_FAMILY};`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${portable}\n`;
}

/** Export a gallery chart as a standalone SVG file. */
export function exportChartSVG(svgContent: string, filename: string): void {
  exportSVG(toStandaloneSvg(svgContent), filename);
}

/**
 * A download filename taken from a chart's title.
 *
 * Whitespace becomes underscores and the characters a file system refuses are
 * dropped. An empty or unusable title falls back to the chart's own name.
 */
export function chartFilename(title: string | undefined, fallback: string): string {
  const cleaned = sanitizeXmlText(title ?? '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
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

export function getDefaultDimensions(chartType: string, containerWidth?: number): ChartDimensions {
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
  const dims = defaults[chartType] || defaults.bar;

  // If a container width is provided and it's smaller than the default, scale down
  if (containerWidth && containerWidth < dims.width) {
    const scale = containerWidth / dims.width;
    return {
      width: containerWidth,
      height: Math.round(dims.height * scale),
      margin: {
        top: Math.round(dims.margin.top * scale),
        right: Math.max(15, Math.round(dims.margin.right * scale)),
        bottom: Math.round(dims.margin.bottom * scale),
        left: Math.max(40, Math.round(dims.margin.left * scale)),
      },
    };
  }
  return dims;
}

/**
 * Remove the characters XML 1.0 does not allow.
 *
 * A vertical tab or other control character in a cell (they survive in some
 * system exports) made the whole SVG unparseable, and the PNG export then
 * failed without a word. Tabs and line breaks are legal but mean nothing in a
 * label, so they become spaces.
 */
export function sanitizeXmlText(str: string): string {
  return str
    // eslint-disable-next-line no-control-regex -- matching control characters is the purpose
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, '')
    // Half of a surrogate pair on its own is not a character. Matched without a
    // lookbehind, which older Safari cannot parse.
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, pair => (pair.length === 2 ? pair : ''))
    .replace(/[\t\n\r]+/g, ' ');
}

// SVG helper: escape XML special characters
export function escapeXml(str: string): string {
  return sanitizeXmlText(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Grey for notes and source lines: readable on white, quieter than the data. */
const NOTE_COLOR = '#6B7280';

/** Font stack the charts are drawn with on screen. */
export const CHART_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

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
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="${CHART_FONT_FAMILY}" fill="${fill}"${transform}${dyAttr}>${escapeXml(text)}</text>`;
}

// Generate SVG wrapper with white background.
// The viewBox is what lets a chart shrink to fit a narrow container: without it
// a width limit crops the drawing instead of scaling it. The white rect is the
// background that survives outside a browser, where the style attribute may not.
export function svgWrapper(width: number, height: number, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background: white; font-family: ${CHART_FONT_FAMILY};"><rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>${content}</svg>`;
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
  return svgText(10, height - 8, `Source: ${source}`, { anchor: 'start', fontSize: 10, fill: NOTE_COLOR });
}

/**
 * Rendered width of a label, estimated without a DOM. A slight over-estimate
 * for the system sans the charts use, so a label trimmed to fit does fit.
 */
export function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  return text.length * fontSize * (bold ? 0.62 : 0.57);
}

/** Shorten a label to a pixel width, marking the cut with an ellipsis. */
export function fitText(text: string, maxWidth: number, fontSize: number, bold = false): string {
  if (estimateTextWidth(text, fontSize, bold) <= maxWidth) return text;
  const perChar = fontSize * (bold ? 0.62 : 0.57);
  const keep = Math.max(1, Math.floor(maxWidth / perChar) - 1);
  return `${text.slice(0, keep).trimEnd()}\u2026`;
}

/**
 * Shorten a label that is drawn rotated, hanging down and to the left of `x`,
 * so that its far end stays on the canvas. The first few labels of a crowded
 * axis otherwise run off the left edge.
 */
export function fitRotatedLabel(text: string, x: number, fontSize: number, maxWidth = 150, angle = 40): string {
  const reach = Math.max(20, (x - 10) / Math.cos((angle * Math.PI) / 180));
  return fitText(text, Math.min(maxWidth, reach), fontSize);
}

/** Break a sentence into lines no wider than `maxWidth`. */
export function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && estimateTextWidth(candidate, fontSize, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface ChartHeader {
  svg: string;
  /** First y coordinate below the title block, where a legend or the plot may start. */
  bottom: number;
}

/** Lines a chart title may run to before the rest is cut. */
export const MAX_TITLE_LINES = 3;
const TITLE_FONT = 18;
const TITLE_LINE_HEIGHT = 22;

/**
 * A title broken into at most MAX_TITLE_LINES lines that fit `maxWidth`.
 *
 * Titles were cut with an ellipsis at the edge of the canvas, and the
 * automatic ones easily ran past it: "Share of records by Acute Malnutrition
 * (W…". A second line holds nearly every automatic title, and a third the
 * titles users write ("Suspected cholera cases by district and week of
 * onset, Northern Province, January to June 2026"); one that needs more
 * than three is cut at the end of the third.
 */
export function wrapTitle(title: string, maxWidth: number): string[] {
  const lines = wrapText(title, maxWidth, TITLE_FONT, true);
  if (lines.length <= MAX_TITLE_LINES) return lines;
  const kept = lines.slice(0, MAX_TITLE_LINES);
  kept[MAX_TITLE_LINES - 1] = fitText(lines.slice(MAX_TITLE_LINES - 1).join(' '), maxWidth, TITLE_FONT, true);
  return kept;
}

/**
 * Title and subtitle, with the height they occupy.
 *
 * Charts used to place their legend at a fixed y that assumed there was no
 * subtitle, so adding one printed it straight through the legend. The title
 * wraps onto a second line when it is too long for the canvas.
 */
export function svgHeader(width: number, title: string, subtitle?: string): ChartHeader {
  let svg = '';
  let bottom = 14;
  let y = 25;
  if (title) {
    const lines = wrapTitle(title, width - 24);
    lines.forEach((line, index) => {
      svg += svgText(width / 2, y + index * TITLE_LINE_HEIGHT, line, { fontSize: TITLE_FONT, fontWeight: 'bold', fill: '#111' });
    });
    y += (lines.length - 1) * TITLE_LINE_HEIGHT;
    bottom = y + 11;
  }
  if (subtitle) {
    y = title ? y + 20 : 22;
    svg += svgText(width / 2, y, fitText(subtitle, width - 24, 13), { fontSize: 13, fill: '#555' });
    bottom = y + 12;
  }
  return { svg, bottom };
}

export interface ChartFooter {
  svg: string;
  /** Total height the chart needs once the footer is included. */
  height: number;
}

/**
 * The notes and the source line under a chart, stacked from `top` down.
 *
 * Each chart positioned these by hand against a fixed canvas height, which is
 * how a source line came to sit on top of the last note and how notes came to
 * be printed across rotated axis labels. This lays them out in order, wraps a
 * long one, and returns the height the canvas must be to hold them.
 */
export function svgFooter(width: number, top: number, notes: string[], source?: string): ChartFooter {
  const fontSize = 10;
  const lineHeight = 14;
  let svg = '';
  let y = top;
  const lines = notes.flatMap(note => wrapText(note, width - 20, fontSize));
  if (source) lines.push(...wrapText(`Source: ${source}`, width - 20, fontSize));
  for (const line of lines) {
    y += lineHeight;
    svg += svgText(10, y, line, { anchor: 'start', fontSize, fill: NOTE_COLOR });
  }
  return { svg, height: Math.ceil(y + 12) };
}

/** Width each stratified panel is drawn at, so two sit side by side at about full size. */
export const FACET_PANEL_WIDTH = 540;

export interface FacetPanel {
  /** The stratum this panel shows. */
  label: string;
  /** Records in the stratum. */
  records: number;
  /** The panel's own chart, as produced by svgWrapper. */
  svg: string;
}

/** Pull the size and the drawing out of a chart produced by svgWrapper. */
function unwrapSvg(svg: string): { width: number; height: number; inner: string } | null {
  const match = /^<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"[^>]*>([\s\S]*)<\/svg>$/.exec(svg);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]), inner: match[3] };
}

/**
 * Lay stratified panels out as one figure.
 *
 * The panels were separate full-width drawings dropped into a grid of narrow
 * scrolling boxes, so only the left part of each showed and there was nothing
 * to export. One composed drawing scales to fit its container like any other
 * chart and exports the same way.
 */
export function composeFacetSvg(
  panels: FacetPanel[],
  options: { title: string; subtitle?: string; notes: string[]; source?: string; columns?: number },
): string {
  const parts = panels
    .map(panel => ({ panel, parsed: unwrapSvg(panel.svg) }))
    .filter((p): p is { panel: FacetPanel; parsed: NonNullable<ReturnType<typeof unwrapSvg>> } => p.parsed !== null);
  if (parts.length === 0) return '';

  const columns = Math.max(1, Math.min(options.columns ?? (parts.length > 6 ? 3 : 2), parts.length));
  const gap = 16;
  const pad = 12;
  const headerHeight = 34;
  const panelWidth = Math.max(...parts.map(p => p.parsed.width));
  const width = pad * 2 + columns * panelWidth + (columns - 1) * gap;

  const header = svgHeader(width, options.title, options.subtitle);
  let svg = header.svg;
  let rowTop = header.bottom + 8;

  for (let start = 0; start < parts.length; start += columns) {
    const row = parts.slice(start, start + columns);
    const rowHeight = Math.max(...row.map(p => p.parsed.height));
    row.forEach(({ panel, parsed }, index) => {
      const x = pad + index * (panelWidth + gap);
      svg += `<rect x="${x}" y="${rowTop}" width="${panelWidth}" height="${headerHeight}" fill="#F3F4F6" rx="4"/>`;
      svg += svgText(x + 10, rowTop + 15, fitText(panel.label, panelWidth - 20, 13, true), { anchor: 'start', fontSize: 13, fontWeight: 'bold', fill: '#1F2937' });
      svg += svgText(x + 10, rowTop + 28, `n = ${panel.records}`, { anchor: 'start', fontSize: 10, fill: NOTE_COLOR });
      svg += `<svg x="${x}" y="${rowTop + headerHeight}" width="${parsed.width}" height="${parsed.height}" viewBox="0 0 ${parsed.width} ${parsed.height}">${parsed.inner}</svg>`;
      // The frame goes on last, over the panel's own white background.
      svg += `<rect x="${x}" y="${rowTop}" width="${panelWidth}" height="${headerHeight + rowHeight}" fill="none" stroke="#D1D5DB" stroke-width="1" rx="4"/>`;
    });
    rowTop += headerHeight + rowHeight + gap;
  }

  const footer = svgFooter(width, rowTop - gap + 4, options.notes, options.source);
  return svgWrapper(width, footer.height, svg + footer.svg);
}

/**
 * Move label positions apart so that none sits closer than `minGap` to the
 * next, keeping their order and staying inside [lo, hi] where there is room.
 *
 * A slope chart prints a label at each end of every line. Two categories with
 * nearly the same value put their labels on top of each other, which is the
 * usual case rather than the exception.
 *
 * @returns the adjusted positions, in the order the input was given.
 */
export function spreadPositions(positions: number[], minGap: number, lo: number, hi: number): number[] {
  const order = positions.map((value, index) => ({ value, index })).sort((a, b) => (a.value - b.value) || (a.index - b.index));
  const placed = order.map(o => o.value);

  // Push each label down until it clears the one above it.
  for (let i = 1; i < placed.length; i++) {
    if (placed[i] < placed[i - 1] + minGap) placed[i] = placed[i - 1] + minGap;
  }
  // If that ran past the bottom, pull the tail back up as far as the gaps allow.
  if (placed.length > 0 && placed[placed.length - 1] > hi) {
    placed[placed.length - 1] = Math.max(hi, lo + (placed.length - 1) * minGap);
    for (let i = placed.length - 2; i >= 0; i--) {
      if (placed[i] > placed[i + 1] - minGap) placed[i] = placed[i + 1] - minGap;
    }
  }

  const result = new Array<number>(positions.length);
  order.forEach((o, i) => { result[o.index] = placed[i]; });
  return result;
}
