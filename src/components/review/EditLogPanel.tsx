import { useState } from 'react';
import { ContextualSidebar } from '../shared/ContextualSidebar';
import type { EditLogEntry } from '../../types/analysis';

interface EditLogPanelProps {
  entries: EditLogEntry[];
  isOpen: boolean;
  onToggle: () => void;
  onUpdateEntry: (id: string, updates: Partial<EditLogEntry>) => void;
  onExport: () => void;
}

export function EditLogPanel({
  entries,
  isOpen,
  onToggle,
  onUpdateEntry,
  onExport,
}: EditLogPanelProps) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'reason' | 'initials' } | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (id: string, field: 'reason' | 'initials', currentValue: string) => {
    setEditingCell({ id, field });
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (!editingCell) return;
    onUpdateEntry(editingCell.id, { [editingCell.field]: editValue });
    setEditingCell(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '-';
    return String(value);
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <ContextualSidebar
      isOpen={isOpen}
      onClose={onToggle}
      title="Edit Log"
      subtitle={`${entries.length} changes recorded`}
      width={380}
      minWidth={280}
      maxWidth={600}
      resizable={true}
      position="right"
      footer={
        entries.length > 0 ? (
          <div className="p-4">
            <button
              onClick={onExport}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Log
            </button>
          </div>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-center">No edits recorded yet</p>
          <p className="text-xs text-center mt-1">Changes will appear here as you edit data</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {[...entries].reverse().map((entry) => (
            <div key={entry.id} className="p-3 hover:bg-gray-50">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {entry.recordIdentifier}
                  </span>
                  <span className="mx-1.5 text-gray-300">&bull;</span>
                  <span className="text-sm text-gray-600">{entry.columnLabel}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>

              <div className="flex items-center text-sm mb-2">
                <span className="text-red-600 line-through truncate max-w-24" title={formatValue(entry.oldValue)}>
                  {formatValue(entry.oldValue)}
                </span>
                <span className="mx-2 text-gray-400">&rarr;</span>
                <span className="text-green-600 truncate max-w-24" title={formatValue(entry.newValue)}>
                  {formatValue(entry.newValue)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {editingCell?.id === entry.id && editingCell.field === 'reason' ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    placeholder="Add reason..."
                    className="flex-1 px-2 py-1 border border-blue-300 rounded text-xs focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(entry.id, 'reason', entry.reason)}
                    className={`flex-1 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 ${
                      entry.reason ? 'text-gray-600' : 'text-gray-400 italic'
                    }`}
                    title="Click to edit reason"
                  >
                    {entry.reason || 'Add reason...'}
                  </span>
                )}

                {editingCell?.id === entry.id && editingCell.field === 'initials' ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                    onBlur={saveEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    maxLength={5}
                    className="w-12 px-2 py-1 border border-blue-300 rounded text-xs uppercase text-center focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(entry.id, 'initials', entry.initials)}
                    className={`w-12 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 text-center ${
                      entry.initials ? 'text-gray-600 font-medium' : 'text-gray-400'
                    }`}
                    title="Click to edit initials"
                  >
                    {entry.initials || '—'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ContextualSidebar>
  );
}
