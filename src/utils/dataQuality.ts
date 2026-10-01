/**
 * Data Quality Checks for Epidemiological Data
 *
 * This module provides configurable data quality validation for outbreak
 * investigation data. Quality checks are essential for ensuring data
 * integrity before analysis.
 *
 * AVAILABLE CHECKS:
 *
 * 1. DUPLICATE DETECTION
 *    - Exact matching on selected fields
 *    - Fuzzy matching for typos (configurable threshold, e.g., 85%)
 *    - Date tolerance for near-duplicate dates
 *
 * 2. DATE ORDER VALIDATION
 *    - Ensures temporal sequences are logical
 *    - e.g., onset_date must be before hospitalization_date
 *    - Configurable field pairs with labels
 *
 * 3. NUMERIC RANGE CHECKS
 *    - Validates values fall within expected bounds
 *    - e.g., age must be 0-120
 *    - Configurable min/max per field
 *
 * 4. MISSING VALUE CHECKS
 *    - Identifies records with blank required fields
 *    - Groups by field for easier remediation
 *
 * USAGE:
 * 1. Configure checks via DataQualityConfig
 * 2. Call runDataQualityChecks() with records and config
 * 3. Display issues in UI (grouped by category)
 * 4. Users can dismiss reviewed issues
 *
 * Used by: Review.tsx, DataQualityPanel.tsx
 */
import type {
  CaseRecord,
  DataColumn,
  DataQualityIssue,
  DataQualityConfig,
  DateOrderRule,
  NumericRangeRule,
  FuzzyMatchingConfig,
} from '../types/analysis';
import type { DateFormat } from '../contexts/LocaleContext';
import { jaroWinklerSimilarity } from './stringSimilarity';
import { parseStoredDate, dayNumber, comparableTime, todayDayNumber, formatDateParts } from './dateValue';
import type { DateParts } from './dateValue';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Generate unique ID for issues
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Read a stored date. Deliberately not the Date constructor: that reads
// "03/04/2025" month-first whatever was meant, and reads "2025-03-04" as UTC
// midnight, which printed as the day before anywhere west of Greenwich.
function parseDate(value: unknown): DateParts | null {
  return isEmpty(value) ? null : parseStoredDate(value);
}

/** Options that affect how issues are worded, not what is found. */
export interface DataQualityOptions {
  /** How dates are written in issue details. Defaults to ISO. */
  dateFormat?: DateFormat;
}

// Check if a value is empty
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Returns the default configuration with all check types enabled but empty rules */
/**
 * Suggest date-order and numeric-range rules from column names.
 *
 * Those two checks need per-dataset rules and ship with none, so a fresh
 * import is unchecked on both until someone configures them by hand. These are
 * suggestions to review and edit, not assumptions: only orderings that hold in
 * essentially any line list are proposed.
 *
 * Deliberately conservative. Onset before hospitalisation is omitted, for
 * instance, because a hospital-acquired infection legitimately reverses it,
 * and a check that cries wolf trains people to ignore the panel.
 */
export function suggestQualityRules(columns: DataColumn[]): {
  dateOrderRules: DateOrderRule[];
  numericRangeRules: NumericRangeRule[];
} {
  const dateColumns = columns.filter(c => c.type === 'date');
  const find = (pattern: RegExp) =>
    dateColumns.find(c => pattern.test(c.key) || pattern.test(c.label.toLowerCase()));

  // Events that can only follow the illness they describe.
  const exposure = find(/exposure/);
  const onset = find(/onset|symptom/);
  const afterOnset = [
    find(/interview/),
    find(/report|notif/),
    find(/outcome|death|discharge|recover/),
  ];

  const dateOrderRules: DateOrderRule[] = [];
  const addRule = (first?: DataColumn, second?: DataColumn) => {
    if (!first || !second || first.key === second.key) return;
    if (dateOrderRules.some(r => r.firstDateField === first.key && r.secondDateField === second.key)) return;
    dateOrderRules.push({
      id: `suggested_${first.key}_${second.key}`,
      firstDateField: first.key,
      secondDateField: second.key,
      firstDateLabel: first.label,
      secondDateLabel: second.label,
    });
  };

  addRule(exposure, onset);
  for (const later of afterOnset) addRule(onset ?? exposure, later);

  // Only ranges that hold regardless of setting or population.
  const numericRangeRules: NumericRangeRule[] = [];
  for (const column of columns.filter(c => c.type === 'number')) {
    const name = `${column.key} ${column.label}`.toLowerCase();
    if (/\bage\b/.test(name) && !/month|week|day/.test(name)) {
      numericRangeRules.push({
        id: `suggested_${column.key}`,
        field: column.key,
        fieldLabel: column.label,
        min: 0,
        max: 120,
      });
    } else if (/age/.test(name) && /month/.test(name)) {
      numericRangeRules.push({
        id: `suggested_${column.key}`,
        field: column.key,
        fieldLabel: column.label,
        min: 0,
        max: 1440, // 120 years expressed in months
      });
    }
  }

  return { dateOrderRules, numericRangeRules };
}

