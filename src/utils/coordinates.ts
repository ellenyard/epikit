/**
 * Reading latitude and longitude out of a line list.
 *
 * This used to live inside the spot map, where it could not be tested, and it
 * took the first number it found in a cell. A coordinate written in degrees,
 * minutes and seconds lost everything after the degrees, a west longitude in
 * that form lost its sign, and a minus sign pasted from a word processor was
 * not recognised as one. Each of those drew a point in the wrong place and
 * counted it as valid.
 *
 * The rule now is that a cell is either read in full or reported as
 * unreadable. Nothing is taken from part of a value.
 */
import type { CaseRecord, DataColumn } from '../types/analysis';

export type CoordinateAxis = 'lat' | 'lng';
export type Hemisphere = 'N' | 'S' | 'E' | 'W';

export interface ParsedCoordinate {
  value: number;
  /** The compass letter or word written beside the number, if any. */
  hemisphere: Hemisphere | null;
  format: 'decimal' | 'dms';
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const HEMISPHERE = String.raw`north|south|east|west|[nsew]`;

const DECIMAL_PATTERN = new RegExp(
  String.raw`^(?:(${HEMISPHERE})\s*)?([-+]?)(${NUMBER})\s*°?\s*(${HEMISPHERE})?$`,
  'i'
);

// Degrees then minutes, then optionally seconds, separated by symbols or by
// spaces. Letter units (41d 39m 10s) are not accepted: "s" would be both
// seconds and south, and guessing between them is how a hemisphere gets lost.
const DMS_PATTERN = new RegExp(
  String.raw`^(?:(${HEMISPHERE})\s*)?([-+]?)(\d{1,3})\s*(?:°|\s)\s*(${NUMBER})\s*(?:'|\s|$)\s*(?:(${NUMBER})\s*(?:"|'')?)?\s*(${HEMISPHERE})?$`,
  'i'
);

function toHemisphere(text: string | undefined): Hemisphere | null {
  return text ? (text[0].toUpperCase() as Hemisphere) : null;
}

/**
 * Read one coordinate cell.
 *
 * Accepts decimal degrees with a period or a comma, an optional degree sign,
 * and a hemisphere as a letter or an English word on either side; and degrees
 * with minutes and optional seconds. Returns null for anything else, including
 * two coordinates in one cell.
 */
export function parseCoordinateDetailed(value: unknown): ParsedCoordinate | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { value, hemisphere: null, format: 'decimal' } : null;
  }
  if (value === null || value === undefined) return null;

  const text = String(value)
    .trim()
    // Typographic minus signs and dashes, which Number() does not understand.
    .replace(/[−‒–—﹣－]/g, '-')
    .replace(/[º˚]/g, '°')
    .replace(/[′’‘ʹ]/g, "'")
    .replace(/[″”“]/g, '"');
  if (!text) return null;

  const toNumber = (part: string) => Number(part.replace(',', '.'));

  const finish = (
    magnitude: number,
    sign: string,
    leading: string | undefined,
    trailing: string | undefined,
    format: 'decimal' | 'dms'
  ): ParsedCoordinate | null => {
    if (!Number.isFinite(magnitude)) return null;
    // A hemisphere on both sides says two things at once.
    if (leading && trailing) return null;
    const hemisphere = toHemisphere(leading ?? trailing);
    let signed = sign === '-' ? -magnitude : magnitude;
    if (hemisphere === 'S' || hemisphere === 'W') signed = -Math.abs(signed);
    // "-12.5 N" contradicts itself; it is not for this code to pick a side.
    else if (hemisphere && sign === '-') return null;
    return { value: signed, hemisphere, format };
  };

  const decimal = text.match(DECIMAL_PATTERN);
  if (decimal) {
    return finish(toNumber(decimal[3]), decimal[2], decimal[1], decimal[4], 'decimal');
  }

  const dms = text.match(DMS_PATTERN);
  if (dms) {
    const degrees = Number(dms[3]);
    const minutes = toNumber(dms[4]);
    const seconds = dms[5] === undefined ? 0 : toNumber(dms[5]);
    if (minutes >= 60 || seconds >= 60) return null;
    // Decimal minutes followed by seconds is not a real notation.
    if (dms[5] !== undefined && !Number.isInteger(minutes)) return null;
    return finish(degrees + minutes / 60 + seconds / 3600, dms[2], dms[1], dms[6], 'dms');
  }

  return null;
}

