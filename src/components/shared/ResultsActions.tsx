import React from 'react';

interface ExportAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

interface ResultsActionsProps {
  actions: ExportAction[];
  className?: string;
}

/**
 * Standard results action bar for export/download functionality
 * Appears near results (footer of charts/tables) with consistent styling
 */
export function ResultsActions({ actions, className = '' }: ResultsActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200 ${className}`}>
      {actions.map((action, index) => {
        const isPrimary = action.variant === 'primary' || (index === 0 && !action.variant);

        return (
          <button
            key={index}
            onClick={action.onClick}
            disabled={action.disabled}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${isPrimary
                ? 'bg-gray-700 text-white hover:bg-gray-800 disabled:bg-gray-300'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100'
              }
            `}
          >
            {action.icon && <span className="w-4 h-4">{action.icon}</span>}
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

// Common export icons
export const ExportIcons = {
  download: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  csv: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  image: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};
