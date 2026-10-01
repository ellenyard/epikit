import { useState, useMemo, useEffect, useRef } from 'react';
import type { Dataset, CaseRecord, FilterCondition, SortConfig, DataColumn, EditLogEntry } from '../../types/analysis';
import { filterRecords, sortRecords } from '../../hooks/useDataset';
import { RecordEditorSidebar } from '../review/RecordEditorSidebar';
import { useLocale } from '../../contexts/LocaleContext';
import type { DateFormat } from '../../contexts/LocaleContext';
import { formatStoredDate, parseStoredDate } from '../../utils/dateValue';
import { convertDateValue } from '../../utils/dateDetection';
import { recordAddedEntry, recordDeletedEntry, recordIdentifierOf } from '../../utils/editLog';

interface PendingEdit {
  /** The edit-log entry already written for this edit; the prompt only adds to it. */
  entryId: string;
  record: CaseRecord;
  recordId: string;
  recordIdentifier: string;
  columnKey: string;
  columnLabel: string;
  oldValue: unknown;
  newValue: unknown;
}

interface ColumnVisibilityState {
  [key: string]: boolean;
}

interface LineListingProps {
  dataset: Dataset;
  onUpdateRecord: (recordId: string, updates: Partial<CaseRecord>) => void;
  onDeleteRecord: (recordId: string) => void;
  /** Delete several records in one update. Falls back to onDeleteRecord per record. */
  onDeleteRecords?: (recordIds: string[]) => void;
  onAddRecord: (record: Omit<CaseRecord, 'id'>) => CaseRecord | void;
  onEditComplete?: (entry: EditLogEntry) => void;
  /** Adds the reason and initials to an entry onEditComplete already logged. */
  onUpdateEditLogEntry?: (id: string, updates: Partial<EditLogEntry>) => void;
  highlightedRecordIds?: Set<string>;
  scrollToRecordId?: string | null;
  highlightField?: string;
  filters: FilterCondition[];
  showAddRow: boolean;
  onShowAddRowChange: (show: boolean) => void;
}

// The table renders one page of rows. Rendering every row put a million cells
// in the page for a 50,000-row file: opening the tab took minutes and each
// keystroke re-rendered all of it.
const PAGE_SIZES = [50, 100, 250, 500];
const DEFAULT_PAGE_SIZE = 100;

type EditorKind = 'number' | 'date' | 'datetime-local' | 'boolean' | 'text';

/**
 * Which editor a cell opens with. A date column gets a date picker only when
 * the stored value is one the picker can show; a value that is not a readable
 * date opens as text, so it can be seen and corrected instead of appearing as
 * an empty picker.
 */
function editorFor(column: DataColumn, value: unknown): EditorKind {
  if (column.type === 'number') return 'number';
  if (column.type === 'boolean' || typeof value === 'boolean') return 'boolean';
  if (column.type === 'date') {
    if (value === null || value === undefined || value === '') return 'date';
    const parts = parseStoredDate(value);
    if (!parts) return 'text';
    return parts.hasTime ? 'datetime-local' : 'date';
  }
  return 'text';
}

