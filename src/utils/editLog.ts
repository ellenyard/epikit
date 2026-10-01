/**
 * Edit-log entries for whole records.
 *
 * The log was built for cell edits: a record, a column, an old value and a new
 * one. Adding and deleting records never reached it, so the one kind of change
 * that removes data outright left no trace in the audit trail and could not
 * be undone.
 *
 * Both are recorded in the existing entry shape, so saved logs, project files
 * and the CSV export need no change. The column key marks the kind of entry
 * and the record itself travels as JSON text in the old or new value, which
 * is what lets a deletion be undone.
 */
import type { CaseRecord, DataColumn, EditLogEntry } from '../types/analysis';

export const RECORD_DELETED_KEY = '__record_deleted__';
export const RECORD_ADDED_KEY = '__record_added__';

export function isRecordDeletion(entry: EditLogEntry): boolean {
  return entry.columnKey === RECORD_DELETED_KEY;
}

export function isRecordAddition(entry: EditLogEntry): boolean {
  return entry.columnKey === RECORD_ADDED_KEY;
}

/** What a record is called in the log: its first column, or its internal id. */
export function recordIdentifierOf(record: CaseRecord, columns: DataColumn[]): string {
  const first = columns[0];
  const value = first ? record[first.key] : undefined;
  return value === null || value === undefined || value === '' ? record.id : String(value);
}

function baseEntry(datasetId: string, record: CaseRecord, columns: DataColumn[]) {
  return {
    id: crypto.randomUUID(),
    datasetId,
    recordId: record.id,
    recordIdentifier: recordIdentifierOf(record, columns),
    reason: '',
    initials: '',
    timestamp: new Date().toISOString(),
  };
}

export function recordDeletedEntry(datasetId: string, record: CaseRecord, columns: DataColumn[]): EditLogEntry {
  return {
    ...baseEntry(datasetId, record, columns),
    columnKey: RECORD_DELETED_KEY,
    columnLabel: 'Record deleted',
    oldValue: JSON.stringify(record),
    newValue: null,
  };
}

export function recordAddedEntry(datasetId: string, record: CaseRecord, columns: DataColumn[]): EditLogEntry {
  return {
    ...baseEntry(datasetId, record, columns),
    columnKey: RECORD_ADDED_KEY,
    columnLabel: 'Record added',
    oldValue: null,
    newValue: JSON.stringify(record),
  };
}

/** The record a deletion entry removed, or null if the entry does not hold one. */
export function deletedRecordOf(entry: EditLogEntry): CaseRecord | null {
  if (!isRecordDeletion(entry) || typeof entry.oldValue !== 'string') return null;
  try {
    const record: unknown = JSON.parse(entry.oldValue);
    if (record && typeof record === 'object' && typeof (record as CaseRecord).id === 'string') {
      return record as CaseRecord;
    }
  } catch {
    // Not a record; nothing to restore.
  }
  return null;
}
