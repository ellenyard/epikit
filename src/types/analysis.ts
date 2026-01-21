export interface CaseRecord {
  id: string;
  [key: string]: unknown;
}

export interface DataColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean';
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
