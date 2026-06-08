/**
 * useWorklogCategories — read-only fetch of the signed-in user's
 * WorkLogCategory rows.
 *
 * Sprint A (backend) introduced /api/work-logs/categories so users can
 * define their own taxonomy instead of the previous hard-coded list. This
 * hook surfaces those rows to every worklog UI that used to import the
 * static `CATEGORIES` constant.
 *
 * Cache key: ["worklog-categories"]. Mutations (POST/PATCH/DELETE) land in
 * Sprint C and will invalidate this key + ["worklogs"].
 *
 * Display ordering ── server already returns rows sorted by
 * (sortOrder ASC, name ASC). We do NOT splice the synthetic "Other" entry
 * here; callers decide whether/where to append it (the rail appends, dialog
 * Select dropdowns do not).
 */

"use client";

import { useQuery } from "@tanstack/react-query";

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

export function useWorklogCategories() {
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

  return {
    categoriesQuery: query,
    categories: query.data?.categories ?? [],
  };
}

/** Exported so Sprint C mutation hooks can invalidate the same key. */
export const WORKLOG_CATEGORIES_QUERY_KEY = QK;
