/**
 * The epidemic curve as a standalone SVG.
 *
 * This is the one drawing both exports are made from: "Export SVG" saves it
 * and "Export PNG" rasterises it. PNG used to be a screenshot of the page taken
 * with html2canvas, which cannot read the oklch() colours Tailwind 4 emits; it
 * threw, the error went to the console, and the button did nothing. A
 * screenshot was also cropped to the visible part of a chart wide enough to
 * scroll. Drawing from the data has neither problem.
 *
 * It lived inside the component, where nothing could test it.
 */
import type { Annotation, ColorScheme, EpiCurveData } from './epiCurve';
import { annotationSpan, binSizeNote, chooseAxisLabels, getColorForStrata, spanInBins } from './epiCurve';
import { assignLabelRows, estimateLabelWidth, LABEL_FONT_STACKS, LABEL_FONT_WEIGHTS } from './labelLayout';
import { CHART_FONT_FAMILY, escapeXml } from './chartExport';

export interface EpiCurveSvgInput {
  data: EpiCurveData;
  /** Top of the y axis, shared with the on-screen chart. */
  yMax: number;
  title: string;
  xLabel: string;
  yLabel: string;
  showGrid: boolean;
  showCounts: boolean;
  stratifyBy: string;
  colorScheme: ColorScheme;
  annotations: Annotation[];
  exposureWindow: { start: Date; end: Date } | null;
}

const PLOT_HEIGHT = 330;
const MARGIN_LEFT = 60;
const AXIS_LABEL_FONT = 11;
const ANNOTATION_LABEL_FONT = 10;
const ANNOTATION_ROW_HEIGHT = 13;
const LEGEND_ROW_HEIGHT = 18;
/** cos 45°: how far a label rotated 45° reaches sideways and downwards per pixel of length. */
const DIAGONAL = Math.SQRT1_2;

/**
 * Plot width for a number of bars: 40px a bar, within limits.
 *
 * The lower limit keeps a three-bar outbreak from being a sliver. The upper
 * one is new: width used to grow without limit, so four months of daily bars
 * exported 4,980px wide with the title and legend centred 2,490px in, off the
 * side of any page it was pasted into. Past the limit the bars narrow instead.
 */
function plotWidthFor(binCount: number): number {
  return Math.min(1460, Math.max(660, binCount * 40));
}

