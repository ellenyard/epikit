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
import { calculateRecordSimilarity } from './stringSimilarity';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Generate unique ID for issues
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Parse a date value from various formats
function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value).trim();
  if (!str) return null;
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
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
export function getDefaultConfig(): DataQualityConfig {
  return {
    duplicateFields: [],
    fuzzyMatching: {
      enabled: true,
      textThreshold: 0.85, // 85% similarity for text fields
      dateTolerance: 0, // Exact date match by default
    },
    dateOrderRules: [],
    checkFutureDates: false,
    numericRangeRules: [],
    missingValueFields: [],
    enabledChecks: ['duplicate', 'date_order', 'numeric_range'],
  };
}

// =============================================================================
// DUPLICATE DETECTION
// Identifies exact and near-duplicate records using fuzzy string matching
// =============================================================================

/**
 * Check for duplicate records using configurable fuzzy matching.
 * Groups similar records together rather than creating pairwise issues.
 */
function checkDuplicates(
  records: CaseRecord[],
  fields: string[],
  columns: DataColumn[],
  fuzzyConfig: FuzzyMatchingConfig
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  // Get all data fields (excluding 'id')
  const allFields = columns.map(c => c.key);

  // Use selected fields if provided, otherwise check all fields
  const fieldsToCheck = fields.length > 0 ? fields : allFields;

  if (fieldsToCheck.length === 0) return issues;

  // Build field info with types for similarity calculation
  const fieldInfo = fieldsToCheck.map(key => {
    const col = columns.find(c => c.key === key);
    return {
      key,
      type: (col?.type || 'text') as 'text' | 'date' | 'number' | 'boolean',
    };
  });

  // Track which records have been assigned to a duplicate group
  const assignedToGroup = new Set<string>();
  const duplicateGroups: string[][] = [];

  // Threshold for considering records as duplicates
  const threshold = fuzzyConfig.enabled ? fuzzyConfig.textThreshold : 1.0;

  // Compare each pair of records
  for (let i = 0; i < records.length; i++) {
    const record1 = records[i];

    // Skip if all checked fields are empty
    const hasData1 = fieldsToCheck.some(f => {
      const val = record1[f];
      return val !== null && val !== undefined && String(val).trim() !== '';
    });
    if (!hasData1) continue;

    // Skip if already in a group
    if (assignedToGroup.has(record1.id)) continue;

    const currentGroup: string[] = [record1.id];

    for (let j = i + 1; j < records.length; j++) {
      const record2 = records[j];

      // Skip if already in a group
      if (assignedToGroup.has(record2.id)) continue;

      // Skip if all checked fields are empty
      const hasData2 = fieldsToCheck.some(f => {
        const val = record2[f];
        return val !== null && val !== undefined && String(val).trim() !== '';
      });
      if (!hasData2) continue;

      // Calculate similarity
      const similarity = calculateRecordSimilarity(
        record1,
        record2,
        fieldInfo,
        {
          textThreshold: fuzzyConfig.textThreshold,
          dateTolerance: fuzzyConfig.dateTolerance,
        }
      );

      // If similarity meets threshold, add to group
      if (similarity >= threshold) {
        currentGroup.push(record2.id);
        assignedToGroup.add(record2.id);
      }
    }

    // If group has more than one record, it's a duplicate group
    if (currentGroup.length > 1) {
      duplicateGroups.push(currentGroup);
      assignedToGroup.add(record1.id);
    }
  }

  // Create issues for each duplicate group
  for (const group of duplicateGroups) {
    const isFuzzy = fuzzyConfig.enabled && fuzzyConfig.textThreshold < 1.0;
    issues.push({
      id: generateId(),
      checkType: 'duplicate',
      category: 'duplicate',
      severity: isFuzzy ? 'warning' : 'error',
      recordIds: group,
      message: isFuzzy
        ? `${group.length} similar records found (${Math.round(fuzzyConfig.textThreshold * 100)}% match)`
        : `${group.length} duplicate records found`,
      details: isFuzzy
        ? `Fuzzy matching with ${Math.round(fuzzyConfig.textThreshold * 100)}% threshold${fuzzyConfig.dateTolerance > 0 ? `, ±${fuzzyConfig.dateTolerance} day date tolerance` : ''}`
        : undefined,
    });
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
  rules: DateOrderRule[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const rule of rules) {
    for (const record of records) {
      const firstDate = parseDate(record[rule.firstDateField]);
      const secondDate = parseDate(record[rule.secondDateField]);

      // Only check if both dates are present
      if (firstDate && secondDate && firstDate > secondDate) {
        issues.push({
          id: generateId(),
          checkType: 'date_order',
          category: 'temporal',
          severity: 'error',
          recordIds: [record.id],
          field: rule.secondDateField,
          message: `${rule.secondDateLabel} before ${rule.firstDateLabel}`,
          details: `${rule.firstDateLabel}: ${firstDate.toLocaleDateString()}, ${rule.secondDateLabel}: ${secondDate.toLocaleDateString()}`,
        });
      }
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

  // Debug logging
  console.log('[DataQuality] checkNumericRanges called with', rules.length, 'rules');

  for (const rule of rules) {
    console.log('[DataQuality] Checking rule:', rule.field, 'range:', rule.min, '-', rule.max);
    let checkedCount = 0;
    let outOfRangeCount = 0;

    for (const record of records) {
      const value = record[rule.field];
      if (!isEmpty(value)) {
        checkedCount++;
        const numValue = Number(value);
        if (!isNaN(numValue) && (numValue < rule.min || numValue > rule.max)) {
          outOfRangeCount++;
          console.log('[DataQuality] OUT OF RANGE: record', record.id, 'has', rule.field, '=', numValue);
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
    console.log('[DataQuality] Checked', checkedCount, 'records, found', outOfRangeCount, 'out of range');
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
  config: DataQualityConfig
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const { enabledChecks } = config;

  // Duplicate check
  if (enabledChecks.includes('duplicate') && config.duplicateFields.length > 0) {
    issues.push(...checkDuplicates(records, config.duplicateFields, columns, config.fuzzyMatching));
  }

  // Date order checks
  if (enabledChecks.includes('date_order') && config.dateOrderRules.length > 0) {
    issues.push(...checkDateOrder(records, config.dateOrderRules));
  }

  // Numeric range checks
  console.log('[DataQuality] numeric_range enabled:', enabledChecks.includes('numeric_range'));
  console.log('[DataQuality] numericRangeRules count:', config.numericRangeRules.length);
  if (enabledChecks.includes('numeric_range') && config.numericRangeRules.length > 0) {
    issues.push(...checkNumericRanges(records, config.numericRangeRules));
  }

  // Missing value checks
  if (enabledChecks.includes('missing_values') && config.missingValueFields.length > 0) {
    issues.push(...checkMissingValues(records, config.missingValueFields, columns));
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
