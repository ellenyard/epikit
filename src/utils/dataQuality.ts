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
    checkFutureDates: true,
    numericRangeRules: [],
    enabledChecks: ['duplicate', 'date_order', 'future_date', 'numeric_range'],
  };
}

// Check for duplicates based on selected fields
function checkDuplicates(
  records: CaseRecord[],
  fields: string[],
  columns: DataColumn[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  if (fields.length === 0) return issues;

  const seen = new Map<string, string[]>();

  for (const record of records) {
    // Create a key from selected fields
    const keyParts = fields.map(fieldKey => {
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
      const fieldLabels = fields.map(f => {
        const col = columns.find(c => c.key === f);
        return col?.label || f;
      }).join(', ');

      issues.push({
        id: generateId(),
        checkType: 'duplicate',
        category: 'duplicate',
        severity: 'error',
        recordIds: ids,
        message: `${ids.length} duplicate records`,
        details: `Same values in: ${fieldLabels}`,
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

// Check for future dates
function checkFutureDates(
  records: CaseRecord[],
  columns: DataColumn[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Get all date columns
  const dateColumns = columns.filter(c => c.type === 'date').map(c => c.key);

  for (const record of records) {
    for (const colKey of dateColumns) {
      const date = parseDate(record[colKey]);
      if (date && date > today) {
        const col = columns.find(c => c.key === colKey);
        issues.push({
          id: generateId(),
          checkType: 'future_date',
          category: 'temporal',
          severity: 'error',
          recordIds: [record.id],
          field: colKey,
          message: `Future date in ${col?.label || colKey}`,
          details: `Date: ${date.toLocaleDateString()}`,
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

  // Future date check
  if (enabledChecks.includes('future_date') && config.checkFutureDates) {
    issues.push(...checkFutureDates(records, columns));
  }

  // Numeric range checks
  if (enabledChecks.includes('numeric_range') && config.numericRangeRules.length > 0) {
    issues.push(...checkNumericRanges(records, config.numericRangeRules));
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
  };
  return names[checkType] || checkType;
}

// Get category display name
export function getCategoryName(category: DataQualityIssue['category']): string {
  const names: Record<DataQualityIssue['category'], string> = {
    duplicate: 'Duplicates',
    temporal: 'Date Issues',
    range: 'Out of Range',
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
  };

  for (const issue of issues) {
    grouped[issue.category].push(issue);
  }

  return grouped;
}
