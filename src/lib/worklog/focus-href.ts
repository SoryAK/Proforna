/**
 * Build the correct href to focus a worklog note from any surface in the app.
 *
 * Two contracts coexist (per ADR-0015 + ADR-0016):
 *
 * - On the **list view** (`/worklog/notes`) the focused note is read from
 *   the `?focus=<id>` query param and surfaced via the preview drawer.
 * - On the **dedicated reader** (`/worklog/notes/<id>`) the focused note IS
 *   the current path param — `?focus=` is ignored. To pivot from one note
 *   to another while staying in dedicated-reader mode we must swap the path
 *   segment, not append a query param.
 *
 * Anywhere else (the worklog home, dashboard, etc.) we fall back to the
 * list view with `?focus=` so the click always lands somewhere sensible.
 */

const LIST_PATH = "/worklog/notes";

export function buildWorklogFocusHref(
  pathname: string,
  entityId: string,
): string {
  // Strip a single trailing slash to make /a/b/ and /a/b match the same shape.
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (normalized.startsWith(`${LIST_PATH}/`)) {
    // Dedicated reader: /worklog/notes/<currentId> → /worklog/notes/<targetId>
    return `${LIST_PATH}/${entityId}`;
  }

  // List view (exact match) or any other route: list + ?focus=
  return `${LIST_PATH}?focus=${entityId}`;
}
