import { useState, useCallback } from 'react';
import type { Dataset, CaseRecord, DataColumn, FilterCondition, SortConfig, EditLogEntry } from '../types/analysis';

interface UseDatasetOptions {
  initialDatasets?: Dataset[];
  initialActiveId?: string;
}

export function useDataset(options?: UseDatasetOptions) {
  const [datasets, setDatasets] = useState<Dataset[]>(options?.initialDatasets || []);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(options?.initialActiveId || null);
  const [editLog, setEditLog] = useState<EditLogEntry[]>([]);

  const activeDataset = datasets.find(d => d.id === activeDatasetId) || null;

  const createDataset = useCallback((name: string, columns: DataColumn[], records: CaseRecord[], source: 'import' | 'form' = 'import'): Dataset => {
    const newDataset: Dataset = {
      id: crypto.randomUUID(),
      name,
      source,
      columns,
      records,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDatasets(prev => [...prev, newDataset]);
    setActiveDatasetId(newDataset.id);
    return newDataset;
  }, []);

  const updateDataset = useCallback((id: string, updates: Partial<Dataset>) => {
    setDatasets(prev => prev.map(d =>
      d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
    ));
  }, []);

  const deleteDataset = useCallback((id: string) => {
    setDatasets(prev => prev.filter(d => d.id !== id));
    if (activeDatasetId === id) {
      setActiveDatasetId(null);
    }
  }, [activeDatasetId]);

  const addRecord = useCallback((datasetId: string, record: Omit<CaseRecord, 'id'>) => {
    const newRecord: CaseRecord = { ...record, id: crypto.randomUUID() };
    setDatasets(prev => prev.map(d =>
      d.id === datasetId
        ? { ...d, records: [...d.records, newRecord], updatedAt: new Date().toISOString() }
        : d
    ));
    return newRecord;
  }, []);

  const updateRecord = useCallback((datasetId: string, recordId: string, updates: Partial<CaseRecord>) => {
    setDatasets(prev => prev.map(d =>
      d.id === datasetId
        ? {
            ...d,
            records: d.records.map(r => r.id === recordId ? { ...r, ...updates } : r),
            updatedAt: new Date().toISOString()
          }
        : d
    ));
  }, []);

  const deleteRecord = useCallback((datasetId: string, recordId: string) => {
    setDatasets(prev => prev.map(d =>
      d.id === datasetId
        ? { ...d, records: d.records.filter(r => r.id !== recordId), updatedAt: new Date().toISOString() }
        : d
    ));
  }, []);

  const addEditLogEntry = useCallback((entry: EditLogEntry) => {
    setEditLog(prev => [...prev, entry]);
  }, []);

  const updateEditLogEntry = useCallback((id: string, updates: Partial<EditLogEntry>) => {
    setEditLog(prev => prev.map(entry =>
      entry.id === id ? { ...entry, ...updates } : entry
    ));
  }, []);

  const getEditLogForDataset = useCallback((datasetId: string) => {
    return editLog.filter(entry => entry.datasetId === datasetId);
  }, [editLog]);

  const exportEditLog = useCallback((datasetId: string) => {
    const entries = editLog.filter(e => e.datasetId === datasetId);
    if (entries.length === 0) return;

    const headers = ['Record ID', 'Variable', 'Old Value', 'New Value', 'Reason', 'Date/Time', 'Initials'];
    const rows = entries.map(e => [
      e.recordIdentifier,
      e.columnLabel,
      String(e.oldValue ?? ''),
      String(e.newValue ?? ''),
      e.reason,
      new Date(e.timestamp).toLocaleString(),
      e.initials,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dataset = datasets.find(d => d.id === datasetId);
    a.download = `${dataset?.name || 'dataset'}_edit_log.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [editLog, datasets]);

  return {
    datasets,
    activeDataset,
    activeDatasetId,
    setActiveDatasetId,
    createDataset,
    updateDataset,
    deleteDataset,
    addRecord,
    updateRecord,
    deleteRecord,
    editLog,
    addEditLogEntry,
    updateEditLogEntry,
    getEditLogForDataset,
    exportEditLog,
  };
}

// Utility functions for filtering and sorting
export function filterRecords(records: CaseRecord[], filters: FilterCondition[]): CaseRecord[] {
  if (filters.length === 0) return records;

  return records.filter(record => {
    return filters.every(filter => {
      const value = record[filter.column];
      const filterValue = filter.value;

      switch (filter.operator) {
        case 'equals':
          return String(value).toLowerCase() === String(filterValue).toLowerCase();
        case 'not_equals':
          return String(value).toLowerCase() !== String(filterValue).toLowerCase();
        case 'contains':
          return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
        case 'greater_than':
          return Number(value) > Number(filterValue);
        case 'less_than':
          return Number(value) < Number(filterValue);
        case 'is_empty':
          return value === null || value === undefined || value === '';
        case 'is_not_empty':
          return value !== null && value !== undefined && value !== '';
        default:
          return true;
      }
    });
  });
}

export function sortRecords(records: CaseRecord[], sort: SortConfig | null): CaseRecord[] {
  if (!sort) return records;

  return [...records].sort((a, b) => {
    const aVal = a[sort.column];
    const bVal = b[sort.column];

    if (aVal === null || aVal === undefined) return sort.direction === 'asc' ? 1 : -1;
    if (bVal === null || bVal === undefined) return sort.direction === 'asc' ? -1 : 1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const comparison = String(aVal).localeCompare(String(bVal));
    return sort.direction === 'asc' ? comparison : -comparison;
  });
}
