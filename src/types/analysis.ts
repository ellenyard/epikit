export interface CaseRecord {
  id: string;
  [key: string]: unknown;
}

export interface DataColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'categorical';
  /** Optional ordered list of values for display in frequency tables (e.g., age groups in order) */
  valueOrder?: string[];
}

export interface Dataset {
  id: string;
  name: string;
  source: 'import' | 'form';
  columns: DataColumn[];
  records: CaseRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface FilterCondition {
  column: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value: string | number | boolean;
}

export interface SortConfig {
  column: string;
  direction: 'asc' | 'desc';
}

export interface EditLogEntry {
  id: string;
  datasetId: string;
  recordId: string;
  recordIdentifier: string;
  columnKey: string;
  columnLabel: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  initials: string;
  timestamp: string;
}

// Data Quality Check Types
export type DataQualityCheckType =
  | 'duplicate'
  | 'date_order'
  | 'future_date'
  | 'numeric_range'
  | 'missing_values';

export interface DataQualityIssue {
  id: string;
  checkType: DataQualityCheckType;
  category: 'duplicate' | 'temporal' | 'range' | 'completeness';
  severity: 'error' | 'warning';
  recordIds: string[];  // Can be multiple for duplicates
  field?: string;
  message: string;
  details?: string;
  dismissed?: boolean;
}

// Date order rule: firstDate should always come before secondDate
export interface DateOrderRule {
  id: string;
  firstDateField: string;   // Field that should come first (earlier)
  secondDateField: string;  // Field that should come second (later)
  firstDateLabel: string;   // Display label for first date
  secondDateLabel: string;  // Display label for second date
}

// Numeric range rule: check if numeric values are within expected bounds
export interface NumericRangeRule {
  id: string;
  field: string;        // Numeric field to check
  fieldLabel: string;   // Display label for the field
  min: number;          // Minimum acceptable value
  max: number;          // Maximum acceptable value
}

export interface FuzzyMatchingConfig {
  enabled: boolean;
  // Similarity threshold for text fields (0-1, where 1 is exact match)
  // Default: 0.85 (85% similarity)
  textThreshold: number;
  // Date tolerance in days (0 = exact match)
  // Default: 0
  dateTolerance: number;
}

export interface DataQualityConfig {
  // Duplicate detection: which fields to check
  duplicateFields: string[];

  // Fuzzy matching settings for duplicate detection
  fuzzyMatching: FuzzyMatchingConfig;

  // Date order rules
  dateOrderRules: DateOrderRule[];

  // Check for future dates
  checkFutureDates: boolean;

  // Numeric range rules
  numericRangeRules: NumericRangeRule[];

  // Missing value check: which fields to check for missing/empty values
  missingValueFields: string[];

  // Which checks are enabled
  enabledChecks: DataQualityCheckType[];
}

// Variable Creation Types
export type CreationMethod = 'categorize' | 'formula' | 'copy' | 'blank';

export interface CategoryRule {
  id: string;
  label: string;
  min?: number;
  max?: number;
  values?: string[]; // For text categorization
}

export interface VariableConfig {
  name: string;
  label: string;
  type: DataColumn['type'];
  method: CreationMethod;
  sourceColumn?: string;
  categories?: CategoryRule[];
  formula?: string;
}
