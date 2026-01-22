import React, { useState } from 'react';

interface AdvancedOptionsProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
}

/**
 * Collapsible wrapper for advanced/secondary controls
 * Keeps primary interface clean while allowing access to advanced features
 */
export function AdvancedOptions({ children, defaultOpen = false }: AdvancedOptionsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-gray-200 pt-4 mt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 transition-colors mb-3"
        aria-expanded={isOpen}
      >
        <span className="font-medium">Advanced Options</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}
