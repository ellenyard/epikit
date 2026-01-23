import { useState } from 'react';
import { ContextualSidebar } from '../shared/ContextualSidebar';
import type { CaseRecord, DataColumn } from '../../types/analysis';

interface RecordEditorSidebarProps {
  isOpen: boolean;
  record: CaseRecord | null;
  columns: DataColumn[];
  recordIdentifier: string;
  editedColumnKey: string;
  editedColumnLabel: string;
  oldValue: unknown;
  newValue: unknown;
  onSave: (reason: string, initials: string) => void;
  onSkip: () => void;
}

export function RecordEditorSidebar({
  isOpen,
  record,
  columns,
  recordIdentifier,
  editedColumnKey,
  editedColumnLabel,
  oldValue,
  newValue,
  onSave,
  onSkip,
}: RecordEditorSidebarProps) {
  const [reason, setReason] = useState('');
  const [initials, setInitials] = useState('');

  const handleSave = () => {
    onSave(reason, initials);
    setReason('');
    setInitials('');
  };

  const handleSkip = () => {
    onSkip();
    setReason('');
    setInitials('');
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '(empty)';
    return String(value);
  };

  return (
    <ContextualSidebar
      isOpen={isOpen}
      onClose={handleSkip}
      title={`Edit Record ${recordIdentifier}`}
      subtitle={`Editing: ${editedColumnLabel}`}
      width={450}
      minWidth={380}
      maxWidth={600}
      resizable={true}
      position="right"
      zIndex={30}
      footer={
        <div className="flex justify-end gap-2 p-4">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {/* Change Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <h4 className="text-sm font-semibold text-blue-900">Current Edit</h4>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-blue-700 font-medium">Field:</span>
              <span className="text-blue-900 font-semibold">{editedColumnLabel}</span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-blue-200 pt-2">
              <span className="text-blue-700 font-medium">Change:</span>
              <div className="flex items-center gap-2">
                <span className="text-red-600 line-through font-medium">{formatValue(oldValue)}</span>
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="text-green-600 font-semibold">{formatValue(newValue)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Full Record Context */}
        {record && (
          <div className="border border-gray-200 rounded-lg">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900">Full Record</h4>
              <p className="text-xs text-gray-500 mt-0.5">All fields for this record</p>
            </div>
            <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {columns.map((col) => {
                const isEditedField = col.key === editedColumnKey;
                const value = record[col.key];

                return (
                  <div
                    key={col.key}
                    className={`px-4 py-2 flex justify-between items-start text-sm ${
                      isEditedField ? 'bg-amber-50 border-l-4 border-amber-400' : ''
                    }`}
                  >
                    <span className={`font-medium ${isEditedField ? 'text-amber-900' : 'text-gray-600'}`}>
                      {col.label}:
                    </span>
                    <span className={`ml-2 text-right break-words max-w-60 ${
                      isEditedField ? 'text-amber-900 font-semibold' : 'text-gray-900'
                    }`}>
                      {isEditedField ? formatValue(newValue) : formatValue(value)}
                      {isEditedField && (
                        <span className="ml-1 text-xs text-amber-600">(edited)</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Edit Metadata Form */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-4 bg-white">
          <div>
            <label htmlFor="edit-reason" className="block text-sm font-medium text-gray-700 mb-1.5">
              Reason for change
              <span className="ml-1 text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Typo correction, Verified with patient, Data entry error..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
            />
          </div>

          <div>
            <label htmlFor="edit-initials" className="block text-sm font-medium text-gray-700 mb-1.5">
              Your initials
              <span className="ml-1 text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="edit-initials"
              type="text"
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase())}
              placeholder="e.g., JD"
              maxLength={5}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Help Text */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex gap-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-gray-600">
              Document your changes to maintain a clear audit trail. You can add or edit the reason and initials later from the Edit Log.
            </p>
          </div>
        </div>
      </div>
    </ContextualSidebar>
  );
}
