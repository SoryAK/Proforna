# Worklog — Bulk Multi-Select (Move / Delete)

## Feature Name
Worklog bulk multi-select with **Move to folder** and **Delete**.

## Functional Description
Lets the user select many notes at once from the middle "Notes" pane and
apply a single action (move to a folder, or delete) instead of repeating
the same operation note-by-note. Designed for the common "I just got home
from a long shift and want to file 20 quick-captures into the right
project folder" workflow.

## Internal Workflow
1. **Trigger selection** — any of:
   - Hover a note row → fade-in checkbox → click.
   - `⌘/Ctrl + click` anywhere on a row → toggles that row.
   - `Shift + click` on a checkbox → range-select from the *anchor* row
     (last single-toggled row) to the clicked row, inclusive.
   - `⌘/Ctrl + A` while focused inside the list → select every *currently
     loaded* row (matches the same lazy-render window the list uses).
2. **Floating action bar** appears centered above the bottom of the
   viewport (`z-[2050]`, above modals and rail) showing
   `{N} selected · Move to folder · Delete · ✕`.
3. **Move** opens the existing `WorklogMoveToFolderDialog` (re-used —
   single-note + bulk share one folder picker) with the title
   `Move {N} notes to folder`. The user can also create a new folder
   inline; the new id is used as the target. The chosen `folderId`
   (or `null` for Unfiled) is POSTed to `/api/work-logs/bulk` with
   `{ action: "move", ids, payload: { folderId } }`.
4. **Delete** opens a destructive `Dialog` confirm naming the count
   (`Delete {N} notes?` + irreversible warning). On confirm, POSTs
   `{ action: "delete", ids }`.
5. **Server** (`POST /api/work-logs/bulk`):
   - Authn via `getUserId()`.
   - Wraps `prisma.workLog.updateMany` / `deleteMany` in a `$transaction`.
   - Always scopes by `userId` (defense-in-depth IDOR protection).
   - For `move`: pre-checks that the target folder is owned by the user.
   - Caps `ids.length ≤ 200` per request.
6. **Cache** — on success, `useWorklogMutations.bulkAction` invalidates
   `["worklogs"]` *and* `["worklog-folders"]` so folder counts in the rail
   stay accurate.
7. **Auto-clear** — selection is cleared when the user switches folders
   (silent, no confirm) and when `Esc` is pressed while the action bar
   is mounted. Selection is also cleared on successful move/delete.
8. **Reader fallback** — if the currently-open note is part of a bulk
   delete batch, the reader is dropped (selectedNoteId → null) so the
   user doesn't see a stale note.

## Configuration / Params
| Constant | Where | Value | Meaning |
|---|---|---|---|
| `MAX_IDS` | `src/app/api/work-logs/bulk/route.ts` | `200` | Hard cap on ids per bulk request. |
| `ACTIONS` | same | `["move","delete"]` | Allowed actions; widen here when adding pin/archive. |
| Checkbox visibility | `worklog-notes-list.tsx` | hover-reveal (60%) when no selection, full-opacity once any row is selected | Avoids visual clutter on the default browsing view. |
| Range anchor | `use-worklog-selection.ts` | Updated only on single `toggle`, **not** on `toggleRange` | Matches Gmail/Finder Shift+click semantics. |
| Action bar z-index | `worklog-bulk-action-bar.tsx` | `z-[2050]` | Above the search palette (`z-[2000]`) but below toasts. |

## Known Constraints
- Bulk **pin** is intentionally deferred to roadmap W2.2 (pinned-by-folder).
- The id list cap is 200; selecting "all" across a 5,000-note archive will
  refuse server-side. A future "select all matching filter" affordance
  would need server-side filter execution (not just id list).
- Selection is **client-only state** — refreshing the page or navigating
  away discards it. Persisting selection across navigation was rejected as
  scope creep.
- The current selection clears silently on folder switch. If users start
  losing work to accidental clears, we'll switch to a one-shot toast
  ("Selection cleared — Undo") behind a preference.
- `⌘/Ctrl + A` selects only the **rendered** subset (PAGE_SIZE = 120 with
  lazy load above the 250-note virtualization threshold). Users must
  scroll to expand the window before Select-All hits every match.
- The bulk move dialog ignores `currentFolderId` (passes `null`) because
  the batch can span multiple source folders — the dialog's "current"
  highlight is therefore not shown.

## Related
- ADR-0007 (worklog three-pane redesign)
- ADR-0011 (postgres tsvector worklog search) — different feature, same
  invalidation key (`["worklogs"]`).
- `.Manual/worklog-search.md` — uses the same `Dialog` z-index stack.
