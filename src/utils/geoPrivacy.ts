/**
 * Location obfuscation for maps.
 *
 * Case coordinates are household-level data. The spot map displaces each point
 * before drawing it, and the exports carry the displaced position rather than
 * the real one. This lives outside the component so the guarantee can be
 * tested: it regressed once already, silently, with the exports shipping exact
 * coordinates in a file labelled as jittered.
 */
import type { CaseRecord, DataColumn } from '../types/analysis';

/** The distances the spot map offers. Anything else is not a valid setting. */
export const JITTER_DISTANCES = [200, 500, 1000, 2000] as const;
export const DEFAULT_JITTER_DISTANCE = 500;

/**
 * Smallest displacement, as a share of the chosen distance.
 *
 * A uniform disc lets a point land almost on top of its true position: at the
 * 200 m setting about one household in sixteen was drawn within 50 m of where
 * it really is. Displacing into a ring instead guarantees every point moves at
 * least this far.
 */
export const JITTER_MIN_FRACTION = 0.25;

/**
 * Decimal places kept in a displaced coordinate (about one metre).
 *
 * Publishing all sixteen digits of `true + offset` lets the sum be tested
 * exactly: source coordinates have five or six decimals, so only the real
 * point lines up with a possible offset. Rounding removes that test, and costs
 * nothing against a displacement of hundreds of metres.
 */
export const JITTER_OUTPUT_DECIMALS = 5;

/**
 * A jitter distance read from saved settings or a recipe file.
 *
 * Those are untrusted: a recipe carrying 0 would have drawn exact locations
 * under a banner saying they were jittered.
 */
export function normalizeJitterDistance(value: unknown): number {
  return typeof value === 'number' && (JITTER_DISTANCES as readonly number[]).includes(value)
    ? value
    : DEFAULT_JITTER_DISTANCE;
}

/** Smallest distance a point is moved at a given setting, in metres. */
export function jitterMinimumDistance(distanceMeters: number): number {
  return distanceMeters * JITTER_MIN_FRACTION;
}

// SHA-256 round constants.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * SHA-256, synchronously.
 *
 * The offset has to be computed inside a render, so the browser's asynchronous
 * crypto.subtle cannot be used. The previous 32-bit string hash was not a
 * substitute: with a secret in the seed it would have reduced that secret to
 * 32 bits, which one known address is enough to search.
 */