export function LineListing({
  dataset,
  onUpdateRecord,
  onDeleteRecord,
  onDeleteRecords,
  onAddRecord,
  onEditComplete,
  onUpdateEditLogEntry,
  highlightedRecordIds,
  scrollToRecordId,
  highlightField,
  filters,
  showAddRow,
  onShowAddRowChange,
}: LineListingProps) {
  const { config: localeConfig } = useLocale();
  const dateFormat = localeConfig.dateFormat;
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [editingCell, setEditingCell] = useState<{ recordId: string; column: string; editor: EditorKind } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [newRowData, setNewRowData] = useState<Record<string, unknown>>({});
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibilityState>(() => {
    const state: ColumnVisibilityState = {};
    dataset.columns.forEach(col => {
      state[col.key] = true;
    });
    return state;
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Close column menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setShowColumnMenu(false);
      }
    };

    if (showColumnMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColumnMenu]);

  const processedRecords = useMemo(() => {
    const filtered = filterRecords(dataset.records, filters, dataset.columns, { dateFormat });
    return sortRecords(filtered, sort);
  }, [dataset.records, dataset.columns, filters, sort, dateFormat]);

  // The page shown. Clamped here rather than reset in an effect, so a filter
  // that shortens the list never leaves the table on a page past the end.
  const pageCount = Math.max(1, Math.ceil(processedRecords.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * pageSize;
  const pageRecords = useMemo(
    () => processedRecords.slice(pageStart, pageStart + pageSize),
    [processedRecords, pageStart, pageSize]
  );

  // Turn to the page holding a record a data-quality issue points at. Done
  // while rendering, the way React asks for state derived from a prop change.
  const [lastScrollTarget, setLastScrollTarget] = useState<string | null>(null);
  if ((scrollToRecordId ?? null) !== lastScrollTarget) {
    setLastScrollTarget(scrollToRecordId ?? null);
    if (scrollToRecordId) {
      const index = processedRecords.findIndex(r => r.id === scrollToRecordId);
      if (index >= 0) setPage(Math.floor(index / pageSize));
    }
  }

  // Scroll to record when scrollToRecordId changes
  useEffect(() => {
    if (scrollToRecordId) {
      const rowElement = rowRefs.current.get(scrollToRecordId);
      if (rowElement && tableContainerRef.current) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scrollToRecordId, currentPage]);

  // Number of selected rows that are currently visible (respecting filters)
  const visibleSelectedCount = useMemo(
    () => processedRecords.reduce((n, r) => (selectedRows.has(r.id) ? n + 1 : n), 0),
    [processedRecords, selectedRows]
  );
  const pageFullySelected = pageRecords.length > 0 && pageRecords.every(r => selectedRows.has(r.id));

  const handleSort = (column: string) => {
    setSort(prev => {
      if (prev?.column === column) {
        if (prev.direction === 'asc') return { column, direction: 'desc' };
        return null;
      }
      return { column, direction: 'asc' };
    });
  };

  const startEdit = (recordId: string, column: DataColumn, currentValue: unknown) => {
    const editor = editorFor(column, currentValue);
    setEditingCell({ recordId, column: column.key, editor });
    if (editor === 'boolean') {
      // A stored true/false, or the words in a column typed as yes/no.
      const text = String(currentValue ?? '').toLowerCase();
      setEditValue(['true', 'yes', '1'].includes(text) ? 'yes' : ['false', 'no', '0'].includes(text) ? 'no' : '');
    } else if (editor === 'datetime-local') {
      // The picker wants a "T" between date and time.
      setEditValue(String(currentValue).trim().replace(' ', 'T').slice(0, 19));
    } else {
      setEditValue(String(currentValue ?? ''));
    }
  };

  const saveEdit = () => {
    if (!editingCell) return;
    const col = dataset.columns.find(c => c.key === editingCell.column);
    const record = dataset.records.find(r => r.id === editingCell.recordId);
    if (!record || !col) return;

    const oldValue = record[editingCell.column];
    let newValue: unknown = editValue;

    if (editingCell.editor === 'number') {
      // Map empty or unparseable input to null instead of storing NaN
      const parsed = editValue === '' ? null : Number(editValue);
      newValue = parsed !== null && isNaN(parsed) ? null : parsed;
    } else if (editingCell.editor === 'boolean') {
      // Three states. Blank stays blank: it used to become "No", so opening an
      // empty cell and clicking away recorded an answer nobody had given.
      newValue = editValue === '' ? null : editValue === 'yes';
    } else if (col.type === 'date' && editingCell.editor === 'text' && editValue.trim() !== '') {
      // A date typed by hand, in the user's own format. Stored as a date when
      // it can be read as one; otherwise kept as typed.
      const parsed = convertDateValue(editValue, dateFormat === 'MM/DD/YYYY' ? 'MDY' : 'DMY');
      newValue = parsed ? parsed.iso : editValue.trim();
    }

    // Only track if value actually changed
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      const recordIdentifier = recordIdentifierOf(record, dataset.columns);

      // Create updated record with new value
      const updatedRecord = { ...record, [editingCell.column]: newValue };

      onUpdateRecord(editingCell.recordId, { [editingCell.column]: newValue });

      if (onEditComplete) {
        // Log the edit now, with the change itself. The sidebar then asks for
        // a reason and initials and adds them to this entry. Logging only
        // when the sidebar was answered meant an edit followed by a click on
        // another tab changed the data and left nothing in the log.
        const entry: EditLogEntry = {
          id: crypto.randomUUID(),
          datasetId: dataset.id,
          recordId: editingCell.recordId,
          recordIdentifier,
          columnKey: col.key,
          columnLabel: col.label,
          oldValue,
          newValue,
          reason: '',
          initials: '',
          timestamp: new Date().toISOString(),
        };
        onEditComplete(entry);

        // Queue instead of replacing, so an edit made while the editor
        // sidebar is open still gets its own prompt
        setPendingEdits(prev => [...prev, {
          entryId: entry.id,
          record: updatedRecord,
          recordId: editingCell.recordId,
          recordIdentifier,
          columnKey: col.key,
          columnLabel: col.label,
          oldValue,
          newValue,
        }]);
      }
    }

    setEditingCell(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleSelectPage = (checked: boolean) => {
    // The header box covers the rows on screen. Selecting rows on pages the
    // user has not looked at takes the explicit "Select all" beside it.
    setSelectedRows(prev => {
      const next = new Set(prev);
      for (const record of pageRecords) {
        if (checked) next.add(record.id);
        else next.delete(record.id);
      }
      return next;
    });
  };

  const handleSelectRow = (recordId: string, checked: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  };

  /** Remove records, writing each one to the edit log first so it can be restored. */
  const deleteRecords = (ids: string[]) => {
    if (onEditComplete) {
      const wanted = new Set(ids);
      for (const record of dataset.records) {
        if (wanted.has(record.id)) onEditComplete(recordDeletedEntry(dataset.id, record, dataset.columns));
      }
    }
    if (onDeleteRecords) onDeleteRecords(ids);
    else ids.forEach(id => onDeleteRecord(id));
  };

  const deleteSelectedRows = () => {
    // Only delete rows that are currently visible (respecting filters), so
    // selections made before filtering can't remove hidden records
    const visibleIds = new Set(processedRecords.map(r => r.id));
    const idsToDelete = [...selectedRows].filter(id => visibleIds.has(id));
    if (idsToDelete.length === 0) return;
    if (!confirm(`Delete ${idsToDelete.length} selected record(s)?`)) return;
    deleteRecords(idsToDelete);
    setSelectedRows(new Set());
  };

  const handleAddRow = () => {
    // Coerce values by column type (same rules as saveEdit) so number
    // columns are not stored as raw strings
    const record: Record<string, unknown> = {};
    for (const col of dataset.columns) {
      const raw = newRowData[col.key];
      if (raw === undefined || raw === '') continue;
      if (col.type === 'number') {
        const parsed = Number(raw);
        record[col.key] = isNaN(parsed) ? null : parsed;
      } else if (col.type === 'boolean') {
        record[col.key] = raw === 'yes';
      } else {
        record[col.key] = raw;
      }
    }
    const added = onAddRecord(record);
    if (added && onEditComplete) onEditComplete(recordAddedEntry(dataset.id, added, dataset.columns));
    setNewRowData({});
    onShowAddRowChange(false);
  };

  const handleEditPromptSave = (reason: string, initials: string) => {
    const pendingEdit = pendingEdits[0];
    if (!pendingEdit) return;
    if (reason || initials) onUpdateEditLogEntry?.(pendingEdit.entryId, { reason, initials });
    setPendingEdits(prev => prev.slice(1));
  };

  const handleEditPromptSkip = () => {
    // The edit is already in the log; skipping only leaves the reason blank.
    setPendingEdits(prev => prev.slice(1));
  };

  const toggleColumnVisibility = (columnKey: string) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !(prev[columnKey] ?? true),
    }));
  };

  const showAllColumns = () => {
    const newState: ColumnVisibilityState = {};
    dataset.columns.forEach(col => {
      newState[col.key] = true;
    });
    setVisibleColumns(newState);
  };

  const hideAllColumns = () => {
    const newState: ColumnVisibilityState = {};
    dataset.columns.forEach(col => {
      newState[col.key] = false;
    });
    setVisibleColumns(newState);
  };

  const visibleColumnCount = dataset.columns.filter(col => visibleColumns[col.key] ?? true).length;

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
          <div className="flex items-center gap-2">
            {/* Columns Button */}
            <div className="relative" ref={columnMenuRef}>
              <button
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                title="Show/hide columns"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m0 6v4a2 2 0 002 2h4m0 0h4a2 2 0 002-2v-4m0-6V5a2 2 0 00-2-2h-4m0 0V3m0 6h0m0 0v0m0 0h0" />
                </svg>
                Columns
                {visibleColumnCount < dataset.columns.length && (
                  <span className="text-xs text-gray-500">({visibleColumnCount}/{dataset.columns.length})</span>
                )}
              </button>

              {/* Column Dropdown Menu */}
              {showColumnMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowColumnMenu(false)} />
                  <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20 max-h-96 overflow-y-auto">
                    {/* Quick Actions */}
                    <div className="px-3 py-2 border-b border-gray-200 space-y-1">
                      <button
                        onClick={showAllColumns}
                        className="w-full text-left px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        Show All
                      </button>
                      <button
                        onClick={hideAllColumns}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded transition-colors"
                      >
                        Hide All
                      </button>
                    </div>

                    {/* Column List */}
                    <div className="px-2 py-1">
                      {dataset.columns.map(col => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns[col.key] ?? true}
                            onChange={() => toggleColumnVisibility(col.key)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700 flex-1 truncate">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {pageFullySelected && visibleSelectedCount < processedRecords.length && (
              <button
                onClick={() => setSelectedRows(new Set(processedRecords.map(r => r.id)))}
                className="px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg"
              >
                Select all {processedRecords.length.toLocaleString()}
              </button>
            )}
            {visibleSelectedCount > 0 && (
              <button
                onClick={deleteSelectedRows}
                className="px-3 py-1.5 text-sm font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-50"
              >
                Delete ({visibleSelectedCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="sticky left-0 z-20 w-10 px-3 py-3 bg-gray-50 border-r border-gray-200">
                <input
                  type="checkbox"
                  aria-label="Select the rows on this page"
                  checked={pageFullySelected}
                  onChange={(e) => handleSelectPage(e.target.checked)}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="sticky left-10 z-20 w-10 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50 border-r border-gray-200">
                #
              </th>
              {dataset.columns.map((col, index) => {
                const isFirstDataColumn = index === 0;
                const isVisible = visibleColumns[col.key] ?? true;
                if (!isVisible) return null;

                return (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 ${
                    isFirstDataColumn
                      ? 'sticky left-20 z-19 bg-gray-50 border-r border-gray-200'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sort?.column === col.key && (
                      <span>{sort.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                );
              })}
              <th className="w-20 px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {showAddRow && (
              <tr className="bg-green-50">
                <td className="sticky left-0 z-10 px-3 py-2 bg-green-50 border-r border-green-200"></td>
                <td className="sticky left-10 z-10 px-3 py-2 text-sm text-gray-500 bg-green-50 border-r border-green-200">New</td>
                {dataset.columns.map((col, index) => {
                  const isFirstDataColumn = index === 0;
                  const isVisible = visibleColumns[col.key] ?? true;
                  if (!isVisible) return null;

                  return (
                  <td key={col.key} className={`px-4 py-2 ${
                    isFirstDataColumn
                      ? 'sticky left-20 z-10 bg-green-50 border-r border-green-200'
                      : ''
                  }`}>
                    {col.type === 'boolean' ? (
                      <select
                        aria-label={col.label}
                        value={String(newRowData[col.key] ?? '')}
                        onChange={(e) => setNewRowData(prev => ({ ...prev, [col.key]: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-green-300 rounded focus:ring-green-500 focus:border-green-500"
                      >
                        <option value="">(empty)</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    ) : (
                      <input
                        aria-label={col.label}
                        type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                        value={String(newRowData[col.key] ?? '')}
                        onChange={(e) => setNewRowData(prev => ({ ...prev, [col.key]: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-green-300 rounded focus:ring-green-500 focus:border-green-500"
                      />
                    )}
                  </td>
                  );
                })}
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      aria-label="Add a record"
                      onClick={handleAddRow}
                      className="p-1 text-green-600 hover:text-green-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      aria-label="Cancel adding a record"
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
            {pageRecords.map((record, index) => {
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
                <td className="sticky left-0 z-10 px-3 py-2 border-r border-gray-200 bg-inherit">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(record.id)}
                    onChange={(e) => handleSelectRow(record.id, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="sticky left-10 z-10 px-3 py-2 text-sm text-gray-500 border-r border-gray-200 bg-inherit">{pageStart + index + 1}</td>
                {dataset.columns.map((col, colIndex) => {
                  const isFirstDataColumn = colIndex === 0;
                  const isHighlightedField = isHighlighted && highlightField === col.key;
                  const isVisible = visibleColumns[col.key] ?? true;
                  if (!isVisible) return null;

                  const isEditing = editingCell?.recordId === record.id && editingCell?.column === col.key;
                  const unreadable = isUnreadableDate(record[col.key], col);

                  return (
                  <td
                    key={col.key}
                    className={`px-4 py-2 text-sm text-gray-900 ${isHighlightedField ? 'bg-amber-200' : ''} ${
                      isFirstDataColumn
                        ? 'sticky left-20 z-10 border-r border-gray-200 bg-inherit'
                        : ''
                    }`}
                    onDoubleClick={() => startEdit(record.id, col, record[col.key])}
                  >
                    {isEditing && editingCell.editor === 'boolean' ? (
                      <select
                        aria-label={`Edit ${col.label}`}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                        className="w-full min-w-[80px] px-2 py-1 text-sm text-gray-900 bg-white border border-blue-500 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                      >
                        <option value="">(empty)</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    ) : isEditing ? (
                      <input
                        aria-label={`Edit ${col.label}`}
                        type={editingCell.editor}
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
                      <span
                        className={`block truncate max-w-xs ${unreadable ? 'text-amber-700' : ''}`}
                        title={unreadable
                          ? `"${String(record[col.key])}" cannot be read as a date. Double-click to correct it.`
                          : String(record[col.key] ?? '')}
                      >
                        {formatCellValue(record[col.key], col, dateFormat)}
                      </span>
                    )}
                  </td>
                  );
                })}
                <td className="px-3 py-2">
                  <button
                    aria-label="Delete this record"
                    onClick={() => {
                      if (confirm('Delete this record?')) deleteRecords([record.id]);
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

      {/* Pager */}
      {processedRecords.length > PAGE_SIZES[0] && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-white border-t border-gray-200 text-sm text-gray-600">
          <span>
            Rows {(pageStart + 1).toLocaleString()}–{Math.min(pageStart + pageSize, processedRecords.length).toLocaleString()} of {processedRecords.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(0)}
              disabled={currentPage === 0}
              className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              First
            </button>
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 0}
              className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <span>Page {currentPage + 1} of {pageCount.toLocaleString()}</span>
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= pageCount - 1}
              className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
            <button
              onClick={() => setPage(pageCount - 1)}
              disabled={currentPage >= pageCount - 1}
              className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Last
            </button>
          </div>
          <label className="flex items-center gap-2">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                // Keep the first row on screen where it was.
                const size = Number(e.target.value);
                setPage(Math.floor(pageStart / size));
                setPageSize(size);
              }}
              className="px-2 py-1 border border-gray-300 rounded"
            >
              {PAGE_SIZES.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Record Editor Sidebar (shows the oldest queued edit first) */}
      {pendingEdits.length > 0 && (
        <RecordEditorSidebar
          isOpen={true}
          record={pendingEdits[0].record}
          columns={dataset.columns}
          recordIdentifier={pendingEdits[0].recordIdentifier}
          editedColumnKey={pendingEdits[0].columnKey}
          editedColumnLabel={pendingEdits[0].columnLabel}
          oldValue={pendingEdits[0].oldValue}
          newValue={pendingEdits[0].newValue}
          onSave={handleEditPromptSave}
          onSkip={handleEditPromptSkip}
        />
      )}
    </div>
  );
}

/** A value in a date column that is not a date: shown as written, and marked. */
function isUnreadableDate(value: unknown, column: DataColumn): boolean {
  if (column.type !== 'date' || value === null || value === undefined) return false;
  return String(value).trim() !== '' && parseStoredDate(value) === null;
}

function formatCellValue(value: unknown, column: DataColumn, dateFormat: DateFormat): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (column.type === 'date' && value) {
    // In the format chosen under Number & Date Format. A value that is not a
    // readable date is shown as stored, not as "Invalid Date" or, worse, as
    // whatever day the browser makes of it.
    return formatStoredDate(value, dateFormat);
  }

  return String(value);
}