export function getDefaultConfig(): DataQualityConfig {
  return {
    duplicateFields: [],
    fuzzyMatching: {
      enabled: true,
      textThreshold: 0.85, // 85% similarity for text fields
      dateTolerance: 0, // Exact date match by default
    },
    dateOrderRules: [],
    // On by default. Unlike date-order and range rules, this needs no
    // knowledge of the dataset: an onset in the future is an error in any
    // line list, and a mistyped year is the commonest date error in field
    // data. It was declared here but never implemented or read.
    checkFutureDates: true,
    numericRangeRules: [],
    missingValueFields: [],
    enabledChecks: ['duplicate', 'date_order', 'numeric_range', 'missing_values'],
  };
}

// =============================================================================
// DUPLICATE DETECTION
// Identifies exact and near-duplicate records using fuzzy string matching
// =============================================================================

/** Columns whose values identify a record rather than describe it. */
const ID_NAME = /(^|[^a-z])(id|ids|no|num|number|code|uuid|serial|record)([^a-z]|$)/i;

interface FieldProfile {
  key: string;
  label: string;
  type: DataColumn['type'];
  /** Values normalised for comparison; '' is missing. */
  values: string[];
  /** A case or record identifier: unique per record, so never compared. */
  isIdentifier: boolean;
  /** Varies enough that two records sharing it means something. */
  distinguishing: boolean;
}

function profileField(records: CaseRecord[], column: { key: string; label: string; type: DataColumn['type'] }): FieldProfile {
  const values = records.map(record => {
    const value = record[column.key];
    return isEmpty(value) ? '' : String(value).trim().toLowerCase();
  });
  const present = values.filter(v => v !== '');
  const distinct = new Set(present).size;
  const ratio = present.length > 0 ? distinct / present.length : 0;

  // An identifier is nearly unique and looks like a code: it carries digits
  // and no spaces. A name column is nearly unique too, but it is exactly what
  // duplicates should be matched on. A column named as an identifier needs
  // less proof, since a file with duplicated IDs is the case being looked for.
  const codeLike = present.length > 0 &&
    present.filter(v => /\d/.test(v) && !/\s/.test(v)).length >= present.length * 0.8;
  const namedAsId = ID_NAME.test(column.key.replace(/_/g, ' ')) || ID_NAME.test(column.label);
  const isIdentifier =
    present.length >= 2 &&
    (column.type === 'number'
      ? namedAsId && ratio >= 0.9 && present.every(v => /^\d+$/.test(v))
      : column.type !== 'date' && ((codeLike && ratio >= 0.9) || (namedAsId && ratio >= 0.5)));

  return {
    key: column.key, label: column.label, type: column.type, values,
    isIdentifier,
    distinguishing: present.length >= 2 && ratio >= 0.5,
  };
}

/**
 * Check for duplicate records.
 *
 * Three findings, in decreasing certainty:
 *
 *  1. Identical records: every compared field the same.
 *  2. A repeated identifier: two records carrying the same case ID.
 *  3. Similar records: the same in every field both have filled in, apart
 *     from the identifier, allowing a near-miss spelling in free text.
 *
 * What this replaced averaged a similarity score over the first ten columns
 * and counted two blanks as a match. On a line list that meant two people who
 * were not cases, with no dates and the same sex, scored 87% alike on their
 * blanks and were reported as duplicates; the bundled surveillance sample
 * drew 55 such warnings without containing one duplicate. A blank says
 * nothing about whether two records are the same person, so blanks are not
 * compared, and one differing age or date now rules a pair out.
 */
