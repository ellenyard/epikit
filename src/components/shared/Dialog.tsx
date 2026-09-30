import type { ReactNode } from 'react';
import { useDialog } from '../../hooks/useDialog';

interface DialogProps {
  /** Escape, and a click on the backdrop, call this. */
  onClose: () => void;
  /** Id of the heading that names the dialog. */
  labelledBy?: string;
  /** Classes for the panel; the overlay is fixed. */
  className?: string;
  children: ReactNode;
}

/**
 * A dialog that behaves like one: it announces itself, holds the keyboard
 * inside it, closes on Escape, and returns focus to whatever opened it.
 *
 * Rendered conditionally by the caller so that mounting and unmounting, and
 * therefore capturing and restoring focus, line up with the dialog opening and
 * closing.
 */
export function Dialog({ onClose, labelledBy, className = '', children }: DialogProps) {
  const { panelRef, dialogProps } = useDialog({ onClose, labelledBy, isOpen: true });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      // A click on the backdrop itself, not on the panel above it, dismisses.
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        {...dialogProps}
        className={`bg-white rounded-lg shadow-xl w-full ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
