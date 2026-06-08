/**
 * Pure helpers + constants for the user-defined WorkLog category taxonomy.
 *
 * Stays a pure module (no React, no Prisma, no fetch) so both API routes and
 * client hooks can import the same validation rules. Routes live at
 * /api/work-logs/categories[/[id]].
 *
 * Category names are stored in `WorkLogCategory.name` and ALSO mirrored
 * verbatim into `WorkLog.category` (free-form string, no FK). The reserved
 * fallback "other" is never stored as a category row; deleting a category
 * bulk-rewrites its notes' `category` to WORKLOG_CATEGORY_FALLBACK.
 */

/** Max length of a category display name. Enforced server-side. */
export const WORKLOG_CATEGORY_NAME_MAX = 40;

/**
 * Reserved category name(s) — the user is forbidden from creating one of these
 * and they will never appear as rows in the WorkLogCategory table.
 * Comparison is case-insensitive + trimmed.
 */
export const WORKLOG_CATEGORY_RESERVED = ["other"] as const;

/**
 * The permanent fallback bucket. Notes whose category is removed are
 * rewritten to this value (and the sidebar always renders an "Other" row at
 * the end of the categories list).
 */
export const WORKLOG_CATEGORY_FALLBACK = "other" as const;

/**
 * Categories every user starts with on first load. Picked to match the
 * three most-common values from the previous hard-coded CATEGORIES list.
 */
export const WORKLOG_CATEGORY_SEEDS: readonly string[] = [
  "task",
  "project",
  "meeting",
] as const;

/** Case-insensitive + trimmed check against WORKLOG_CATEGORY_RESERVED. */
export function isReservedCategoryName(name: string): boolean {
  const norm = name.trim().toLowerCase();
  if (!norm) return false;
  return (WORKLOG_CATEGORY_RESERVED as readonly string[]).includes(norm);
}

/**
 * Returns null when the name is valid, otherwise a human-readable error
 * message suitable for surfacing in a 400 JSON response.
 */
export function validateWorklogCategoryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Category name is required";
  if (trimmed.length > WORKLOG_CATEGORY_NAME_MAX) {
    return `Category name must be ${WORKLOG_CATEGORY_NAME_MAX} characters or fewer`;
  }
  if (isReservedCategoryName(trimmed)) {
    return `"${trimmed}" is a reserved category name`;
  }
  return null;
}
