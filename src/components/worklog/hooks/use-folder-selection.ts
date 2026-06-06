/**
 * useFolderSelection — URL-backed folder selection for the worklog shell.
 *
 * ADR-0013: the canonical state lives in the URL search params:
 *   • `?folder=all`              → { kind: "all" } (also: missing param)
 *   • `?folder=notable`          → { kind: "notable" }
 *   • `?folder=unfiled`          → { kind: "unfiled" }
 *   • `?folder=category:<key>`   → { kind: "category", category }
 *   • `?folder=<cuid>`           → { kind: "folder", folderId }
 *   • `?view=templates`          → { kind: "templates" } (overrides folder)
 *
 * Writes use `router.push` so browser back/forward navigates between folder
 * views — the explicit promise of ADR-0013.
 *
 * Compact mode (`<WorklogPage compact />` dashboard embed) does NOT participate
 * in URL state — the embed lives on someone else's page and would pollute its
 * query string. Pass `{ enabled: false }` to fall back to local state with the
 * same `[selection, setSelection]` shape.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FolderSelection } from "@/types/worklog";

const FOLDER_PARAM = "folder";
const VIEW_PARAM = "view";
const CATEGORY_PREFIX = "category:";

function paramsToSelection(params: URLSearchParams): FolderSelection {
  if (params.get(VIEW_PARAM) === "templates") {
    return { kind: "templates" };
  }
  const folder = params.get(FOLDER_PARAM);
  if (!folder || folder === "all") return { kind: "all" };
  if (folder === "notable") return { kind: "notable" };
  if (folder === "unfiled") return { kind: "unfiled" };
  if (folder.startsWith(CATEGORY_PREFIX)) {
    const category = folder.slice(CATEGORY_PREFIX.length);
    return category ? { kind: "category", category } : { kind: "all" };
  }
  // Fallback: treat as a user-folder id (cuid).
  return { kind: "folder", folderId: folder };
}

function selectionToParams(selection: FolderSelection): { folder?: string; view?: string } {
  switch (selection.kind) {
    case "all":
      return {};
    case "notable":
      return { folder: "notable" };
    case "unfiled":
      return { folder: "unfiled" };
    case "category":
      return { folder: `${CATEGORY_PREFIX}${selection.category}` };
    case "folder":
      return { folder: selection.folderId };
    case "templates":
      return { view: "templates" };
  }
}

/**
 * Build the query-string portion (no leading `?`) for a target FolderSelection.
 * Useful when navigating cross-route (e.g. from the worklog home to
 * `/worklog/notes`) — the URL hook's setter is tied to the current pathname,
 * but the encoding rules are the same and worth sharing.
 */
export function selectionToQueryString(selection: FolderSelection): string {
  const params = new URLSearchParams();
  const patch = selectionToParams(selection);
  if (patch.folder) params.set(FOLDER_PARAM, patch.folder);
  if (patch.view) params.set(VIEW_PARAM, patch.view);
  return params.toString();
}

export interface UseFolderSelectionOptions {
  /** Default true. Pass `false` from `<WorklogPage compact />` to use local state instead of URL. */
  enabled?: boolean;
}

export function useFolderSelection(
  opts: UseFolderSelectionOptions = {},
): [FolderSelection, (next: FolderSelection) => void] {
  const enabled = opts.enabled !== false;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Always-mounted local fallback so `compact` (URL-disabled) callers get the
  // same hook signature without breaking the rules of hooks.
  const [local, setLocal] = useState<FolderSelection>({ kind: "all" });

  const urlSelection = useMemo<FolderSelection | null>(() => {
    if (!enabled) return null;
    return paramsToSelection(new URLSearchParams(searchParams.toString()));
  }, [enabled, searchParams]);

  const setSelection = useCallback(
    (next: FolderSelection) => {
      if (!enabled) {
        setLocal(next);
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      params.delete(FOLDER_PARAM);
      params.delete(VIEW_PARAM);
      const patch = selectionToParams(next);
      if (patch.folder) params.set(FOLDER_PARAM, patch.folder);
      if (patch.view) params.set(VIEW_PARAM, patch.view);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [enabled, pathname, router, searchParams],
  );

  return [enabled ? urlSelection ?? local : local, setSelection];
}
