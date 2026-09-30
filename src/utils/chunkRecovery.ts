/**
 * Telling a stale lazy-loaded chunk apart from an ordinary runtime error.
 *
 * Modules are code-split under content-hashed filenames. A deploy replaces
 * those files, so a tab opened beforehand still holds the previous index.html
 * and asks for chunks that no longer exist. Panels already visited keep working
 * because their code is in memory; any not yet opened fail with a 404.
 *
 * The distinction matters in both directions. Retrying the same dead URL can
 * never succeed, so this failure needs a reload rather than a re-render. And an
 * ordinary bug must not trigger one, or it becomes an unexplained refresh and
 * the user never sees what went wrong.
 */

/** Messages browsers use when a dynamically imported module cannot be fetched. */
const STALE_CHUNK_PATTERN =
  /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export function isStaleChunkError(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return STALE_CHUNK_PATTERN.test(`${error.name ?? ''} ${error.message ?? ''}`);
}

/** Key guarding against a reload loop when the failure is not a stale deploy. */
export const RELOAD_GUARD_KEY = 'epikit_chunk_reload_attempted';

/**
 * Reload once to pick up the current index.html.
 *
 * @returns whether a reload was started, so callers can fall back to telling
 *          the user to reload themselves.
 */
export function reloadForStaleChunk(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  reload: () => void
): boolean {
  try {
    if (!storage) return false;
    if (storage.getItem(RELOAD_GUARD_KEY) === 'yes') return false;
    storage.setItem(RELOAD_GUARD_KEY, 'yes');
    reload();
    return true;
  } catch {
    // Private browsing can refuse sessionStorage; the caller shows a message.
    return false;
  }
}
