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
  | 'duplicate_exact'
  | 'duplicate_key'
  | 'temporal_onset_after_exposure'
  | 'temporal_onset_before_report'
  | 'temporal_death_after_onset'
  | 'temporal_future_date'
  | 'temporal_date_range'
  | 'logic_confirmed_needs_positive'
  | 'logic_hospitalized_needs_hospital'
  | 'logic_deceased_needs_date'
  | 'completeness_required'
  | 'range_age';

export interface DataQualityIssue {
  id: string;
  checkType: DataQualityCheckType;
  category: 'duplicate' | 'temporal' | 'logic' | 'completeness' | 'range';
  severity: 'error' | 'warning';
  recordIds: string[];  // Can be multiple for duplicates
  field?: string;
  message: string;
  details?: string;
  dismissed?: boolean;
}

export interface DataQualityFieldMapping {
  // Temporal fields
  onsetDate?: string;
  exposureDate?: string;
  reportDate?: string;
  deathDate?: string;
  specimenDate?: string;
  dateOfBirth?: string;

  // Key identifier fields for duplicate detection
  caseId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;

  // Clinical/logic fields
  caseStatus?: string;
  labResult?: string;
  hospitalized?: string;
  hospitalName?: string;
  outcome?: string;

  // Demographic fields
  age?: string;

  // Required fields for completeness
  requiredFields?: string[];
}

export interface DataQualityConfig {
  fieldMapping: DataQualityFieldMapping;
  enabledChecks: DataQualityCheckType[];
  dateRangeMonths: number;  // For temporal_date_range check
  ageMin: number;
  ageMax: number;
  positiveLabValues: string[];  // Values that count as "positive" lab result
  confirmedStatusValues: string[];  // Values that count as "confirmed" case
}
