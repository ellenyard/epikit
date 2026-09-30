/**
 * Saving and restoring hand-drawn sketch maps.
 *
 * The sketch map was the only analysis module that kept nothing. Because the
 * three map modes are a ternary, switching from Sketch Map to Spot Map unmounts
 * the component, so a single click discarded the drawing with no warning, as did
 * a reload or a change of dataset. A village sketch takes real time to draw in
 * the field, and none of it survived.
 *
 * Restored state is untrusted: it comes from localStorage, which another tab or
 * an older build may have written, and from project files, which arrive from
 * whoever sent them. A malformed element does not crash the renderer, it draws
 * nothing, so bad data is invisible rather than loud. Everything is therefore
 * validated on the way in, and a single unusable element is dropped rather than
 * costing the whole map.
 */

export type SketchTool =
  | 'pen' | 'line' | 'curve' | 'wavy' | 'area' | 'irregularArea' | 'marker' | 'label';
export type SketchBackground = 'grid' | 'blank';
export type FillPattern = 'solid' | 'hatch' | 'crosshatch' | 'dots' | 'waves' | 'grid';
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type LegendPosition = 'side' | 'below';
export type MarkerShape =
  | 'circle' | 'house' | 'tree' | 'triangle' | 'paw' | 'water' | 'pond' | 'star'
  | 'square' | 'diamond' | 'cross' | 'animal' | 'school' | 'clinic' | 'well'
  | 'latrine' | 'waste' | 'market' | 'food' | 'gathering';

export interface Point { x: number; y: number }

export interface SketchElement {
  id: string;
  type: SketchTool;
  points?: Point[];
  start?: Point;
  end?: Point;
  text?: string;
  color: string;
  fillColor?: string;
  strokeWidth: number;
  size: number;
  fillPattern: FillPattern;
  lineStyle: LineStyle;
  markerId?: string;
  markerShape?: MarkerShape;
  legendLabel?: string;
  filled: boolean;
  opacity: number;
}

export interface SketchPersistedState {
  elements: SketchElement[];
  background: SketchBackground;
  showTitle: boolean;
  title: string;
  subtitle: string;
  showLegend: boolean;
  legendPosition: LegendPosition;
}

const SKETCH_TOOLS: readonly SketchTool[] =
  ['pen', 'line', 'curve', 'wavy', 'area', 'irregularArea', 'marker', 'label'];
const FILL_PATTERNS: readonly FillPattern[] =
  ['solid', 'hatch', 'crosshatch', 'dots', 'waves', 'grid'];
const LINE_STYLES: readonly LineStyle[] = ['solid', 'dashed', 'dotted'];
const BACKGROUNDS: readonly SketchBackground[] = ['grid', 'blank'];
const LEGEND_POSITIONS: readonly LegendPosition[] = ['side', 'below'];
const MARKER_SHAPES: readonly MarkerShape[] = [
  'circle', 'house', 'tree', 'triangle', 'paw', 'water', 'pond', 'star',
  'square', 'diamond', 'cross', 'animal', 'school', 'clinic', 'well',
  'latrine', 'waste', 'market', 'food', 'gathering',
];

export const SKETCH_STORAGE_PREFIX = 'epikit_sketchmap_';

/**
 * Caps. A sketch with a pathological number of elements or points would stall
 * the renderer on restore, the same way an unvalidated bin size once hung the
 * epi curve. Both limits sit far above any hand-drawn map: the village template
 * uses well under a hundred elements, and a long pen stroke a few hundred
 * points.
 */
export const MAX_SKETCH_ELEMENTS = 2000;
export const MAX_POINTS_PER_ELEMENT = 5000;
/** Coordinates outside this range cannot be drawn and indicate corrupt data. */
const COORDINATE_LIMIT = 1e6;
/** How many steps of undo history to retain. */
export const HISTORY_LIMIT = 50;