export function parseCoordinateValue(value: unknown): number | null {
  return parseCoordinateDetailed(value)?.value ?? null;
}

/**
 * True when a cell seems to hold a whole position rather than one axis:
 * "41.65, -83.55", a WKT point, or a Kobo geopoint ("lat lon altitude accuracy").
 */
export function looksLikeCoordinatePair(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const numbers = value.replace(/−/g, '-').match(/[-+]?\d{1,3}[.,]\d+/g);
  return numbers !== null && numbers.length >= 2;
}

export function hasMissingCoordinate(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

export function isCoordinateInRange(value: number, axis: CoordinateAxis): boolean {
  return axis === 'lat'
    ? value >= -90 && value <= 90
    : value >= -180 && value <= 180;
}

export function isZeroCoordinatePlaceholder(lat: number, lng: number): boolean {
  return lat === 0 && lng === 0;
}

export function coordinatePrecision(value: unknown): number {
  const raw = String(value ?? '').trim();
  const match = raw.match(/[.,](\d+)/);
  return match ? match[1].length : 0;
}

function nameWords(column: DataColumn): string[] {
  return `${column.key} ${column.label}`
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const AXIS_WORDS: Record<CoordinateAxis, string[]> = {
  lat: ['lat', 'latitude'],
  lng: ['lon', 'lng', 'long', 'longitude'],
};

/** True when the column is named for this axis: "latitude", "gps_lat", "location-Longitude". */
export function columnNameMatchesAxis(column: DataColumn, axis: CoordinateAxis): boolean {
  const words = nameWords(column);
  return AXIS_WORDS[axis].some(word => words.includes(word));
}

interface CoordinateColumnStats {
  present: number;
  inRange: number;
  /** Values with at least two decimal places, or written as degrees and minutes. */
  fractional: number;
}

function coordinateColumnStats(
  column: DataColumn,
  records: CaseRecord[],
  axis: CoordinateAxis
): CoordinateColumnStats {
  const stats: CoordinateColumnStats = { present: 0, inRange: 0, fractional: 0 };
  for (const record of records) {
    const raw = record[column.key];
    if (hasMissingCoordinate(raw)) continue;
    stats.present++;
    const parsed = parseCoordinateDetailed(raw);
    if (!parsed || !isCoordinateInRange(parsed.value, axis)) continue;
    stats.inRange++;
    if (parsed.format === 'dms' || coordinatePrecision(raw) >= 2) stats.fractional++;
  }
  return stats;
}

/**
 * Whether a column may be offered as a coordinate.
 *
 * Every numeric column used to qualify, so age and population were on the
 * list. A column now has to be named for the axis, or hold values that are in
 * range and mostly fractional. Whole numbers are ages and counts; a real
 * position in degrees almost always has decimals.
 */
export function isPlausibleCoordinateColumn(
  column: DataColumn,
  records: CaseRecord[],
  axis: CoordinateAxis
): boolean {
  if (column.type === 'date') return false;
  if (columnNameMatchesAxis(column, axis)) return true;
  const stats = coordinateColumnStats(column, records, axis);
  if (stats.present === 0) return false;
  return stats.inRange / stats.present >= 0.8 && stats.fractional / stats.inRange >= 0.5;
}

/**
 * The latitude and longitude columns to select without being asked.
 *
 * Only when it is convincing: the column is named for its axis and its values
 * are in range. The earlier fallback took the first numeric column for both,
 * which plotted a nutrition survey's "Age (months)" against itself as a line
 * of 300 points from Nigeria to Russia. Returning nothing leaves the map
 * asking the user to choose, which is the honest state for a dataset without
 * coordinates.
 */
export function suggestCoordinateColumns(
  columns: DataColumn[],
  records: CaseRecord[]
): { lat: string; lng: string } {
  const convincing = (axis: CoordinateAxis) => columns
    .map(column => {
      if (!columnNameMatchesAxis(column, axis)) return null;
      // A column named for both axes ("lat_long") is a combined field, not one axis.
      if (columnNameMatchesAxis(column, axis === 'lat' ? 'lng' : 'lat')) return null;
      const stats = coordinateColumnStats(column, records, axis);
      if (stats.present === 0 || stats.inRange / stats.present < 0.8) return null;
      // "long" is also an ordinary word ("how long ill"), so a column whose
      // values have decimals is preferred over one that merely has the name.
      return { column, score: stats.fractional / stats.inRange };
    })
    .filter((entry): entry is { column: DataColumn; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.column);

  const lat = convincing('lat')[0];
  const lng = convincing('lng').find(column => column.key !== lat?.key);
  // Both or neither: one axis on its own maps nothing.
  return lat && lng ? { lat: lat.key, lng: lng.key } : { lat: '', lng: '' };
}

export interface UsableCoordinate {
  record: CaseRecord;
  lat: number;
  lng: number;
}

export interface CoordinateQAResult {
  totalRecords: number;
  validCoordinates: number;
  missingLatitude: number;
  missingLongitude: number;
  /** Present but not readable as a coordinate. */
  unparseable: number;
  /** Of the unreadable, those that look like a whole position in one cell. */
  combinedValues: number;
  zeroPlaceholders: number;
  outOfRange: number;
  likelySwapped: number;
  duplicateCoordinates: number;
  lowPrecision: number;
  /** The latitude field is named like a longitude and the other way round. */
  columnsLookSwapped: boolean;
  excludedRecords: CaseRecord[];
  /** The records that can be mapped, with their positions. */
  usable: UsableCoordinate[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Check every record's coordinates and say which can be mapped.
 *
 * The map draws exactly the records in `usable`, so the counts shown beside
 * the map and the points on it cannot disagree.
 */
export function analyzeCoordinateQuality(
  records: CaseRecord[],
  latColumn: string,
  lngColumn: string,
  columns: DataColumn[] = []
): CoordinateQAResult {
  const result: CoordinateQAResult = {
    totalRecords: records.length,
    validCoordinates: 0,
    missingLatitude: 0,
    missingLongitude: 0,
    unparseable: 0,
    combinedValues: 0,
    zeroPlaceholders: 0,
    outOfRange: 0,
    likelySwapped: 0,
    duplicateCoordinates: 0,
    lowPrecision: 0,
    columnsLookSwapped: false,
    excludedRecords: [],
    usable: [],
  };

  if (!latColumn || !lngColumn) return result;

  const latDefinition = columns.find(column => column.key === latColumn);
  const lngDefinition = columns.find(column => column.key === lngColumn);
  if (latDefinition && lngDefinition) {
    result.columnsLookSwapped =
      columnNameMatchesAxis(latDefinition, 'lng') && !columnNameMatchesAxis(latDefinition, 'lat') &&
      columnNameMatchesAxis(lngDefinition, 'lat') && !columnNameMatchesAxis(lngDefinition, 'lng');
  }

  const exclude = (record: CaseRecord, reasons: string[]) => {
    result.excludedRecords.push({ ...record, _map_exclusion_reason: reasons.join('; ') });
  };

  let candidates: Array<UsableCoordinate & { rawLat: unknown; rawLng: unknown; decimal: boolean }> = [];

  records.forEach(record => {
    const rawLat = record[latColumn];
    const rawLng = record[lngColumn];
    const reasons: string[] = [];

    const latMissing = hasMissingCoordinate(rawLat);
    const lngMissing = hasMissingCoordinate(rawLng);
    if (latMissing) {
      result.missingLatitude++;
      reasons.push('Missing latitude');
    }
    if (lngMissing) {
      result.missingLongitude++;
      reasons.push('Missing longitude');
    }

    const lat = latMissing ? null : parseCoordinateDetailed(rawLat);
    const lng = lngMissing ? null : parseCoordinateDetailed(rawLng);

    if ((!latMissing && !lat) || (!lngMissing && !lng)) {
      result.unparseable++;
      const combined =
        (!latMissing && !lat && looksLikeCoordinatePair(rawLat)) ||
        (!lngMissing && !lng && looksLikeCoordinatePair(rawLng));
      if (combined) {
        result.combinedValues++;
        reasons.push('Latitude and longitude are together in one cell; split them into two columns');
      } else {
        reasons.push('Coordinates could not be read');
      }
    }

    if (!lat || !lng) {
      exclude(record, reasons);
      return;
    }

    // A compass letter on the wrong axis is the clearest sign of a swap.
    const hemisphereMismatch =
      lat.hemisphere === 'E' || lat.hemisphere === 'W' || lng.hemisphere === 'N' || lng.hemisphere === 'S';
    const swappedLooksValid = isCoordinateInRange(lng.value, 'lat') && isCoordinateInRange(lat.value, 'lng');
    const inRange = isCoordinateInRange(lat.value, 'lat') && isCoordinateInRange(lng.value, 'lng');

    if (isZeroCoordinatePlaceholder(lat.value, lng.value)) {
      result.zeroPlaceholders++;
      reasons.push('Zero coordinate placeholder');
    }

    if (!inRange) {
      result.outOfRange++;
      reasons.push('Coordinates outside valid latitude/longitude range');
    }

    if (hemisphereMismatch || (!inRange && swappedLooksValid)) {
      result.likelySwapped++;
      reasons.push('Latitude/longitude may be swapped');
    }

    if (reasons.length > 0) {
      exclude(record, reasons);
      return;
    }

    candidates.push({
      record,
      lat: lat.value,
      lng: lng.value,
      rawLat,
      rawLng,
      decimal: lat.format === 'decimal' && lng.format === 'decimal',
    });
  });

  // A range check only catches a swap where the longitude is beyond 90, which
  // leaves out Africa, Europe, most of South Asia and South America. The
  // records themselves say more: one that sits far from the rest but lands
  // among them once its two values are exchanged was almost certainly entered
  // the wrong way round.
  if (candidates.length >= 5) {
    const centreLat = median(candidates.map(row => row.lat));
    const centreLng = median(candidates.map(row => row.lng));
    const spreadLat = median(candidates.map(row => Math.abs(row.lat - centreLat)));
    const spreadLng = median(candidates.map(row => Math.abs(row.lng - centreLng)));
    const reachLat = Math.max(10 * spreadLat, 1);
    const reachLng = Math.max(10 * spreadLng, 1);

    candidates = candidates.filter(row => {
      const apart = Math.abs(row.lat - centreLat) > reachLat || Math.abs(row.lng - centreLng) > reachLng;
      const fitsWhenSwapped =
        Math.abs(row.lng - centreLat) <= reachLat && Math.abs(row.lat - centreLng) <= reachLng;
      if (!(apart && fitsWhenSwapped)) return true;
      result.likelySwapped++;
      exclude(row.record, [
        'Far from the other records, but among them with latitude and longitude exchanged; may be swapped',
      ]);
      return false;
    });
  }

  const coordinateCounts = new Map<string, number>();
  candidates.forEach(row => {
    const key = `${row.lat.toFixed(6)},${row.lng.toFixed(6)}`;
    coordinateCounts.set(key, (coordinateCounts.get(key) ?? 0) + 1);
  });

  result.usable = candidates.map(({ record, lat, lng }) => ({ record, lat, lng }));
  result.validCoordinates = candidates.length;
  result.duplicateCoordinates = Array.from(coordinateCounts.values())
    .filter(count => count > 1)
    .reduce((sum, count) => sum + count, 0);
  result.lowPrecision = candidates.filter(({ rawLat, rawLng, decimal }) =>
    decimal &&
    coordinatePrecision(rawLat) > 0 &&
    coordinatePrecision(rawLng) > 0 &&
    (coordinatePrecision(rawLat) <= 2 || coordinatePrecision(rawLng) <= 2)
  ).length;

  return result;
}
