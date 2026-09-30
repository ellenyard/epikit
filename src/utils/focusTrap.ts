/**
 * Keyboard containment for dialogs.
 *
 * None of the app's dialogs announced themselves, kept focus, or closed on
 * Escape. Opening one left focus on the trigger behind it, so Tab walked
 * through the page underneath the backdrop: a keyboard user could reach and
 * operate controls they could not see, and had no way to dismiss the dialog.
 * That included the confirmation before deleting a dataset.
 *
 * The cycling decision is separated from the DOM here so it can be tested.
 */

/** Selector for things a user can tab to, excluding those taken out of order. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Where Tab should land next, given the focusable elements of a dialog and the
 * index currently focused. Returns null when the browser's own behaviour is
 * already correct, so the caller leaves the event alone.
 *
 * Only the two ends need intervention: Tab on the last element and Shift+Tab
 * on the first are what escape the dialog.
 */
export function nextFocusIndex(
  count: number,
  currentIndex: number,
  shiftKey: boolean
): number | null {
  if (count === 0) return null;
  // Focus is somewhere outside the dialog, so pull it back to an end.
  if (currentIndex < 0) return shiftKey ? count - 1 : 0;
  if (!shiftKey && currentIndex === count - 1) return 0;
  if (shiftKey && currentIndex === 0) return count - 1;
  return null;
}
