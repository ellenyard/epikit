import { useState } from 'react';

interface EditPromptModalProps {
  recordIdentifier: string;
  columnLabel: string;
  oldValue: unknown;
  newValue: unknown;
  onSave: (reason: string, initials: string) => void;
  onSkip: () => void;
}

export function EditPromptModal({
  recordIdentifier,
  columnLabel,
  oldValue,
  newValue,
  onSave,
  onSkip,
}: EditPromptModalProps) {
  const [reason, setReason] = useState('');
  const [initials, setInitials] = useState('');

  const handleSave = () => {
    onSave(reason, initials);
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '(empty)';
    return String(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Document Edit</h3>
          <p className="text-sm text-gray-500 mt-1">
            Record the reason for this change (optional)
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Record:</span>
              <span className="font-medium text-gray-900">{recordIdentifier}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Variable:</span>
              <span className="font-medium text-gray-900">{columnLabel}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Change:</span>
              <span className="font-medium">
                <span className="text-red-600 line-through">{formatValue(oldValue)}</span>
                <span className="mx-2 text-gray-400">&rarr;</span>
                <span className="text-green-600">{formatValue(newValue)}</span>
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason for change
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Typo correction, Verified with patient, Data entry error..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
              rows={2}
            />
          </div>

          <div>
            <label htmlFor="initials" className="block text-sm font-medium text-gray-700 mb-1">
              Your initials
            </label>
            <input
              id="initials"
              type="text"
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase())}
              placeholder=""
              maxLength={5}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onSkip}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
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
      </div>
    </div>
  );
}
