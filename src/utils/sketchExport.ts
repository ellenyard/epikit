/**
 * Building the SVG file a sketch map downloads.
 *
 * On screen the legend is HTML beside the drawing. SVG export cloned only the
 * <svg>, so the legend was dropped and the file arrived as a map of unexplained
 * symbols, with nothing to say it had happened. The legend is therefore also
 * drawn as SVG off screen and stitched in here.
 *
 * This works on markup strings rather than DOM nodes so the geometry can be
 * tested directly, which is where the mistakes live: the wrong offset puts the
 * legend on top of the drawing, and the wrong size crops it out of the file.
 */

export type SketchLegendPosition = 'side' | 'below';

export const SKETCH_CANVAS_WIDTH = 1200;
export const SKETCH_CANVAS_HEIGHT = 800;
export const LEGEND_EXPORT_WIDTH = 320;
export const LEGEND_EXPORT_ROW_HEIGHT = 30;
export const LEGEND_EXPORT_HEADER_HEIGHT = 34;
export const LEGEND_EXPORT_PADDING = 16;
export const SKETCH_EXPORT_GAP = 16;
export const SKETCH_EXPORT_FONT_STACK =
  'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

export function legendExportHeight(itemCount: number): number {
  return (
    LEGEND_EXPORT_PADDING * 2 +
    LEGEND_EXPORT_HEADER_HEIGHT +
    itemCount * LEGEND_EXPORT_ROW_HEIGHT
  );
}

export interface SketchExportInput {
  /** Serialised children of the sketch <svg>, already drawn at canvas scale. */
  sketchInner: string;
  /** Serialised children of the off-screen legend <svg>, or null to omit it. */
  legendInner: string | null;
  legendPosition: SketchLegendPosition;
  legendItemCount: number;
}

export interface SketchExportResult {
  svg: string;
  width: number;
  height: number;
  includesLegend: boolean;
}

export function composeSketchExport({
  sketchInner,
  legendInner,
  legendPosition,
  legendItemCount,
}: SketchExportInput): SketchExportResult {
  // A legend with no rows is a heading and nothing else, so it is not attached.
  const includesLegend = Boolean(legendInner) && legendItemCount > 0;
  const side = legendPosition === 'side';
  const legendHeight = legendExportHeight(legendItemCount);

  const width =
    SKETCH_CANVAS_WIDTH +
    (includesLegend && side ? SKETCH_EXPORT_GAP + LEGEND_EXPORT_WIDTH : 0);
  const height =
    SKETCH_CANVAS_HEIGHT +
    (includesLegend && !side ? SKETCH_EXPORT_GAP + legendHeight : 0);

  const legendTransform = side
    ? `translate(${SKETCH_CANVAS_WIDTH + SKETCH_EXPORT_GAP}, 0)`
    : `translate(0, ${SKETCH_CANVAS_HEIGHT + SKETCH_EXPORT_GAP})`;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    // Without this the file is transparent, which prints black in some viewers.
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>`,
    `<g>${sketchInner}</g>`,
  ];

  if (includesLegend) {
    parts.push(`<g transform="${legendTransform}">${legendInner}</g>`);
  }

  parts.push('</svg>');

  return { svg: parts.join(''), width, height, includesLegend };
}