export function sketchStorageKey(datasetId: string): string {
  return `${SKETCH_STORAGE_PREFIX}${datasetId}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const finiteCoordinate = (v: unknown): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (Math.abs(v) > COORDINATE_LIMIT) return null;
  return v;
};

function sanitizePoint(value: unknown): Point | null {
  if (!isRecord(value)) return null;
  const x = finiteCoordinate(value.x);
  const y = finiteCoordinate(value.y);
  if (x === null || y === null) return null;
  return { x, y };
}

const positiveNumber = (v: unknown, fallback: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return fallback;
  return v;
};

/** Opacity outside 0..1 renders inconsistently, so it is brought into range. */
const clamp01 = (v: unknown, fallback: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
};

const optionalString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

/**
 * Validate one element. Returns null when the element could not be drawn, so
 * the caller can drop it instead of restoring something invisible.
 */
export function sanitizeSketchElement(value: unknown): SketchElement | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id === '') return null;
  if (typeof value.type !== 'string' || !(SKETCH_TOOLS as readonly string[]).includes(value.type)) {
    return null;
  }
  const type = value.type as SketchTool;

  const start = sanitizePoint(value.start) ?? undefined;
  const end = sanitizePoint(value.end) ?? undefined;

  let points: Point[] | undefined;
  if (Array.isArray(value.points)) {
    const cleaned: Point[] = [];
    for (const raw of value.points.slice(0, MAX_POINTS_PER_ELEMENT)) {
      const p = sanitizePoint(raw);
      if (p) cleaned.push(p);
    }
    points = cleaned;
  }

  // The same geometry each shape needs in order to render at all.
  if (type === 'pen' || type === 'irregularArea') {
    if (!points || points.length < 2) return null;
  } else if (type === 'line' || type === 'curve' || type === 'wavy' || type === 'area') {
    if (!start || !end) return null;
  } else if (type === 'marker' || type === 'label') {
    if (!start) return null;
  }

  // A label with no text draws nothing and cannot be selected to fix.
  if (type === 'label' && (typeof value.text !== 'string' || value.text.trim() === '')) {
    return null;
  }

  return {
    id: value.id,
    type,
    ...(points ? { points } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(optionalString(value.text) !== undefined ? { text: value.text as string } : {}),
    color: typeof value.color === 'string' && value.color !== '' ? value.color : '#1F2937',
    ...(optionalString(value.fillColor) !== undefined ? { fillColor: value.fillColor as string } : {}),
    strokeWidth: positiveNumber(value.strokeWidth, 4),
    size: positiveNumber(value.size, 40),
    fillPattern: oneOf(value.fillPattern, FILL_PATTERNS, 'solid'),
    lineStyle: oneOf(value.lineStyle, LINE_STYLES, 'solid'),
    ...(optionalString(value.markerId) !== undefined ? { markerId: value.markerId as string } : {}),
    ...(typeof value.markerShape === 'string' &&
      (MARKER_SHAPES as readonly string[]).includes(value.markerShape)
      ? { markerShape: value.markerShape as MarkerShape }
      : {}),
    ...(optionalString(value.legendLabel) !== undefined ? { legendLabel: value.legendLabel as string } : {}),
    filled: value.filled === true,
    opacity: clamp01(value.opacity, 1),
  };
}

/**
 * Validate a whole saved sketch. Returns null only when there is nothing
 * usable to restore; a sketch with some bad elements keeps the good ones.
 */
export function sanitizeSketchState(value: unknown): SketchPersistedState | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.elements)) return null;

  const elements: SketchElement[] = [];
  const seen = new Set<string>();
  for (const raw of value.elements.slice(0, MAX_SKETCH_ELEMENTS)) {
    const element = sanitizeSketchElement(raw);
    if (!element) continue;
    // Duplicate ids make selection and deletion act on the wrong element.
    if (seen.has(element.id)) continue;
    seen.add(element.id);
    elements.push(element);
  }

  return {
    elements,
    background: oneOf(value.background, BACKGROUNDS, 'grid'),
    showTitle: value.showTitle !== false,
    title: typeof value.title === 'string' ? value.title : 'Sketch map',
    subtitle: typeof value.subtitle === 'string' ? value.subtitle : '',
    showLegend: value.showLegend !== false,
    legendPosition: oneOf(value.legendPosition, LEGEND_POSITIONS, 'side'),
  };
}

/**
 * Push a snapshot onto the undo stack, discarding the oldest once the limit is
 * reached so a long editing session cannot grow without bound.
 */
export function pushHistorySnapshot<T>(stack: T[], snapshot: T, limit = HISTORY_LIMIT): T[] {
  if (limit <= 0) return [];
  const next = [...stack, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** The subset of Storage these helpers need, so they can be tested directly. */
export interface SketchStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Read a saved sketch. Returns null when nothing is stored or the stored value
 * is unusable, in which case the caller starts from a blank canvas rather than
 * failing to mount.
 */
export function readSketchState(
  storage: SketchStorage | undefined,
  datasetId: string
): SketchPersistedState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(sketchStorageKey(datasetId));
    if (raw === null) return null;
    return sanitizeSketchState(JSON.parse(raw));
  } catch {
    // Corrupt JSON or storage that refuses to be read: start blank.
    return null;
  }
}

/**
 * Save a sketch. An empty sketch removes the entry instead of writing one, so
 * clearing the canvas does not leave a stored blank that would overwrite work
 * saved for the same dataset in another tab.
 */
export function writeSketchState(
  storage: SketchStorage | undefined,
  datasetId: string,
  state: SketchPersistedState
): boolean {
  if (!storage) return false;
  const key = sketchStorageKey(datasetId);
  try {
    if (state.elements.length === 0) {
      storage.removeItem(key);
      return true;
    }
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    // Quota exceeded or storage unavailable. The drawing stays on screen; only
    // the save is lost, so failing quietly is better than interrupting drawing.
    return false;
  }
}