export function generateEpiCurveSVG(input: EpiCurveSvgInput): string {
  const { data, yMax, title, xLabel, yLabel, showGrid, showCounts, stratifyBy, colorScheme, annotations, exposureWindow } = input;
  const bins = data.bins;
  const plotWidth = plotWidthFor(bins.length);
  const barWidth = bins.length > 0 ? plotWidth / bins.length : plotWidth;
  const stratified = Boolean(stratifyBy) && data.strataKeys.length > 0;

  // X labels sit at 45° under their bars; thin them so neighbours do not touch.
  const axisLabels = chooseAxisLabels(bins, data.binSize, plotWidth / 24);
  const labelWidths = axisLabels.map(l => estimateLabelWidth(l.text, AXIS_LABEL_FONT));
  const longestLabel = labelWidths.length > 0 ? Math.max(...labelWidths) : 0;

  // The right margin has to hold the last label, which runs down and to the
  // right from the middle of its bar. A fixed 80px clipped it.
  let marginRight = 30;
  axisLabels.forEach((label, i) => {
    const labelRight = (label.index + 0.5) * barWidth + labelWidths[i] * DIAGONAL + 8;
    marginRight = Math.max(marginRight, labelRight - plotWidth);
  });
  const width = Math.round(MARGIN_LEFT + plotWidth + marginRight);

  // Legend entries take the room their text needs and wrap onto further rows.
  // Each used to get a fixed 120px, so long names overlapped and more than six
  // strata ran off both sides.
  const legendRows: { key: string; index: number; width: number }[][] = [];
  if (stratified) {
    const available = width - 40;
    let row: { key: string; index: number; width: number }[] = [];
    let rowWidth = 0;
    data.strataKeys.forEach((key, index) => {
      const itemWidth = 16 + estimateLabelWidth(key, 12) + 18;
      if (row.length > 0 && rowWidth + itemWidth > available) {
        legendRows.push(row);
        row = [];
        rowWidth = 0;
      }
      row.push({ key, index, width: itemWidth });
      rowWidth += itemWidth;
    });
    if (row.length > 0) legendRows.push(row);
  }

  const note = binSizeNote(data.binSize);
  const marginTop = 60 + Math.max(0, legendRows.length - 1) * LEGEND_ROW_HEIGHT;
  const labelDepth = 12 + longestLabel * DIAGONAL + 10;
  const marginBottom = Math.round(labelDepth + 24 + (note ? 16 : 0) + 10);
  const height = marginTop + PLOT_HEIGHT + marginBottom;
  const plotBottom = marginTop + PLOT_HEIGHT;
  const plotRight = MARGIN_LEFT + plotWidth;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${CHART_FONT_FAMILY}" style="background: white;">`;

  // Title
  if (title.trim()) {
    svg += `<text x="${width / 2}" y="30" text-anchor="middle" font-size="18" font-weight="bold">${escapeXml(title)}</text>`;
  }

  // Legend for stratified charts
  legendRows.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((sum, item) => sum + item.width, 0) - 18;
    let x = (width - rowWidth) / 2;
    const y = 45 + rowIndex * LEGEND_ROW_HEIGHT;
    row.forEach(item => {
      const color = getColorForStrata(item.key, item.index, colorScheme);
      svg += `<rect x="${x}" y="${y}" width="12" height="12" fill="${color}"/>`;
      svg += `<text x="${x + 16}" y="${y + 10}" font-size="12">${escapeXml(item.key)}</text>`;
      x += item.width;
    });
  });

  // Y-axis label
  const plotMiddle = marginTop + PLOT_HEIGHT / 2;
  svg += `<text x="20" y="${plotMiddle}" text-anchor="middle" font-size="14" transform="rotate(-90, 20, ${plotMiddle})">${escapeXml(yLabel)}</text>`;

  // X-axis label, and under it what the bars are when the labels cannot say
  const xLabelY = plotBottom + labelDepth + 18;
  svg += `<text x="${MARGIN_LEFT + plotWidth / 2}" y="${xLabelY}" text-anchor="middle" font-size="14">${escapeXml(xLabel)}</text>`;
  if (note) {
    svg += `<text x="${MARGIN_LEFT + plotWidth / 2}" y="${xLabelY + 17}" text-anchor="middle" font-size="10" fill="#6B7280">${escapeXml(note)}</text>`;
  }

  // Grid lines
  if (showGrid) {
    for (let i = 0; i <= 5; i++) {
      const y = marginTop + (i / 5) * PLOT_HEIGHT;
      svg += `<line x1="${MARGIN_LEFT}" y1="${y}" x2="${plotRight}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
    }
  }

  // Y-axis ticks (same yMax scale as the on-screen chart)
  for (let i = 0; i <= 5; i++) {
    const value = Math.round((yMax * (5 - i)) / 5);
    const y = marginTop + (i / 5) * PLOT_HEIGHT;
    svg += `<text x="${MARGIN_LEFT - 10}" y="${y + 4}" text-anchor="end" font-size="12">${value}</text>`;
  }

  // Bars. An epidemic curve is a histogram, so neighbouring bars touch; a 1px
  // hairline on the left keeps equal bars apart without reading as a gap.
  const hairline = barWidth >= 6 ? 1 : 0;
  bins.forEach((bin, index) => {
    const x = MARGIN_LEFT + index * barWidth;

    if (stratified) {
      let cumHeight = 0;
      data.strataKeys.forEach((key, keyIndex) => {
        const count = bin.strataTotals.get(key) ?? 0;
        if (count > 0) {
          const barHeight = (count / yMax) * PLOT_HEIGHT;
          const y = plotBottom - cumHeight - barHeight;
          const color = getColorForStrata(key, keyIndex, colorScheme);
          svg += `<rect x="${x + hairline}" y="${y}" width="${barWidth - hairline}" height="${barHeight}" fill="${color}"/>`;
          cumHeight += barHeight;
        }
      });
    } else if (bin.total > 0) {
      const barHeight = (bin.total / yMax) * PLOT_HEIGHT;
      const y = plotBottom - barHeight;
      svg += `<rect x="${x + hairline}" y="${y}" width="${barWidth - hairline}" height="${barHeight}" fill="#3B82F6"/>`;
    }

    // Case count, where the bar is wide enough to hold one
    if (showCounts && bin.total > 0 && barWidth >= 14) {
      const barHeight = (bin.total / yMax) * PLOT_HEIGHT;
      svg += `<text x="${x + barWidth / 2}" y="${plotBottom - barHeight - 5}" text-anchor="middle" font-size="10">${bin.total}</text>`;
    }
  });

  // Axis baseline
  svg += `<line x1="${MARGIN_LEFT}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="#D1D5DB" stroke-width="1"/>`;

  // X-axis labels
  axisLabels.forEach(label => {
    const labelX = MARGIN_LEFT + (label.index + 0.5) * barWidth;
    const labelY = plotBottom + 12;
    svg += `<text x="${labelX}" y="${labelY}" text-anchor="start" font-size="${AXIS_LABEL_FONT}" transform="rotate(45, ${labelX}, ${labelY})">${escapeXml(label.text)}</text>`;
  });

  const xAt = (position: number) => MARGIN_LEFT + position * barWidth;

  // Work out where every top-of-plot label wants to sit, and stack the ones
  // that would overlap. The export previously drew them all at the same height,
  // so close-together milestones printed straight through each other.
  const labelBoxes: { id: string; x: number; width: number }[] = [];

  const exposureSpan = exposureWindow
    ? spanInBins(bins, exposureWindow.start.getTime(), exposureWindow.end.getTime())
    : null;
  if (exposureSpan) {
    labelBoxes.push({ id: '__exposure__', x: xAt(exposureSpan.start) + 4, width: estimateLabelWidth('Est. Exposure', ANNOTATION_LABEL_FONT) });
  }
  const spans = new Map(annotations.map(ann => [ann.id, annotationSpan(ann, bins)]));
  annotations.forEach(ann => {
    const span = spans.get(ann.id);
    if (!span) return;
    // Hand-positioned labels are excluded: they sit where the user put them and
    // must not push automatically placed labels around.
    if (ann.labelOffsetX !== undefined || ann.labelOffsetY !== undefined) return;
    labelBoxes.push({
      id: ann.id,
      x: xAt(span.start) + 4,
      width: estimateLabelWidth(ann.label, ann.labelFontSize ?? ANNOTATION_LABEL_FONT),
    });
  });
  const labelRows = assignLabelRows(labelBoxes);
  const labelY = (id: string): number =>
    marginTop + 12 + (labelRows.get(id) ?? 0) * ANNOTATION_ROW_HEIGHT;

  /**
   * Where an annotation's label is drawn, matching the on-screen marker: a
   * hand-set offset wins, otherwise the automatic row. Returns the text anchor
   * plus a leader line back to the anchor when the label has been moved clear.
   */
  const labelPlacement = (ann: Annotation, anchorX: number) => {
    const hasOffset = ann.labelOffsetX !== undefined || ann.labelOffsetY !== undefined;
    const dx = ann.labelOffsetX ?? 0;
    const dy = ann.labelOffsetY ?? 0;
    const x = anchorX + 4 + dx;
    const y = hasOffset ? marginTop + 12 + dy : labelY(ann.id);
    const needsLeader = hasOffset && (Math.abs(dx) > 8 || dy > 8);
    const leader = needsLeader
      ? `<line x1="${anchorX}" y1="${y - 3}" x2="${x}" y2="${y - 3}" stroke="${ann.color}" stroke-width="1" stroke-dasharray="2 2"/>`
      : '';

    const size = ann.labelFontSize ?? ANNOTATION_LABEL_FONT;
    const shape = ann.labelShape ?? 'none';
    const family = ann.labelFontFamily ?? 'sans';
    // Sans labels inherit the chart's own font so the whole figure matches.
    const attrs =
      `font-size="${size}" ` +
      `font-weight="${LABEL_FONT_WEIGHTS[ann.labelFontWeight ?? 'medium']}" ` +
      (family === 'sans' ? '' : `font-family="${escapeXml(LABEL_FONT_STACKS[family])}" `) +
      `fill="${ann.color}"`;

    // Box and pill need a drawn container; SVG text has no background.
    let container = '';
    if (shape !== 'none') {
      const w = estimateLabelWidth(ann.label, size) + (shape === 'pill' ? 16 : 8);
      const h = size + 6;
      container =
        `<rect x="${x - (shape === 'pill' ? 8 : 4)}" y="${y - size + 1}" width="${w}" height="${h}" ` +
        `rx="${shape === 'pill' ? h / 2 : 3}" fill="#ffffff" stroke="${ann.color}" stroke-width="1"/>`;
    }
    return { x, y, leader, attrs, container };
  };

  // Exposure window shading (matches the on-screen translucent red band)
  if (exposureSpan) {
    const x1 = xAt(exposureSpan.start);
    const w = Math.max(xAt(exposureSpan.end) - x1, 2);
    svg += `<rect x="${x1}" y="${marginTop}" width="${w}" height="${PLOT_HEIGHT}" fill="rgba(220, 38, 38, 0.15)"/>`;
    if (!exposureSpan.clippedStart) {
      svg += `<line x1="${x1}" y1="${marginTop}" x2="${x1}" y2="${plotBottom}" stroke="#F87171" stroke-width="2"/>`;
    }
    if (!exposureSpan.clippedEnd) {
      svg += `<line x1="${x1 + w}" y1="${marginTop}" x2="${x1 + w}" y2="${plotBottom}" stroke="#F87171" stroke-width="2"/>`;
    }
    svg += `<text x="${x1 + 4}" y="${labelY('__exposure__')}" font-size="${ANNOTATION_LABEL_FONT}" font-weight="500" fill="#B91C1C">Est. Exposure</text>`;
  }

  // Annotations (dashed markers / shaded ranges, as on screen)
  annotations.forEach(ann => {
    const span = spans.get(ann.id);
    if (!span) return;
    const x = xAt(span.start);

    if (ann.endDate) {
      const w = Math.max(xAt(span.end) - x, 2);
      svg += `<rect x="${x}" y="${marginTop}" width="${w}" height="${PLOT_HEIGHT}" fill="${ann.color}" opacity="0.1"/>`;
      if (!span.clippedStart) {
        svg += `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${plotBottom}" stroke="${ann.color}" stroke-width="1" stroke-dasharray="4 3"/>`;
      }
      if (!span.clippedEnd) {
        svg += `<line x1="${x + w}" y1="${marginTop}" x2="${x + w}" y2="${plotBottom}" stroke="${ann.color}" stroke-width="1" stroke-dasharray="4 3"/>`;
      }
    } else {
      svg += `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${plotBottom}" stroke="${ann.color}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    }
    const p = labelPlacement(ann, x);
    svg += p.leader + p.container;
    svg += `<text x="${p.x}" y="${p.y}" ${p.attrs}>${escapeXml(ann.label)}</text>`;
  });

  svg += '</svg>';
  return svg;
}
