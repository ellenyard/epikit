import type {
  CaseRecord,
  DataColumn,
  DataQualityIssue,
  DataQualityConfig,
  DateOrderRule,
  NumericRangeRule,
} from '../types/analysis';

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

// Default configuration
export function getDefaultConfig(): DataQualityConfig {
  return {
    duplicateFields: [],
    dateOrderRules: [],
    checkFutureDates: false,
    numericRangeRules: [],
    missingValueFields: [],
    enabledChecks: ['duplicate', 'date_order', 'numeric_range', 'missing_values'],
  };
}

// Check for exact duplicates across all fields
function checkDuplicates(
  records: CaseRecord[],
  fields: string[],
  columns: DataColumn[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  // Get all data fields (excluding 'id')
  const allFields = columns.map(c => c.key);

  // Use selected fields if provided, otherwise check all fields
  const fieldsToCheck = fields.length > 0 ? fields : allFields;

  if (fieldsToCheck.length === 0) return issues;

  const seen = new Map<string, string[]>();

  for (const record of records) {
    // Create a key from all checked fields
    const keyParts = fieldsToCheck.map(fieldKey => {
      const val = record[fieldKey];
      return val === null || val === undefined ? '' : String(val).trim().toLowerCase();
    });

    // Skip if all fields are empty
    if (keyParts.every(p => p === '')) continue;

    const key = keyParts.join('|');

    const existing = seen.get(key);
    if (existing) {
      existing.push(record.id);
    } else {
      seen.set(key, [record.id]);
    }
  }

  for (const [, ids] of seen) {
    if (ids.length > 1) {
      issues.push({
        id: generateId(),
        checkType: 'duplicate',
        category: 'duplicate',
        severity: 'error',
        recordIds: ids,
        message: `${ids.length} duplicate records found`,
        details: undefined,
      });
    }
  }

  return issues;
}

// Check date order rules
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

// Check numeric ranges
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

// Check for missing values
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

// Main function to run all enabled checks
export function runDataQualityChecks(
  records: CaseRecord[],
  columns: DataColumn[],
  config: DataQualityConfig
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const { enabledChecks } = config;

  // Duplicate check
  if (enabledChecks.includes('duplicate') && config.duplicateFields.length > 0) {
    issues.push(...checkDuplicates(records, config.duplicateFields, columns));
  }

  // Date order checks
  if (enabledChecks.includes('date_order') && config.dateOrderRules.length > 0) {
    issues.push(...checkDateOrder(records, config.dateOrderRules));
  }

  // Numeric range checks
  if (enabledChecks.includes('numeric_range') && config.numericRangeRules.length > 0) {
    issues.push(...checkNumericRanges(records, config.numericRangeRules));
  }

  // Missing value checks
  if (enabledChecks.includes('missing_values') && config.missingValueFields.length > 0) {
    issues.push(...checkMissingValues(records, config.missingValueFields, columns));
  }

  return issues;
}

// Get human-readable check name
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

// Get category display name
export function getCategoryName(category: DataQualityIssue['category']): string {
  const names: Record<DataQualityIssue['category'], string> = {
    duplicate: 'Duplicates',
    temporal: 'Date Issues',
    range: 'Out of Range',
    completeness: 'Missing Values',
  };
  return names[category] || category;
}

// Group issues by category
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
