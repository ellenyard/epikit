/**
 * Shared layout maths for chart labels that are anchored to an x position and
 * would otherwise be drawn on top of each other.
 *
 * Epi-curve annotations and 7-1-7 milestones are each pinned to the x position
 * of the date they mark. When two marked dates fall close together the labels
 * collide, which is worst precisely when a response went well: a textbook
 * 7-1-7 puts detection, notification and response a day apart, so their labels
 * land within a bar-width of each other.
 *
 * Callers estimate each label's rendered width, then use `assignLabelRows` to
 * stack the ones that would overlap onto successive rows.
 */

export interface LabelBox {
  /** Stable identifier, returned as the key of the row map. */
  id: string;
  /** Left edge of the label, in the same units as `width`. */
  x: number;
  /** Rendered width of the label. */
  width: number;
}

/**
 * Average glyph width as a fraction of font size, for a medium-weight UI sans.
 * Deliberately a slight over-estimate: over-estimating stacks a label that
 * might have fitted, while under-estimating lets labels overlap.
 */
const GLYPH_WIDTH_RATIO = 0.58;

/** Estimate the rendered width of a label without measuring the DOM. */
export function estimateLabelWidth(text: string, fontSize: number, padding = 0): number {
  return text.length * fontSize * GLYPH_WIDTH_RATIO + padding;
}

/**
 * Assign each label a row index so that no two labels sharing a row overlap.
 *
 * Labels are placed left to right; each takes the topmost row where it clears
 * the previous occupant of that row by at least `gap`. Row 0 is the topmost,
 * so a chart with no collisions leaves every label at 0 and looks unchanged.
 *
 * @returns a map of label id to row index.
 */
export function assignLabelRows(labels: LabelBox[], gap = 6): Map<string, number> {
  const rows = new Map<string, number>();
  if (labels.length === 0) return rows;

  // Place left to right so that "first come, topmost row" is stable and
  // predictable. Ties keep their original relative order.
  const ordered = labels.map((label, index) => ({ label, index }));
  ordered.sort((a, b) => (a.label.x - b.label.x) || (a.index - b.index));

  // rowEnds[r] is the right edge of the last label placed in row r.
  const rowEnds: number[] = [];

  for (const { label } of ordered) {
    let row = rowEnds.findIndex(end => label.x >= end + gap);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = label.x + label.width;
    rows.set(label.id, row);
  }

  return rows;
}

/**
 * Font stacks offered for annotation labels.
 *
 * Deliberately a short list of stacks rather than a free font picker: SVG
 * export names a font family but does not embed it, and PNG export rasterises
 * whatever the local browser resolved. A figure styled in an arbitrary font
 * would re-render differently, with different text metrics, on a colleague's
 * machine. These three resolve sensibly on every platform.
 */
export const LABEL_FONT_STACKS = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export type LabelFontFamily = keyof typeof LABEL_FONT_STACKS;

export const LABEL_FONT_WEIGHTS = {
  normal: 400,
  medium: 500,
  bold: 700,
} as const;

export type LabelFontWeight = keyof typeof LABEL_FONT_WEIGHTS;

/** Container treatment drawn behind a label. */
export type LabelShape = 'none' | 'box' | 'pill';

export const DEFAULT_LABEL_FONT_SIZE = 12;
