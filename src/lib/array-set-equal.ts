/**
 * Set-equality check for two string arrays.
 *
 * Used by the WorkLog PUT route's skip-if-equal guard (ADR-0016) so a save
 * with no changes to denormalized arrays (`assetIds`, `linkedNoteIds`) omits
 * those columns from `update.data` — avoiding unnecessary GIN index churn on
 * autosave (~3s debounce per ADR-0009).
 */
export function arraysEqualAsSets(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) {
    if (!sb.has(v)) return false;
  }
  return true;
}
