export interface CaseRecord {
  id: string;
  [key: string]: unknown;
}

export interface DataColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'categorical';
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
  | 'age_range';

export interface DataQualityIssue {
  id: string;
  checkType: DataQualityCheckType;
  category: 'duplicate' | 'temporal' | 'range';
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

export interface DataQualityConfig {
  // Duplicate detection: which fields to check
  duplicateFields: string[];

  // Date order rules
  dateOrderRules: DateOrderRule[];

  // Check for future dates
  checkFutureDates: boolean;

  // Age range check
  ageField?: string;
  ageMin: number;
  ageMax: number;

  // Which checks are enabled
  enabledChecks: DataQualityCheckType[];
}