function checkDuplicates(
  records: CaseRecord[],
  fields: string[],
  columns: DataColumn[],
  fuzzyConfig: FuzzyMatchingConfig
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  // Use selected fields if provided, otherwise check all fields
  const explicit = fields.length > 0;
  const compared = (explicit ? fields : columns.map(c => c.key)).map(key => {
    const column = columns.find(c => c.key === key);
    return { key, label: column?.label ?? key, type: (column?.type ?? 'text') as DataColumn['type'] };
  });
  if (compared.length === 0 || records.length < 2) return issues;

  const profiles = compared.map(column => profileField(records, column));
  // Fields the user chose are all compared; identifiers are only set aside
  // when the check is left to work across every column.
  const identifiers = explicit ? [] : profiles.filter(p => p.isIdentifier);
  const content = explicit ? profiles : profiles.filter(p => !p.isIdentifier);

  const grouped = new Set<number>();
  const pushGroup = (
    indexes: number[], severity: DataQualityIssue['severity'], message: string, details?: string, field?: string
  ) => {
    indexes.forEach(i => grouped.add(i));
    issues.push({
      id: generateId(), checkType: 'duplicate', category: 'duplicate', severity,
      recordIds: indexes.map(i => records[i].id), message, details, field,
    });
  };

  // 1. Identical in every compared field, identifier included.
  const SEP = '\u0001';
  const identical = new Map<string, number[]>();
  for (let i = 0; i < records.length; i++) {
    const parts = profiles.map(p => p.values[i]);
    if (parts.every(v => v === '')) continue;
    const fingerprint = parts.join(SEP);
    const group = identical.get(fingerprint);
    if (group) group.push(i); else identical.set(fingerprint, [i]);
  }
  for (const group of identical.values()) {
    if (group.length > 1) {
      pushGroup(group, 'error', `${group.length} identical records found`,
        explicit ? 'Same value in every selected field' : 'Same value in every field');
    }
  }

  // 2. The same identifier on records that are otherwise different.
  for (const id of identifiers) {
    const byValue = new Map<string, number[]>();
    for (let i = 0; i < records.length; i++) {
      const value = id.values[i];
      if (value === '' || grouped.has(i)) continue;
      const group = byValue.get(value);
      if (group) group.push(i); else byValue.set(value, [i]);
    }
    for (const group of byValue.values()) {
      if (group.length > 1) {
        pushGroup(group, 'warning',
          `${group.length} records share ${id.label} "${String(records[group[0]][id.key]).trim()}"`,
          'The records differ in other fields', id.key);
      }
    }
  }

  if (content.length === 0) return issues;

  // Two records sharing a sex and a district are not thereby the same
  // person. Unless the user chose the fields, a match has to include at least
  // one field that tells records apart: a name, a date of birth, a phone
  // number, a coordinate.
  const needsDistinguishing = !explicit;
  if (needsDistinguishing && !content.some(p => p.distinguishing)) return issues;

  // Enough fields in common to mean something: half of them, and at least
  // three where there are three to compare.
  const required = Math.min(content.length, Math.max(3, Math.ceil(content.length / 2)));

  // 3a. Too many records to compare pair by pair: report only records that
  // are the same in every field except the identifier.
  const MAX_PAIRWISE_RECORDS = 2000;
  if (records.length > MAX_PAIRWISE_RECORDS) {
    const same = new Map<string, number[]>();
    for (let i = 0; i < records.length; i++) {
      if (grouped.has(i)) continue;
      let filled = 0, distinguishing = false;
      for (const p of content) {
        if (p.values[i] !== '') { filled++; if (p.distinguishing) distinguishing = true; }
      }
      if (filled < required || (needsDistinguishing && !distinguishing)) continue;
      const fingerprint = content.map(p => p.values[i]).join(SEP);
      const group = same.get(fingerprint);
      if (group) group.push(i); else same.set(fingerprint, [i]);
    }
    for (const group of same.values()) {
      if (group.length > 1) {
        pushGroup(group, 'warning', `${group.length} records identical apart from their identifier`,
          'Near-match spelling was not checked: the dataset is too large to compare every pair of records');
      }
    }
    return issues;
  }

  // 3b. Pair by pair. Fields that must match exactly go first, most varied
  // first, so that nearly every pair is ruled out on its first comparison.
  const fuzzy = fuzzyConfig.enabled && fuzzyConfig.textThreshold < 1.0;
  const isFuzzyField = (p: FieldProfile) => fuzzy && p.type === 'text' && p.distinguishing;
  const ordered = [...content].sort((a, b) =>
    Number(isFuzzyField(a)) - Number(isFuzzyField(b)) || Number(b.distinguishing) - Number(a.distinguishing));
  const dateDays = ordered.map(p => (p.type === 'date' && fuzzy && fuzzyConfig.dateTolerance > 0
    ? records.map(r => { const d = parseDate(r[p.key]); return d ? dayNumber(d) : null; })
    : null));

  /** Labels of the fields that matched only approximately, or null if the pair does not match. */
  const comparePair = (i: number, j: number): string[] | null => {
    let overlap = 0, distinguishing = false;
    const approximate: string[] = [];
    for (let f = 0; f < ordered.length; f++) {
      const p = ordered[f];
      const a = p.values[i], b = p.values[j];
      if (a === '' && b === '') continue;
      // Filled in on one record only. With fuzzy matching off the records
      // have to be the same, so this rules the pair out.
      if (a === '' || b === '') { if (!fuzzy) return null; continue; }
      if (a !== b) {
        const days = dateDays[f];
        if (days) {
          const da = days[i], db = days[j];
          if (da === null || db === null || Math.abs(da - db) > fuzzyConfig.dateTolerance) return null;
          approximate.push(p.label);
        } else if (isFuzzyField(p)) {
          // A near-miss spelling is a slipped or swapped letter. Different
          // digits are a different house number or bed, not a typo.
          if (a.replace(/\D/g, '') !== b.replace(/\D/g, '')) return null;
          if (jaroWinklerSimilarity(a, b) < fuzzyConfig.textThreshold) return null;
          approximate.push(p.label);
        } else {
          return null;
        }
      }
      overlap++;
      if (p.distinguishing) distinguishing = true;
    }
    if (overlap < required || (needsDistinguishing && !distinguishing)) return null;
    return approximate;
  };

  for (let i = 0; i < records.length; i++) {
    if (grouped.has(i)) continue;
    const group = [i];
    const approximate = new Set<string>();
    for (let j = i + 1; j < records.length; j++) {
      if (grouped.has(j)) continue;
      const result = comparePair(i, j);
      if (!result) continue;
      group.push(j);
      result.forEach(label => approximate.add(label));
    }
    if (group.length > 1) {
      const near = [...approximate];
      pushGroup(group, 'warning',
        near.length > 0
          ? `${group.length} similar records found (${Math.round(fuzzyConfig.textThreshold * 100)}% match)`
          : `${group.length} records identical apart from ${identifiers.length > 0 ? 'their identifier' : 'blank fields'}`,
        near.length > 0
          ? `Same in every other field; close but not equal in ${near.join(', ')}`
          : 'Same value in every field both records have filled in');
    }
  }

  return issues;
}