export function sha256(message: string): Uint8Array {
  const bytes = new TextEncoder().encode(message);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

/** Six bytes as a fraction in [0, 1), 48 bits of resolution. */
function fractionFromBytes(bytes: Uint8Array, start: number): number {
  let value = 0;
  for (let i = 0; i < 6; i++) value = value * 256 + bytes[start + i];
  return value / 2 ** 48;
}

/**
 * The displacement for one seed, in metres north and east.
 *
 * Deterministic on purpose. Re-randomising per render or per export would let
 * someone average repeated outputs to recover the true position, which is
 * exactly the attack the jitter exists to prevent. The same seed always gives
 * the same offset.
 *
 * Angle and radius are read from separate parts of the digest at 48 bits each.
 * The earlier generator had 3,600 directions and 10,000 distances; a set that
 * small is a lattice, and a true coordinate could be picked out as the only
 * candidate lying on it.
 */
export function jitterOffset(
  seed: string,
  distanceMeters: number
): { north: number; east: number } {
  if (!(distanceMeters > 0)) return { north: 0, east: 0 };

  const digest = sha256(seed);
  const angle = fractionFromBytes(digest, 0) * 2 * Math.PI;
  const u = fractionFromBytes(digest, 6);

  // Uniform over the ring between the minimum and the stated distance. The
  // square root keeps the density even by area, so points do not bunch toward
  // the inner edge.
  const inner = jitterMinimumDistance(distanceMeters);
  const radius = Math.sqrt(inner * inner + u * (distanceMeters * distanceMeters - inner * inner));

  return { north: radius * Math.cos(angle), east: radius * Math.sin(angle) };
}

const roundCoordinate = (value: number): number => {
  const factor = 10 ** JITTER_OUTPUT_DECIMALS;
  return Math.round(value * factor) / factor;
};

/**
 * Displace a coordinate by a deterministic offset of at most `distanceMeters`
 * and at least `JITTER_MIN_FRACTION` of it.
 *
 * @param seed stable for the location, and built from a secret that is never
 *   exported (see `jitterSeed`), so the offset is reproducible here and
 *   nowhere else
 */
export function jitterCoordinates(
  lat: number,
  lng: number,
  distanceMeters: number,
  seed: string
): { lat: number; lng: number } {
  if (!(distanceMeters > 0)) return { lat, lng };

  const { north, east } = jitterOffset(seed, distanceMeters);

  // Metres to degrees. Longitude degrees shorten with latitude, so the
  // east-west component is scaled by cos(lat) to keep the displacement
  // isotropic on the ground rather than in degree space. The floor on the
  // cosine only matters within a few kilometres of a pole, where the division
  // would otherwise send the point around the world.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const dLat = north / 111320;
  const dLng = east / (111320 * cosLat);

  const movedLat = Math.min(90, Math.max(-90, lat + dLat));
  let movedLng = lng + dLng;
  if (movedLng > 180) movedLng -= 360;
  if (movedLng < -180) movedLng += 360;

  return { lat: roundCoordinate(movedLat), lng: roundCoordinate(movedLng) };
}

/** Metres between two coordinates, for verifying displacement. */
export function metresBetween(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = (lat2 - lat1) * 111320;
  const dLng = (lng2 - lng1) * 111320 * Math.cos(toRad((lat1 + lat2) / 2));
  return Math.hypot(dLat, dLng);
}

/**
 * A new secret for seeding jitter: 128 random bits as hex.
 *
 * The seed used to be the record id plus the true coordinate and the distance.
 * The id and the distance were both written into the GeoJSON export, which
 * left the true coordinate as the only unknown, and it has few enough digits
 * to enumerate: every candidate within the radius could be run through the
 * published algorithm until one reproduced the published point. Seeding from a
 * value that never leaves the browser's own storage closes that.
 */
export function createJitterSecret(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function isJitterSecret(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

/**
 * The seed for one location.
 *
 * Built from the secret and the true position, not the record. Records that
 * share a coordinate therefore move together. Had each record been given its
 * own offset, several cases in one household would have surrounded it, and the
 * middle of that cloud is the house.
 *
 * The distance is part of the seed so that each setting draws afresh. If one
 * direction were reused and only scaled, two exports at different settings
 * would lie on a line through the true point and give it away exactly.
 */
export function jitterSeed(secret: string, lat: number, lng: number, distanceMeters: number): string {
  return `${secret}|${lat}|${lng}|${distanceMeters}`;
}

// ---------------------------------------------------------------------------
// Columns that give a location or a person away regardless of the jitter
// ---------------------------------------------------------------------------

export type WithheldReason = 'coordinates' | 'identifier';

export interface WithheldColumn {
  key: string;
  label: string;
  reason: WithheldReason;
}

/** Column name as lower-case words: "gpsLatitude" and "_gps-latitude" both give "gps latitude". */
function nameWords(column: DataColumn): string[] {
  return `${column.key} ${column.label}`
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Words that mean a column holds a position. "location" is here although it
// sometimes holds a place name: when unsure, the column is withheld.
const COORDINATE_WORDS = new Set([
  'lat', 'latitude', 'lon', 'lng', 'longitude', 'gps', 'geo', 'geopoint', 'geotrace', 'geoshape',
  'geolocation', 'geocode', 'geocoded', 'coord', 'coords', 'coordinate', 'coordinates', 'location',
  'easting', 'northing', 'utm', 'mgrs', 'geohash', 'pluscode', 'what3words', 'w3w', 'xcoord', 'ycoord',
]);

const IDENTIFIER_WORDS = new Set([
  // Contact details
  'phone', 'telephone', 'tel', 'mobile', 'cell', 'cellphone', 'whatsapp', 'contact', 'email', 'mail',
  // Where someone lives, finer than a named area
  'address', 'addr', 'street', 'house', 'plot', 'residence', 'landmark', 'compound', 'apartment', 'apt',
  'postcode', 'postal', 'zip', 'zipcode',
  // Numbers issued to a person
  'passport', 'ssn', 'nin', 'nid', 'mrn', 'nhs',
  // Date of birth
  'dob', 'birthdate', 'birth', 'birthday',
  // Personal names, including the common French and Spanish headings
  'firstname', 'lastname', 'surname', 'fullname', 'forename', 'prenom', 'nombre', 'apellido', 'apellidos',
]);

// "name" on its own is a person's name unless one of these says what is being
// named. An unlisted kind of name is withheld.
const NAMED_THING_WORDS = new Set([
  'month', 'day', 'week', 'district', 'facility', 'village', 'disease', 'region', 'county', 'province',
  'state', 'ward', 'zone', 'site', 'hospital', 'clinic', 'school', 'organism', 'pathogen', 'lab',
  'laboratory', 'country', 'area', 'variable', 'sample', 'vaccine', 'drug', 'product', 'food', 'event',
  'outbreak', 'dataset', 'file', 'city', 'town', 'neighborhood', 'neighbourhood', 'parish', 'commune',
  'department', 'municipality', 'subcounty', 'lga', 'health', 'admin', 'adm', 'cluster', 'category',
]);

/** Two or more decimal numbers in one cell, or a degree sign: a position written as text. */
function looksLikePositionText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  if (/\d\s*[°º]/.test(text)) return true;
  const decimals = text.match(/[-+−]?\d{1,3}[.,]\d{3,}/g);
  return decimals !== null && decimals.length >= 2;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/−/g, '-').replace(',', '.');
  if (!/^[-+]?\d+(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Columns that must not accompany a jittered point.
 *
 * Jittering replaced the two selected coordinate columns and left everything
 * else alone. A Kobo export carries the same position three times (`gps`,
 * `_gps_latitude`, `_gps_longitude`), so the file labelled as jittered still
 * held the exact point one column over, next to the patient's name.
 *
 * Deliberately broad. A column is withheld when its name or its values suggest
 * a position or a direct identifier, and a false positive only costs a column
 * that can still be exported from the line list itself.
 *
 * @param truePoints the real position of each mapped record, to recognise a
 *   copy of the coordinates under an unhelpful name
 */
export function findWithheldColumns(
  columns: DataColumn[],
  records: CaseRecord[],
  latColumn: string,
  lngColumn: string,
  truePoints: Array<{ record: CaseRecord; lat: number; lng: number }> = []
): WithheldColumn[] {
  const withheld: WithheldColumn[] = [];
  const sample = records.slice(0, 2000);
  const pointSample = truePoints.slice(0, 2000);

  for (const column of columns) {
    if (column.key === latColumn || column.key === lngColumn) continue;

    const words = nameWords(column);
    let reason: WithheldReason | null = null;

    if (words.some(word => COORDINATE_WORDS.has(word))) {
      reason = 'coordinates';
    } else if (words.some(word => IDENTIFIER_WORDS.has(word))) {
      reason = 'identifier';
    } else if (
      (words.includes('name') || words.includes('names') || words.includes('nom')) &&
      !words.some(word => NAMED_THING_WORDS.has(word))
    ) {
      reason = 'identifier';
    } else if (words.includes('national') && words.includes('id')) {
      reason = 'identifier';
    }

    if (!reason) {
      const present = sample.map(record => record[column.key]).filter(value =>
        value !== null && value !== undefined && String(value).trim() !== ''
      );
      if (present.length > 0 && present.filter(looksLikePositionText).length / present.length >= 0.5) {
        reason = 'coordinates';
      }
    }

    if (!reason && pointSample.length > 0) {
      // A numeric column that tracks the true latitude or longitude record by
      // record is a second copy of it, whatever it is called.
      let compared = 0;
      let close = 0;
      for (const point of pointSample) {
        const value = toNumber(point.record[column.key]);
        if (value === null) continue;
        compared++;
        if (Math.abs(value - point.lat) < 0.02 || Math.abs(value - point.lng) < 0.02) close++;
      }
      if (compared > 0 && close / compared >= 0.5) reason = 'coordinates';
    }

    if (reason) withheld.push({ key: column.key, label: column.label, reason });
  }

  return withheld;
}

// ---------------------------------------------------------------------------
// What the spot map exports
// ---------------------------------------------------------------------------

export interface SpotMapExportCase {
  record: CaseRecord;
  /** True position. */
  lat: number;
  lng: number;
  /** Position as drawn: jittered when locations are obfuscated. */
  displayLat: number;
  displayLng: number;
}

export interface SpotMapExportOptions {
  cases: SpotMapExportCase[];
  columns: DataColumn[];
  latColumn: string;
  lngColumn: string;
  obfuscate: boolean;
  jitterDistance: number;
  /** Keys from `findWithheldColumns`. Ignored when locations are not obfuscated. */
  withheldKeys: string[];
}

export interface SpotMapExport {
  /** Columns for the CSV: the dataset's own, less anything withheld. */
  columns: DataColumn[];
  records: CaseRecord[];
  geojson: {
    type: 'FeatureCollection';
    linelist_location_privacy: string;
    linelist_withheld_columns: string[];
    features: Array<{
      type: 'Feature';
      geometry: { type: 'Point'; coordinates: [number, number] };
      properties: Record<string, unknown>;
    }>;
  };
}

/**
 * The rows and features behind a spot map export.
 *
 * Built column by column from the dataset's declared columns rather than by
 * spreading the record. Spreading carried along the internal record id, which
 * is not a column and was never meant to be published.
 */
export function buildSpotMapExport(options: SpotMapExportOptions): SpotMapExport {
  const { cases, columns, latColumn, lngColumn, obfuscate, jitterDistance } = options;
  const withheld = new Set(obfuscate ? options.withheldKeys : []);
  const exportColumns = columns.filter(column => !withheld.has(column.key));
  const privacyLabel = obfuscate ? `jittered_${jitterDistance}m` : 'exact';

  const rows = cases.map(caseData => {
    const values: Record<string, unknown> = {};
    for (const column of exportColumns) {
      if (obfuscate && column.key === latColumn) values[column.key] = caseData.displayLat;
      else if (obfuscate && column.key === lngColumn) values[column.key] = caseData.displayLng;
      else values[column.key] = caseData.record[column.key];
    }
    return values;
  });

  return {
    columns: exportColumns,
    // The row number stands in for the id the CSV writer's type expects. It is
    // not written to the file, and a dataset column that is itself keyed "id"
    // takes precedence over it.
    records: rows.map((values, index) => ({ id: String(index + 1), ...values })),
    geojson: {
      type: 'FeatureCollection',
      linelist_location_privacy: privacyLabel,
      linelist_withheld_columns: columns.filter(column => withheld.has(column.key)).map(column => column.key),
      features: cases.map((caseData, index) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [caseData.displayLng, caseData.displayLat],
        },
        properties: {
          ...rows[index],
          ...(obfuscate ? {} : { _original_latitude: caseData.lat, _original_longitude: caseData.lng }),
          _display_latitude: caseData.displayLat,
          _display_longitude: caseData.displayLng,
          _location_privacy: privacyLabel,
        },
      })),
    },
  };
}
