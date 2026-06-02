/**
 * useWorklogSelection — multi-select state for the worklog notes list (W1.3).
 *
 * Owns:
 *   • The Set of selected note ids.
 *   • An "anchor" id for Shift+click range selection (Gmail/Notion style).
 *
 * Why a Set + anchor (vs an array): O(1) `has` lookups when 200+ rows
 * render the checkbox column, and the anchor must survive Ctrl+click
 * gaps (Shift+click ALWAYS expands from the anchor, never from the
 * last-toggled id).
 *
 * The hook is purely client state — no network. Mutations live in
 * use-worklog-mutations (bulkAction).
 */

import { useCallback, useMemo, useRef, useState } from "react";

export interface UseWorklogSelectionApi {
  /** Set-backed; use `.has(id)` for O(1) membership. */
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;

  /** Toggle one id. Resets the anchor to this id. */
  toggle: (id: string) => void;
  /**
   * Shift+click handler. Selects every id between anchor (inclusive) and
   * `id` (inclusive) in `orderedIds`. If no anchor, behaves like `toggle`.
   */
  toggleRange: (id: string, orderedIds: string[]) => void;
  /** Set selection to exactly these ids (used by Ctrl+A). */
  setSelection: (ids: string[]) => void;
  /** Clear all + anchor. */
  clear: () => void;
}

export function useWorklogSelection(): UseWorklogSelectionApi {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const anchorRef = useRef<string | null>(null);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorRef.current = id;
  }, []);

  const toggleRange = useCallback(
    (id: string, orderedIds: string[]) => {
      const anchor = anchorRef.current;
      if (!anchor || anchor === id) {
        // No anchor → behave like a normal toggle and set the anchor.
        toggle(id);
        return;
      }
      const anchorIdx = orderedIds.indexOf(anchor);
      const targetIdx = orderedIds.indexOf(id);
      if (anchorIdx < 0 || targetIdx < 0) {
        toggle(id);
        return;
      }
      const [lo, hi] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(orderedIds[i]);
        return next;
      });
      // Anchor is intentionally NOT updated — repeated Shift+click expands
      // from the same origin, matching Gmail/Finder behavior.
    },
    [toggle],
  );

  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
    anchorRef.current = ids[ids.length - 1] ?? null;
  }, []);

  const clear = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
    anchorRef.current = null;
  }, []);

  return useMemo(
    () => ({
      selectedIds,
      selectedCount: selectedIds.size,
      isSelected,
      toggle,
      toggleRange,
      setSelection,
      clear,
    }),
    [selectedIds, isSelected, toggle, toggleRange, setSelection, clear],
  );
}
