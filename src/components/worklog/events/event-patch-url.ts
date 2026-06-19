/**
 * Centralized URL builder for free-floating vs anchored CareerEvent
 * mutation routes (per ADR-0027 Q1=A immutability of `workHistoryId`).
 *
 *   • workHistoryId === null  → /api/events/[id]
 *   • workHistoryId !== null  → /api/work-history/[whId]/events/[id]
 *
 * Lifted out of `event-edit-dialog.tsx` ahead of ADR-0034 retiring that
 * dialog. `event-delete-confirm.tsx` still imports this helper for its
 * DELETE call; the new editor uses it for PATCH on existing events.
 */

export function eventPatchUrl(event: { id: string; workHistoryId: string | null }): string {
  if (event.workHistoryId === null) return `/api/events/${event.id}`;
  return `/api/work-history/${event.workHistoryId}/events/${event.id}`;
}

/**
 * Photo gallery URL — same split rationale as `eventPatchUrl`, parallel
 * to ADR-0027 Q2=B. POST = upload (multipart), GET = list, DELETE = single
 * photo via `?photoId=` query.
 */
export function eventPhotosUrl(event: { id: string; workHistoryId: string | null }): string {
  if (event.workHistoryId === null) return `/api/events/${event.id}/photos`;
  return `/api/work-history/${event.workHistoryId}/events/${event.id}/photos`;
}
