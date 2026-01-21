import { useState } from 'react';
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
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center gap-1 px-2 py-3 text-sm font-medium rounded-l-lg shadow-lg transition-all ${
          isOpen
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-700 border border-r-0 border-gray-200 hover:bg-gray-50'
        }`}
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        <span className="rotate-180">Edit Log</span>
        {entries.length > 0 && (
          <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs font-bold rounded-full ${
            isOpen ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
          }`}>
            {entries.length}
          </span>
        )}
      </button>

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full bg-white border-l border-gray-200 shadow-xl transition-transform duration-300 z-20 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: '380px' }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Edit Log</h3>
              <p className="text-sm text-gray-500">{entries.length} changes recorded</p>
            </div>
            <button
              onClick={onToggle}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
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
          </div>

          {/* Footer */}
          {entries.length > 0 && (
            <div className="p-4 border-t border-gray-200 bg-gray-50">
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
          )}
        </div>
      </div>

      {/* Backdrop when open on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-25 z-10 lg:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
}
