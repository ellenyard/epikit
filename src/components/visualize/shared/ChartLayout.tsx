import type { Dataset } from '../../../types/analysis';

/**
 * The two-column layout every gallery chart is drawn in: settings on the
 * left, the chart on the right.
 *
 * Each chart carried its own copy of the three class strings, and they had
 * drifted. On a laptop the settings column is longer than the screen, so
 * editing the title or the colours at the bottom of it scrolled the chart
 * clean off the top; the chart column now sticks to the top of the scrolling
 * area and scrolls within itself when it is taller than the window. On a
 * phone the two columns used to sit side by side, which left the chart a
 * strip a few pixels wide; they now stack.
 */

/** The row holding both columns. */
export const CHART_ROW_CLASS = 'flex flex-col lg:flex-row gap-6';

/** The settings column. */
export const SETTINGS_COLUMN_CLASS = 'w-full lg:w-72 flex-shrink-0 space-y-4';

/**
 * The chart column. The offset and the height are measured against the
 * module's scrolling area, which is the window less the app header and the
 * dataset bar.
 */
export const CHART_COLUMN_CLASS = 'flex-1 min-w-0 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto';

/** What every gallery chart is given. */
export interface ChartProps {
  /** The records to draw, already narrowed by the Records filter. */
  dataset: Dataset;
  /** A note for the chart's footer when the Records filter has excluded records; '' otherwise. */
  filterNote?: string;
}