// =============================================================================
// DATE ORDER VALIDATION
// Ensures dates occur in expected temporal sequence
// =============================================================================

/**
 * Check that date fields follow logical temporal order.
 * e.g., symptom onset should occur before hospitalization
 */
function checkDateOrder(
  records: CaseRecord[],
  rules: DateOrderRule[],
  dateFormat: DateFormat
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const rule of rules) {
    for (const record of records) {
      const firstDate = parseDate(record[rule.firstDateField]);
      const secondDate = parseDate(record[rule.secondDateField]);

      // Only check if both dates are present
      if (!firstDate || !secondDate) continue;

      // A date without a time is the whole day. Against a time on that same
      // day it is neither before nor after, so the two are compared by day
      // unless both carry a time.
      const outOfOrder = firstDate.hasTime && secondDate.hasTime
        ? comparableTime(firstDate) > comparableTime(secondDate)
        : dayNumber(firstDate) > dayNumber(secondDate);

      if (outOfOrder) {
        issues.push({
          id: generateId(),
          checkType: 'date_order',
          category: 'temporal',
          severity: 'error',
          recordIds: [record.id],
          field: rule.secondDateField,
          message: `${rule.secondDateLabel} before ${rule.firstDateLabel}`,
          details: `${rule.firstDateLabel}: ${formatDateParts(firstDate, dateFormat)}, ${rule.secondDateLabel}: ${formatDateParts(secondDate, dateFormat)}`,
        });
      }
    }
  }

  return issues;
}

