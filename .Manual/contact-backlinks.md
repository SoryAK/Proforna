# Contact Backlinks (Notes Mentioning a Contact)

**Status:** Shipped
**Owner:** Sory
**Related ADR(s):** [0028](../docs/adr/0028-persona-contact-reverse-lookup.md), [0016](../docs/adr/0016-note-to-note-linking-and-backlinks.md)
**Source files:**
- `prisma/schema.prisma` (`WorkLog.linkedContactIds: String[]` + GIN index)
- `prisma/migrations/20260615170725_add_worklog_linked_contact_ids/migration.sql`
- `src/lib/worklog/prosemirror-to-text.ts` (`extractMentionEntityIds`)
- `src/app/api/work-logs/[id]/route.ts` (write path — derive `linkedContactIds` on save)
- `src/app/api/contacts/[id]/backlinks/route.ts` (read path — owner-scoped reverse lookup)
- `src/components/contacts/contact-backlinks-section.tsx` (UI surface)
- `src/app/(app)/contacts/page.tsx` (mount inside the existing edit Dialog)
- `scripts/migrations/2026-06-15-backfill-linked-contact-ids.ts` (one-time backfill)

---

## 1. Functional Description

When a user opens a contact in the **Edit Contact** dialog on `/contacts`, a "Notes mentioning this contact" section appears beneath the Notes textarea. Each row is a worklog note that contains an `@p:` chip pointing at this contact. Clicking a row navigates to `/worklog/notes?focus=<workLogId>` so the worklog list opens with that note in focus (ADR-0015 contract).

When no notes mention the contact, the section displays a discoverability hint:

> No notes mention this contact yet. Type `@p:` in any worklog note to mention them.

This hint is intentional — closes parked-ideas gap #3 (most users never discover that `@p:` exists).

**Example user story:** *"I saved Tom's contact months ago and have been mentioning him in my standup notes via `@p:`. Now I need to remember every conversation we had about the Q4 launch. I open Tom's contact card → click Edit → see 12 notes that reference him, ordered by date. I click into the most recent one and pick up the thread."*

## 2. Internal Workflow

### Write path — populating the link

1. User types `@p:` in any worklog note. The mention picker (`MentionSuggestionPopup`) fetches `/api/work-logs/mention-search?type=contact&q=...` against the user's `Contact` table.
2. User confirms a contact. Tiptap inserts an inline `mention` atom with `attrs: { entityType: "contact", entityId, label }` inside the current paragraph.
3. On autosave, `PUT /api/work-logs/[id]` walks `contentJson` via `extractMentionEntityIds(doc, "contact")` and derives the new `linkedContactIds` set.
4. The route compares the new set against `existing.linkedContactIds` via `arraysEqualAsSets`. On no-op autosaves (set unchanged), the column is **not** rewritten — the GIN index is spared a write per keystroke.
5. When the set differs, `WorkLog.linkedContactIds` is replaced wholesale (REPLACE semantic — chip removal clears the link, mirroring `linkedNoteIds`, NOT `assetIds` which is additive).

### Read path — surfacing backlinks

6. The Edit Contact dialog conditionally mounts `<ContactBacklinksSection contactId={editingId} />` only when an existing contact is being edited (no surface during Add).
7. The component issues a TanStack Query against `GET /api/contacts/[id]/backlinks`.
8. The route runs **owner-scoped twice**: (a) `prisma.contact.findFirst({ where: { id, userId } })` returns 404 if the contact is unowned (never silently empty-array unowned ids — that would conflate "not yours" with "no backlinks"); (b) `prisma.workLog.findMany({ where: { userId, linkedContactIds: { has: id } }, orderBy: { date: "desc" } })`.
9. Each row is projected to `{ id, label, date, positionId }` with `label` from `deriveWorklogLabel({ title, contentJson, date })` — the shared fallback chain `title → first plain-text line → ISO workday date`, truncated to 80 chars.
10. The UI renders the rows with the count in the header (`Notes mentioning this contact (N)`) or the discoverability hint when the array is empty.

### Cross-route navigation

11. Clicking a row calls `router.push("/worklog/notes?focus=" + row.id)`. We use `push` (not `replace`) because the user came from `/contacts` and the back-button should return them to the contacts page.

## 3. Configuration / Params

| Name | Location | Default | Purpose |
|------|----------|---------|---------|
| Backlinks `staleTime` | `src/components/contacts/contact-backlinks-section.tsx` | `30000` ms | TanStack Query freshness window |
| `linkedContactIds` index | `prisma/schema.prisma` (WorkLog) | GIN | Indexed for `{ has: id }` lookups |
| Backfill `--dry-run` | `scripts/migrations/2026-06-15-backfill-linked-contact-ids.ts` | off | Preview-only mode (verified clean baseline 2026-06-15) |

## 4. Known Constraints

- **Edit Dialog is the only surface.** No standalone `/contacts/[id]` drawer or page yet (parked under ADR-0028 Out-of-Scope). Backlinks live behind one click on `Edit`.
- **Adding a new contact** does not surface backlinks (the section only mounts when `editingId` is set). Correct by design — a brand-new contact has no backlinks.
- **No auto-bump of `Contact.lastContactedAt`** when a worklog with that contact is saved. The existing `lastContactedAt` field is user-editable in the dialog, but mention activity does not yet drive it.
- **Owner scope is tighter than ADR-0016's worklog backlinks.** This route 404s on cross-user contact ids; the worklog backlinks route still empty-arrays cross-user worklog ids (kept parked — see ADR-0028 Out of Scope §5).
- **Chip labels are captured at insertion time.** If the contact is later renamed, existing chips show the stale label until reinserted (same constraint as note-to-note links — same backfill pattern would apply if needed, see `scripts/migrations/2026-06-09-fix-worklog-mention-labels.ts`).
- **No cross-cut backlinks for JobApplication / Interview / RecruiterSubmission.** A contact's mentions in those entity types are not surfaced (parked under ADR-0028 Out of Scope §3).

## 5. Future / Deferred

- **Standalone `/contacts/[id]` drawer or page** with full activity timeline (mentions + JobApplication touches + Interview attendance + RecruiterSubmission entries).
- **Auto-bump `lastContactedAt`** on `@p:` save — open question: does mentioning equal contacting? (Probably not; mentions can reference past conversations.)
- **Cross-cut backlinks** to JobApplication/Interview/RecruiterSubmission via the same `linkedContactIds` shape on those entities.
- **`@c:` mention vs `Contact.company` bridge** — `@c:` resolves to WorkHistory company strings; `Contact.company` is free text. Reconciling would let a "Notes mentioning Acme" view aggregate both.
- **Discoverability boost** beyond the empty-state hint: toolbar quick-action, slash-command shortcut, or contact-card "Mention this contact" CTA.
