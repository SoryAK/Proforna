/**
 * useWorklogCategories — read + CRUD for the signed-in user's
 * WorkLogCategory rows.
 *
 * Sprint A added the backend; Sprint B wired the read path into every UI
 * surface that used to import the hard-coded `CATEGORIES` constant; Sprint C
 * (this revision) layers mutations on top so users can manage the taxonomy
 * from the rail/sidebar — same pattern as `useWorklogFolders`.
 *
 * Cache keys:
 *   - ["worklog-categories"] (this hook)
 *   - ["worklogs"]            (invalidated on rename/delete because the
 *                              server bulk-rewrites WorkLog.category strings)
 *
 * Display ordering — server already returns rows sorted by
 * (sortOrder ASC, name ASC). We do NOT splice the synthetic "Other" entry
 * here; callers decide whether/where to append it (the rail appends, dialog
 * Select dropdowns do not).
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface WorkLogCategoryRow {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface CategoryListResponse {
  categories: WorkLogCategoryRow[];
}

const QK = ["worklog-categories"] as const;
const WORKLOGS_QK = ["worklogs"] as const;

export function useWorklogCategories() {
  const qc = useQueryClient();

  const query = useQuery<CategoryListResponse>({
    queryKey: QK,
    queryFn: async () => {
      const res = await fetch("/api/work-logs/categories");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    // Same cache window as folders — these change rarely, no need to refetch
    // on every focus.
    staleTime: 30_000,
  });

  // ── Mutations ────────────────────────────────────────────────────────
  // The server endpoints already enforce validation, reserved-name guards,
  // and case-insensitive duplicate detection (see
  // /api/work-logs/categories and /api/work-logs/categories/[id]). On error
  // they return the human-readable message in `body.error`; we surface it
  // by throwing that string so the caller can show it directly.
  const parseErrorBody = async (res: Response): Promise<string> => {
    try {
      const body = (await res.json()) as { error?: string };
      return body?.error ?? `Request failed (${res.status})`;
    } catch {
      return `Request failed (${res.status})`;
    }
  };

  const createCategory = useMutation({
    mutationFn: async (input: { name: string }) => {
      const res = await fetch("/api/work-logs/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name }),
      });
      if (!res.ok) throw new Error(await parseErrorBody(res));
      return res.json() as Promise<WorkLogCategoryRow>;
    },
    // Create doesn't rewrite any notes — only the category list changes.
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const updateCategory = useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const res = await fetch(`/api/work-logs/categories/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name }),
      });
      if (!res.ok) throw new Error(await parseErrorBody(res));
      return res.json() as Promise<WorkLogCategoryRow>;
    },
    // Server runs a $transaction that bulk-rewrites WorkLog.category strings
    // when the canonical name actually changes — invalidate notes too so any
    // rendered category chip refreshes.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: WORKLOGS_QK });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (input: { id: string }) => {
      const res = await fetch(`/api/work-logs/categories/${input.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await parseErrorBody(res));
      return res.json() as Promise<{ ok: true; rewroteNotes: number }>;
    },
    // Server bulk-moves the deleted category's notes to "other" — same
    // invalidation as rename.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: WORKLOGS_QK });
    },
  });

  return {
    categoriesQuery: query,
    categories: query.data?.categories ?? [],
    createCategory,
    updateCategory,
    deleteCategory,
  };
}

/** Exported so other modules can target the same cache key for invalidation. */
export const WORKLOG_CATEGORIES_QUERY_KEY = QK;