/**
 * Flag dates after today. A mistyped year such as 2062 for 2026, or a date
 * parsed under the wrong format, lands in the future and is always wrong in a
 * record of something that has already happened.
 */
function checkFutureDatesInRecords(
  records: CaseRecord[],
  columns: DataColumn[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  // Compared by calendar day, so a time later today is not the future, and
  // tomorrow is, in every time zone.
  const today = todayDayNumber();

  for (const column of columns.filter(c => c.type === 'date')) {
    const recordIds: string[] = [];
    for (const record of records) {
      const value = parseDate(record[column.key]);
      if (value && dayNumber(value) > today) recordIds.push(record.id);
    }

    if (recordIds.length > 0) {
      issues.push({
        id: generateId(),
        checkType: 'future_date',
        category: 'temporal',
        severity: 'error',
        recordIds,
        field: column.key,
        message: `${recordIds.length} record${recordIds.length !== 1 ? 's' : ''} with ${column.label} in the future`,
        details: 'A date after today usually means a mistyped year or a misread date format.',
      });
    }
  }

  return issues;
}

/**
 * Flag values in date columns that are not dates.
 *
 * Such a value takes no part in the other date checks and is left off an epi
 * curve, so without this it is a case that silently goes missing from the
 * analysis. Typical causes are a date typed in another format, a date that
 * does not exist (31/02/2025), or a note typed into the date cell.
 */
function checkUnreadableDates(
  records: CaseRecord[],
  columns: DataColumn[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const column of columns.filter(c => c.type === 'date')) {
    const recordIds: string[] = [];
    let example = '';
    for (const record of records) {
      const value = record[column.key];
      if (isEmpty(value) || parseStoredDate(value)) continue;
      recordIds.push(record.id);
      if (!example) example = String(value).trim();
    }

    if (recordIds.length > 0) {
      issues.push({
        id: generateId(),
        // Reported under date order, the nearest existing check type.
        checkType: 'date_order',
        category: 'temporal',
        severity: 'error',
        recordIds,
        field: column.key,
        message: `${recordIds.length} record${recordIds.length !== 1 ? 's' : ''} with ${column.label} that cannot be read as a date`,
        details: `For example "${example.length > 40 ? `${example.slice(0, 37)}…` : example}". These records are left out of date checks and epi curves until corrected.`,
      });
    }
  }

  return issues;
}

// =============================================================================
// NUMERIC RANGE VALIDATION
// Flags values outside expected bounds (e.g., age 0-120)
// =============================================================================

/**
 * Check that numeric values fall within specified min/max bounds.
 */
function checkNumericRanges(
  records: CaseRecord[],
  rules: NumericRangeRule[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const rule of rules) {
    for (const record of records) {
      const value = record[rule.field];
      if (!isEmpty(value)) {
        const numValue = Number(value);
        if (!isNaN(numValue) && (numValue < rule.min || numValue > rule.max)) {
          issues.push({
            id: generateId(),
            checkType: 'numeric_range',
            category: 'range',
            severity: numValue < 0 ? 'error' : 'warning',
            recordIds: [record.id],
            field: rule.field,
            message: `${rule.fieldLabel} out of expected range (${rule.min}-${rule.max})`,
            details: `Value: ${numValue}`,
          });
        }
      }
    }
  }

  return issues;
}

// =============================================================================
// MISSING VALUE DETECTION
// Identifies records with blank/null values in specified fields
// =============================================================================

/**
 * Check for missing values in specified fields.
 * Groups all records with missing data by field.
 */
function checkMissingValues(
  records: CaseRecord[],
  fields: string[],
  columns: DataColumn[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  if (fields.length === 0) return issues;

  // Group records by field that has missing values
  const missingByField = new Map<string, string[]>();

  for (const field of fields) {
    const recordsWithMissing: string[] = [];

    for (const record of records) {
      const value = record[field];
      if (isEmpty(value)) {
        recordsWithMissing.push(record.id);
      }
    }

    if (recordsWithMissing.length > 0) {
      missingByField.set(field, recordsWithMissing);
    }
  }

  // Create an issue for each field with missing values
  for (const [field, recordIds] of missingByField) {
    const column = columns.find(c => c.key === field);
    const fieldLabel = column?.label || field;

    issues.push({
      id: generateId(),
      checkType: 'missing_values',
      category: 'completeness',
      severity: 'warning',
      recordIds,
      field,
      message: `${recordIds.length} record${recordIds.length !== 1 ? 's' : ''} missing ${fieldLabel}`,
      details: `${Math.round((recordIds.length / records.length) * 100)}% of records affected`,
    });
  }

  return issues;
}

// =============================================================================
// MAIN CHECK RUNNER
// Orchestrates all enabled checks and aggregates issues
// =============================================================================

/**
 * Run all enabled data quality checks based on configuration.
 * Returns a flat array of issues that can be grouped by category for display.
 */
export function runDataQualityChecks(
  records: CaseRecord[],
  columns: DataColumn[],
  config: DataQualityConfig,
  options: DataQualityOptions = {}
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const { enabledChecks } = config;

  // Duplicate check (all fields when no specific fields are configured)
  if (enabledChecks.includes('duplicate')) {
    issues.push(...checkDuplicates(records, config.duplicateFields, columns, config.fuzzyMatching));
  }

  // Date order checks
  if (enabledChecks.includes('date_order') && config.dateOrderRules.length > 0) {
    issues.push(...checkDateOrder(records, config.dateOrderRules, options.dateFormat ?? 'YYYY-MM-DD'));
  }

  // Values in date columns that are not dates: needs no rules either.
  if (enabledChecks.includes('date_order')) {
    issues.push(...checkUnreadableDates(records, columns));
  }

  // Future dates: no rules needed, so this catches something out of the box.
  if (enabledChecks.includes('date_order') && config.checkFutureDates) {
    issues.push(...checkFutureDatesInRecords(records, columns));
  }

  // Numeric range checks
  if (enabledChecks.includes('numeric_range') && config.numericRangeRules.length > 0) {
    issues.push(...checkNumericRanges(records, config.numericRangeRules));
  }

  // Missing value checks (all fields when no specific fields are configured)
  if (enabledChecks.includes('missing_values')) {
    const missingFields = config.missingValueFields.length > 0
      ? config.missingValueFields
      : columns.map(c => c.key);
    issues.push(...checkMissingValues(records, missingFields, columns));
  }

  return issues;
}

// =============================================================================
// DISPLAY UTILITIES
// Human-readable names and grouping for UI presentation
// =============================================================================

/** Get human-readable name for a check type */
export function getCheckName(checkType: string): string {
  const names: Record<string, string> = {
    duplicate: 'Duplicates',
    date_order: 'Date Order',
    future_date: 'Future Dates',
    numeric_range: 'Numeric Range',
    missing_values: 'Missing Values',
  };
  return names[checkType] || checkType;
}

/** Get display name for an issue category */
export function getCategoryName(category: DataQualityIssue['category']): string {
  const names: Record<DataQualityIssue['category'], string> = {
    duplicate: 'Duplicates',
    temporal: 'Date Issues',
    range: 'Out of Range',
    completeness: 'Missing Values',
  };
  return names[category] || category;
}

/** Group issues by category for organized display in the UI */
export function groupIssuesByCategory(
  issues: DataQualityIssue[]
): Record<DataQualityIssue['category'], DataQualityIssue[]> {
  const grouped: Record<DataQualityIssue['category'], DataQualityIssue[]> = {
    duplicate: [],
    temporal: [],
    range: [],
    completeness: [],
  };

  for (const issue of issues) {
    grouped[issue.category].push(issue);
  }

  return grouped;
}
