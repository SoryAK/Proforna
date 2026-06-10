/**
 * useReaderRailState — owns the worklog reader right-rail UI state
 * (active tab + collapsed flag).
 *
 * Reads from the shared `["worklog-preferences"]` query cache (populated by
 * `useWorklogPreferences`) so we never double-fetch. Writes go to the
 * dedicated POST /api/work-logs/preferences/reader-rail with partial-update
 * semantics; updates are optimistic — the cache flips immediately and rolls
 * back on error with a toast.
 *
 * Scope: ADR-0023 / Unit 2. Read-side only stays valid even if the rail's
 * host component renders before the preferences query has resolved (returns
 * safe defaults).
 */

"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { WorklogPreferences } from "@/types/worklog";
import { DEFAULT_RAIL_TAB, isRailTabId, type RailTabId } from "./rail-tabs";

const PREFERENCES_KEY = ["worklog-preferences"] as const;

interface SavePayload {
  tab?: RailTabId;
  collapsed?: boolean;
}

interface SaveResponse {
  tab: RailTabId;
  collapsed: boolean;
}

export interface ReaderRailState {
  /** Currently active tab. Falls back to "backlinks" when preferences haven't loaded. */
  tab: RailTabId;
  /** Whether the 320px content panel is hidden (icon strip remains). */
  collapsed: boolean;
  /** Optimistic tab switcher. */
  setTab: (next: RailTabId) => void;
  /** Optimistic collapse toggle. */
  toggleCollapsed: () => void;
  /** Optimistic explicit setter (used by Esc / restore flows). */
  setCollapsed: (next: boolean) => void;
}

export function useReaderRailState(): ReaderRailState {
  const queryClient = useQueryClient();

  // Subscribe to the shared preferences cache. Using useQuery (not
  // queryClient.getQueryData) is critical — getQueryData is a one-shot
  // snapshot that does NOT re-render on cache updates, so optimistic
  // setQueryData writes from the mutation below would not flip the UI.
  // TanStack Query v5 dedupes by queryKey, so this shares its in-flight
  // request and cached data with useWorklogPreferences.
  const { data: prefs } = useQuery<WorklogPreferences>({
    queryKey: PREFERENCES_KEY,
    queryFn: async () => {
      const r = await fetch("/api/work-logs/preferences");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 60_000,
  });

  const tab: RailTabId = isRailTabId(prefs?.readerRailTab)
    ? prefs!.readerRailTab
    : DEFAULT_RAIL_TAB;
  const collapsed = prefs?.readerRailCollapsed === true;

  const mutation = useMutation<SaveResponse, Error, SavePayload, { previous?: WorklogPreferences }>({
    mutationFn: async (payload) => {
      const r = await fetch("/api/work-logs/preferences/reader-rail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<SaveResponse>;
    },
    onMutate: async (payload) => {
      // Cancel any in-flight preferences refetch so it can't clobber the optimistic write.
      await queryClient.cancelQueries({ queryKey: PREFERENCES_KEY });
      const previous = queryClient.getQueryData<WorklogPreferences>(PREFERENCES_KEY);
      if (previous) {
        queryClient.setQueryData<WorklogPreferences>(PREFERENCES_KEY, {
          ...previous,
          ...(payload.tab !== undefined ? { readerRailTab: payload.tab } : {}),
          ...(payload.collapsed !== undefined ? { readerRailCollapsed: payload.collapsed } : {}),
        });
      }
      return { previous };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(PREFERENCES_KEY, ctx.previous);
      }
      toast.error("Could not save rail state");
    },
    onSuccess: (saved) => {
      const current = queryClient.getQueryData<WorklogPreferences>(PREFERENCES_KEY);
      if (current) {
        queryClient.setQueryData<WorklogPreferences>(PREFERENCES_KEY, {
          ...current,
          readerRailTab: saved.tab,
          readerRailCollapsed: saved.collapsed,
        });
      }
    },
  });

  const setTab = useCallback(
    (next: RailTabId) => {
      if (next === tab) return;
      mutation.mutate({ tab: next });
    },
    [mutation, tab],
  );

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (next === collapsed) return;
      mutation.mutate({ collapsed: next });
    },
    [mutation, collapsed],
  );

  const toggleCollapsed = useCallback(() => {
    mutation.mutate({ collapsed: !collapsed });
  }, [mutation, collapsed]);

  return { tab, collapsed, setTab, toggleCollapsed, setCollapsed };
}
