/**
 * Dialog behaviour: announce it, keep focus inside it, close on Escape, and
 * put focus back where it was. See utils/focusTrap.ts for why.
 */
import { useCallback, useEffect, useRef } from 'react';
import { FOCUSABLE_SELECTOR, nextFocusIndex } from '../utils/focusTrap';

interface UseDialogOptions {
  /** Called for Escape and, if the caller wires it, a backdrop click. */
  onClose?: () => void;
  /** Id of the element naming the dialog, usually its heading. */
  labelledBy?: string;
  /**
   * Whether the dialog is showing. Several modals stay mounted and return null
   * while closed, so focus must be captured when this becomes true rather than
   * when the component mounts.
   */
  isOpen?: boolean;
}

export function useDialog({ onClose, labelledBy, isOpen = true }: UseDialogOptions = {}) {
  const panelRef = useRef<HTMLDivElement>(null);

  const focusable = useCallback(
    () => Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
    ).filter(el => el.offsetParent !== null || el === document.activeElement),
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Move focus in, preferring the first control so the dialog is immediately
    // operable; fall back to the panel itself when it holds only text.
    const first = focusable()[0];
    if (first) first.focus();
    else panel?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const target = nextFocusIndex(
        elements.length,
        elements.indexOf(document.activeElement as HTMLElement),
        event.shiftKey
      );
      if (target === null) return;
      event.preventDefault();
      elements[target]?.focus();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // Returning focus matters as much as trapping it: without this the next
      // Tab starts from the top of the document rather than the control that
      // opened the dialog.
      previouslyFocused?.focus?.();
    };
  }, [onClose, focusable, isOpen]);

  return {
    panelRef,
    dialogProps: {
      role: 'dialog' as const,
      'aria-modal': true,
      ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
      tabIndex: -1,
    },
  };
}
