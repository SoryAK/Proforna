"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import type { ContextSlice } from "@/lib/ai-chat-constants";
import type { AmbientEntityRef, PageContext } from "@/lib/ai-chat-action-target";
import { parsePathnameForAmbient } from "@/lib/ai-chat-pathname";

export interface UseAiChatContextResult {
  contextSlices: ContextSlice[];
  setContextSlices: React.Dispatch<React.SetStateAction<ContextSlice[]>>;
  suppressedSliceIds: Set<string>;
  setSuppressedSliceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  pageContext: PageContext;
  toggleSlice: (id: string) => void;
  visibleSliceCount: number;
}

/**
 * Owns the AI chat's career-context surface (ADR-0046):
 *   - `contextSlices`  — array of removable system-prompt slices the user
 *                        can toggle in/out per turn.
 *   - `suppressedSliceIds` — slice ids the user has hidden via the chip UI.
 *   - `pageContext` — ambient page/job/worklog refs surfaced by
 *                     /api/ai/context, consumed by the code-block toolbar
 *                     resolver as step (1) of target precedence.
 *
 * The hook fetches /api/ai/context whenever the chat panel opens AND any
 * time the URL pathname changes while open. The pathname is parsed by
 * `parsePathnameForAmbient` into `{ activeWorklogId?, activeJobId? }` and
 * sent as query params; the server uses them to override the recency
 * heuristic with a userId-scoped lookup of the exact entity on screen
 * (ADR-0046 follow-up D). Legacy `systemPrompt` is collapsed into a
 * single non-removable slice for backwards compatibility.
 *
 * Setters for `contextSlices` and `suppressedSliceIds` are exposed so the
 * caller can reset them on "clear conversation". `setPageContext` is kept
 * internal because no caller currently mutates page context.
 *
 * Extracted in Phase 4 of the god-file refactor; URL-aware in follow-up D.
 */
export function useAiChatContext(open: boolean): UseAiChatContextResult {
  const [contextSlices, setContextSlices] = useState<ContextSlice[]>([]);
  const [suppressedSliceIds, setSuppressedSliceIds] = useState<Set<string>>(new Set());
  const [pageContext, setPageContext] = useState<PageContext>({});

  // URL-aware ambient hints (ADR-0046 follow-up D). `usePathname` returns
  // null on the first render under app-router; treat that as "no pathname
  // signal" and rely on the server heuristic until the client routes in.
  const pathname = usePathname();
  const pathnameAmbient = useMemo(
    () => parsePathnameForAmbient(pathname ?? ""),
    [pathname],
  );

  // Fetch career context slices (ADR-0046 Phase A). The legacy `systemPrompt`
  // field is read as a fallback so the panel still works against a server
  // that hasn't been redeployed with the slice shape yet. Phase D.3 also
  // captures the `ambient` field for the code-block action resolver, and
  // follow-up D sends the pathname-derived ids so ambient tracks the URL
  // (not just a 24h-recency heuristic) and refetches on every navigation
  // while the panel is open.
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams();
    if (pathnameAmbient.activeWorklogId) {
      params.set("activeWorklogId", pathnameAmbient.activeWorklogId);
    }
    if (pathnameAmbient.activeJobId) {
      params.set("activeJobId", pathnameAmbient.activeJobId);
    }
    const qs = params.toString();
    const url = qs ? `/api/ai/context?${qs}` : "/api/ai/context";
    fetch(url)
      .then((r) => r.json())
      .then(
        (d: {
          slices?: ContextSlice[];
          systemPrompt?: string;
          ambient?: {
            activeJob?: AmbientEntityRef | null;
            activeWorklog?: AmbientEntityRef | null;
            activeSkill?: AmbientEntityRef | null;
          };
        }) => {
          if (Array.isArray(d.slices) && d.slices.length > 0) {
            setContextSlices(d.slices);
          } else if (d.systemPrompt) {
            // Legacy shape: collapse the whole prompt into a single non-removable slice.
            setContextSlices([{ id: "base", label: "Career context", prompt: d.systemPrompt, removable: false }]);
          }
          if (d.ambient) {
            setPageContext({
              activeJob: d.ambient.activeJob ?? null,
              activeWorklog: d.ambient.activeWorklog ?? null,
              activeSkill: d.ambient.activeSkill ?? null,
            });
          }
        },
      )
      .catch(() => {});
  }, [open, pathnameAmbient.activeWorklogId, pathnameAmbient.activeJobId]);

  const toggleSlice = useCallback((id: string) => {
    setSuppressedSliceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Visible (non-suppressed) slice count drives the toolbar `[+ N]` badge.
  // Sum, not difference of `length - size`, because `suppressedSliceIds` may
  // hold ids that are no longer in `contextSlices` (stale across nav).
  const visibleSliceCount = contextSlices.reduce(
    (n, s) => (suppressedSliceIds.has(s.id) ? n : n + 1),
    0,
  );

  return {
    contextSlices,
    setContextSlices,
    suppressedSliceIds,
    setSuppressedSliceIds,
    pageContext,
    toggleSlice,
    visibleSliceCount,
  };
}
