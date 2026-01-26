import { useState, useMemo, useEffect, useRef } from 'react';
import type { Dataset, CaseRecord, FilterCondition, SortConfig, DataColumn, EditLogEntry } from '../../types/analysis';
import { filterRecords, sortRecords } from '../../hooks/useDataset';
import { RecordEditorSidebar } from '../review/RecordEditorSidebar';

interface PendingEdit {
  record: CaseRecord;
  recordId: string;
  recordIdentifier: string;
  columnKey: string;
  columnLabel: string;
  oldValue: unknown;
  newValue: unknown;
}

interface LineListingProps {
  dataset: Dataset;
  onUpdateRecord: (recordId: string, updates: Partial<CaseRecord>) => void;
  onDeleteRecord: (recordId: string) => void;
  onAddRecord: (record: Omit<CaseRecord, 'id'>) => void;
  onEditComplete?: (entry: EditLogEntry) => void;
  highlightedRecordIds?: Set<string>;
  scrollToRecordId?: string | null;
  highlightField?: string;
  filters: FilterCondition[];
  showAddRow: boolean;
  onShowAddRowChange: (show: boolean) => void;
}

export function LineListing({
  dataset,
  onUpdateRecord,
  onDeleteRecord,
  onAddRecord,
  onEditComplete,
  highlightedRecordIds,
  scrollToRecordId,
  highlightField,
  filters,
  showAddRow,
  onShowAddRowChange,
}: LineListingProps) {
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [editingCell, setEditingCell] = useState<{ recordId: string; column: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [newRowData, setNewRowData] = useState<Record<string, unknown>>({});
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to record when scrollToRecordId changes
  useEffect(() => {
    if (scrollToRecordId) {
      const rowElement = rowRefs.current.get(scrollToRecordId);
      if (rowElement && tableContainerRef.current) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scrollToRecordId]);

  const processedRecords = useMemo(() => {
    const filtered = filterRecords(dataset.records, filters);
    return sortRecords(filtered, sort);
  }, [dataset.records, filters, sort]);

  const handleSort = (column: string) => {
    setSort(prev => {
      if (prev?.column === column) {
        if (prev.direction === 'asc') return { column, direction: 'desc' };
        return null;
      }
      return { column, direction: 'asc' };
    });
  };

  const startEdit = (recordId: string, column: string, currentValue: unknown) => {
    setEditingCell({ recordId, column });
    setEditValue(String(currentValue ?? ''));
  };

  const saveEdit = () => {
    if (!editingCell) return;
    const col = dataset.columns.find(c => c.key === editingCell.column);
    const record = dataset.records.find(r => r.id === editingCell.recordId);
    if (!record || !col) return;

    const oldValue = record[editingCell.column];
    let newValue: unknown = editValue;

    if (col.type === 'number') {
      newValue = editValue === '' ? null : Number(editValue);
    } else if (col.type === 'boolean') {
      newValue = ['true', 'yes', '1'].includes(editValue.toLowerCase());
    }

    // Only track if value actually changed
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      // Get record identifier (first column value or ID)
      const firstCol = dataset.columns[0];
      const recordIdentifier = firstCol ? String(record[firstCol.key] ?? record.id) : record.id;

      // Create updated record with new value
      const updatedRecord = { ...record, [editingCell.column]: newValue };

      onUpdateRecord(editingCell.recordId, { [editingCell.column]: newValue });

      // Show the edit sidebar if callback is provided
      if (onEditComplete) {
        setPendingEdit({
          record: updatedRecord,
          recordId: editingCell.recordId,
          recordIdentifier,
          columnKey: col.key,
          columnLabel: col.label,
          oldValue,
          newValue,
        });
      }
    }

    setEditingCell(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(processedRecords.map(r => r.id)));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (recordId: string, checked: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  };

  const deleteSelectedRows = () => {
    if (!confirm(`Delete ${selectedRows.size} selected record(s)?`)) return;
    selectedRows.forEach(id => onDeleteRecord(id));
    setSelectedRows(new Set());
  };

  const handleAddRow = () => {
    onAddRecord(newRowData);
    setNewRowData({});
    onShowAddRowChange(false);
  };

  const handleEditPromptSave = (reason: string, initials: string) => {
    if (!pendingEdit || !onEditComplete) return;

    const entry: EditLogEntry = {
      id: crypto.randomUUID(),
      datasetId: dataset.id,
      recordId: pendingEdit.recordId,
      recordIdentifier: pendingEdit.recordIdentifier,
      columnKey: pendingEdit.columnKey,
      columnLabel: pendingEdit.columnLabel,
      oldValue: pendingEdit.oldValue,
      newValue: pendingEdit.newValue,
      reason,
      initials,
      timestamp: new Date().toISOString(),
    };

    onEditComplete(entry);
    setPendingEdit(null);
  };

  const handleEditPromptSkip = () => {
    if (!pendingEdit || !onEditComplete) return;

    const entry: EditLogEntry = {
      id: crypto.randomUUID(),
      datasetId: dataset.id,
      recordId: pendingEdit.recordId,
      recordIdentifier: pendingEdit.recordIdentifier,
      columnKey: pendingEdit.columnKey,
      columnLabel: pendingEdit.columnLabel,
      oldValue: pendingEdit.oldValue,
      newValue: pendingEdit.newValue,
      reason: '',
      initials: '',
      timestamp: new Date().toISOString(),
    };

    onEditComplete(entry);
    setPendingEdit(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{dataset.name}</h2>
            <span className="text-sm text-gray-500">
              {processedRecords.length} of {dataset.records.length} records
            </span>
          </div>
          {selectedRows.size > 0 && (
            <button
              onClick={deleteSelectedRows}
              className="px-3 py-1.5 text-sm font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-50"
            >
              Delete ({selectedRows.size})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedRows.size === processedRecords.length && processedRecords.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="w-10 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                #
              </th>
              {dataset.columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sort?.column === col.key && (
                      <span>{sort.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-20 px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {showAddRow && (
              <tr className="bg-green-50">
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-sm text-gray-500">New</td>
                {dataset.columns.map(col => (
                  <td key={col.key} className="px-4 py-2">
                    <input
                      type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                      value={String(newRowData[col.key] ?? '')}
                      onChange={(e) => setNewRowData(prev => ({ ...prev, [col.key]: e.target.value }))}
                      className="w-full px-2 py-1 text-sm border border-green-300 rounded focus:ring-green-500 focus:border-green-500"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={handleAddRow}
                      className="p-1 text-green-600 hover:text-green-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => { onShowAddRowChange(false); setNewRowData({}); }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {processedRecords.map((record, index) => {
              const isHighlighted = highlightedRecordIds?.has(record.id);
              const isScrollTarget = scrollToRecordId === record.id;
              return (
              <tr
                key={record.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(record.id, el);
                  else rowRefs.current.delete(record.id);
                }}
                className={`
                  ${selectedRows.has(record.id) ? 'bg-blue-50' : ''}
                  ${isHighlighted && !selectedRows.has(record.id) ? 'bg-amber-50' : ''}
                  ${isScrollTarget ? 'ring-2 ring-inset ring-amber-400' : ''}
                  ${!selectedRows.has(record.id) && !isHighlighted ? 'hover:bg-gray-50' : ''}
                `}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(record.id)}
                    onChange={(e) => handleSelectRow(record.id, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-3 py-2 text-sm text-gray-500">{index + 1}</td>
                {dataset.columns.map(col => {
                  const isHighlightedField = isHighlighted && highlightField === col.key;
                  return (
                  <td
                    key={col.key}
                    className={`px-4 py-2 text-sm text-gray-900 ${isHighlightedField ? 'bg-amber-200' : ''}`}
                    onDoubleClick={() => startEdit(record.id, col.key, record[col.key])}
                  >
                    {editingCell?.recordId === record.id && editingCell?.column === col.key ? (
                      <input
                        type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                        className="w-full min-w-[80px] px-2 py-1 text-sm text-gray-900 bg-white border border-blue-500 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                      />
                    ) : (
                      <span className="block truncate max-w-xs" title={String(record[col.key] ?? '')}>
                        {formatCellValue(record[col.key], col)}
                      </span>
                    )}
                  </td>
                  );
                })}
                <td className="px-3 py-2">
                  <button
                    onClick={() => {
                      if (confirm('Delete this record?')) onDeleteRecord(record.id);
                    }}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        {processedRecords.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {filters.length > 0 ? 'No records match your filters' : 'No records in this dataset'}
          </div>
        )}
      </div>

      {/* Record Editor Sidebar */}
      {pendingEdit && (
        <RecordEditorSidebar
          isOpen={!!pendingEdit}
          record={pendingEdit.record}
          columns={dataset.columns}
          recordIdentifier={pendingEdit.recordIdentifier}
          editedColumnKey={pendingEdit.columnKey}
          editedColumnLabel={pendingEdit.columnLabel}
          oldValue={pendingEdit.oldValue}
          newValue={pendingEdit.newValue}
          onSave={handleEditPromptSave}
          onSkip={handleEditPromptSkip}
        />
      )}
    </div>
  );
}

function formatCellValue(value: unknown, column: DataColumn): string {
  if (value === null || value === undefined) return '';

  if (column.type === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (column.type === 'date' && value) {
    try {
      const date = new Date(String(value));
      return date.toLocaleDateString();
    } catch {
      return String(value);
    }
  }

  return String(value);
}
