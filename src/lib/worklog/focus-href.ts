/**
 * Build the href to focus a worklog note from any surface in the app.
 *
 * Per ADR-0024, the canonical URL for a single note is
 * `/worklog/notes/<id>` — the dedicated reader route. The previous
 * `?focus=<id>` drawer-preview pattern from ADR-0015 Phase 5 is retired.
 *
 * The `pathname` parameter is kept in the signature for backward
 * compatibility (the helper used to branch on pathname to choose between
 * `?focus=` and a path-segment swap) but is now ignored — every surface
 * routes to the same canonical reader URL.
 */

const LIST_PATH = "/worklog/notes";

export function buildWorklogFocusHref(
  _pathname: string,
  entityId: string,
): string {
  return `${LIST_PATH}/${entityId}`;
}
