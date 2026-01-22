import React from 'react';

interface TabHeaderProps {
  title: string;
  description: string;
  rightSlot?: React.ReactNode;
}

/**
 * Standard header component for all tool tabs
 * Provides consistent title + description layout
 */
export function TabHeader({ title, description, rightSlot }: TabHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      {rightSlot && (
        <div className="ml-4 flex-shrink-0">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
