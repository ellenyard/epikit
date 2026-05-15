import type { ReactNode } from 'react';

interface ExportAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
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
