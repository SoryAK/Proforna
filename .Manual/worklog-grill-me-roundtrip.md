# Worklog "Grill Me" — Markdown Round-Trip Export & Re-Import

**Status:** Shipped
**Owner:** Sory
**Related ADR(s):** [0022](../docs/adr/0022-worklog-grill-me-markdown-roundtrip.md), [0017](../docs/adr/0017-worklog-version-history-and-visual-diff.md), [0018](../docs/adr/0018-external-import-integrations.md)
**Source files:** `src/lib/worklog/export/{frontmatter,pm-to-markdown,worklog-to-markdown,client}.ts`, `src/lib/worklog/share/{can-share,share-client}.ts`, `src/lib/worklog/import/grill-frontmatter.ts`, `src/app/api/work-logs/[id]/export/route.ts`, `src/app/api/work-logs/export-bulk/route.ts`, `src/app/api/work-logs/import-md/route.ts`, `src/components/worklog/worklog-notes-bulk-bar.tsx`, `src/components/worklog/worklog-notes-view.tsx`, `src/components/worklog/worklog-import-dialog.tsx`

---

## 1. Functional Description

"Grill Me" is the worklog feature that lets a user take one or more notes to an external AI assistant (ChatGPT, Claude, Gemini), have them rewritten / critiqued, and pull the rewrite back into Resumsify without losing the link to the original note.

**Example user story:** *"I select three worklog entries from this week, click Export in the bulk-action bar, get a `.zip` of three `.md` files. I paste one into Claude, ask it to tighten the writing, copy the result, and drop it back into Resumsify's import dialog. The dialog auto-detects that this is a rewrite of an existing note, writes the new content to that note, and creates a snapshot so I can roll back if I don't like the rewrite."*

The export format is plain markdown (CommonMark + GFM). At the top of every exported file is a small YAML block carrying the worklog's `id`, current `version`, and `exportedAt` timestamp. That block is what makes re-import safe: when the file comes back, the server uses those three fields to decide whether to write the new content (match), warn the user that the note has changed since export (conflict), or fall back to a manual picker (frontmatter missing or pointing to a deleted/foreign note).

## 2. Internal Workflow

### Export (bulk action)

1. User toggles **Select** in the notes view, ticks one or more rows, then clicks the **Send** dropdown in the bulk-action bar (`src/components/worklog/worklog-notes-bulk-bar.tsx`).
2. The Send menu shows two destinations — one verb, two outcomes:
   - **Download** — always available. Calls `exportBulkWorklogs(ids)` from `src/lib/worklog/export/client.ts` and triggers a synthetic `<a download>` click on the response blob.
   - **Share to…** — calls `shareWorklogs(ids)` from `src/lib/worklog/share/share-client.ts`, which performs the same bulk-export POST and routes the resulting blob through `navigator.share({ files })` so the OS share sheet can hand it off to ChatGPT, Claude, Gemini mobile, AirDrop, Mail, Slack, Notion, etc.
3. Either path POSTs `{ids}` to `/api/work-logs/export-bulk` (`src/app/api/work-logs/export-bulk/route.ts`).
4. Route handler:
   1. Authenticates via `getUserId()`.
   2. Validates body (non-empty string array, ≤ 100 ids).
   3. Fetches `prisma.workLog.findMany({where:{userId, id:{in: ids}}})` — silently drops cross-user ids.
   4. Returns 404 if no rows owned.
   5. Calls `prisma.workLogVersion.groupBy({by:["workLogId"], _count:{_all:true}})` to attach a version count to each row.
   6. For each row, calls `worklogToMarkdown()` (composer in `src/lib/worklog/export/worklog-to-markdown.ts`) which calls `serializeFrontmatter()` and `serializeToMarkdown()` and concatenates them.
   7. **N=1** → returns `text/markdown` with `Content-Disposition: attachment; filename="<slug>.md"`.
   8. **N>1** → builds a `JSZip` archive (`uniquify()` resolves filename collisions with the first 6 alphanumeric chars of the worklog id, then a numeric suffix) and returns `application/zip` with `filename="worklogs-YYYY-MM-DD.zip"`.
5. Client extracts the filename from `Content-Disposition` and either:
   - Triggers a download via a synthetic `<a>` click (helper `triggerDownload()`) on the **Download** path.
   - Wraps the blob in a `File` and calls `navigator.share({files})` on the **Share to…** path. `decideShareOutcome(error)` translates the result into one of three terminal states: `"shared"` (success), `"cancelled"` (user dismissed the OS share sheet — silent), or `"downloaded"` (Web Share unsupported or failed; we fell back to the synthetic download and surfaced the toast *"Sharing isn't supported on this browser. The file was downloaded instead."*).
   - The capability check `canShareFiles()` is SSR-safe and probes `navigator.canShare({ files: [<empty File>] })` so we never advertise share support on Firefox desktop or insecure contexts.

### Re-import (existing import dialog)

1. User opens **Import** dialog (top toolbar) and drops/pastes a `.md` file or pastes the body text.
2. `WorklogImportDialog.uploadRow()` runs `fileToSource()` to get the raw markdown.
3. **Discriminator** `hasGrillFrontmatter(source)` — cheap regex check for `---` fence + `id:` + `version:` keys.
4. **If grill-me** → POSTs `{source}` to `/api/work-logs/import-md`. **Else** → falls through to the existing first-time-import path (`/api/work-logs/import`).
5. The grill-me route (`src/app/api/work-logs/import-md/route.ts`):
   1. Authenticates + validates (5MB cap mirrors the existing import path).
   2. Calls `parseFrontmatter(source)` — returns `{frontmatter, body}` where `frontmatter` is `null` if the YAML block is missing/malformed.
   3. **No frontmatter** → parses the body via `importMarkdown(body)` and returns `{status: "needs-picker", reason: "no-frontmatter", fileBody}`. **No DB queries.**
   4. **Frontmatter present** → looks up `prisma.workLog.findFirst({where:{id, userId}})` and `prisma.workLogVersion.count({where:{workLogId: id}})`.
   5. Calls pure `decideImport({parsedFrontmatter, workLogExists, currentVersionCount})` from `src/lib/worklog/import/grill-frontmatter.ts` which returns one of four cases:
      - **match** (`fileVersion >= currentVersion`) — proceeds to write.
      - **conflict** (`fileVersion < currentVersion`) — returns the parsed file body + the current server body for client comparison. **No write.**
      - **needs-picker** — frontmatter null branch (already handled above).
      - **not-found** — frontmatter present but `workLogExists === false`. **No write.**
   6. **Match write path:**
      1. `validateContentJson()` re-validates the parsed contentJson.
      2. Recomputes `linkedNoteIds` (replace, with self-loop guard) and `assetIds` (additive merge — same invariants the PUT route enforces).
      3. `prisma.workLog.update({...})` writes title, content (plaintext), contentJson, and the mention-derived columns when they changed.
      4. Calls ADR-0017's auto-snapshot writer (`shouldAutoSnapshot()` heuristic + `prisma.workLogVersion.create()` with `label: "Re-imported via Grill Me"`).
      5. After a snapshot is created, runs retention thinning via `computeRetentionPlan()`.
      6. Returns `{status: "imported", workLogId, snapshotCreated, droppedBlocks}`.
6. Client (`worklog-import-dialog.tsx`) maps the four response statuses to four row statuses (`reimported` / `conflict` / `needs-picker` / `not-found`) and updates the UI.
7. On `reimported`, the client invalidates `["work-logs"]` and `["worklog-versions", workLogId]` so the editor / list / history panel pick up the freshly-written content.

## 3. Configuration / Params

| Name | Location | Default | Purpose |
|------|----------|---------|---------|
| `BULK_MAX` | `src/app/api/work-logs/export-bulk/route.ts` | `100` | Hard cap on bulk export ids per request. |
| `MAX_SOURCE_BYTES` | `src/app/api/work-logs/import-md/route.ts` | `5 * 1024 * 1024` | 5 MB upper bound on the markdown payload (mirrors the existing import route). |
| `MENTION_PREFIX` | `src/lib/worklog/export/pm-to-markdown.ts` | `{asset:"a", skill:"s", company:"c", contact:"p", worklog:"n"}` | Single-letter prefix used for `@<prefix>:<entityId>` in the exported markdown so the import side can route mentions back to the right entity table. |
| `serializeFrontmatter()` quoting | `src/lib/worklog/export/frontmatter.ts` | Single-quoted scalars | Any value containing `:` is wrapped in single quotes (with `'` escaped by doubling) so YAML parsers don't interpret it as a key/value. |
| `slugifyTitle()` cap | `src/lib/worklog/export/worklog-to-markdown.ts` | 80 chars | Maximum filename length (after NFKD-normalize + ASCII strip + lowercase). Falls back to `untitled` when title is empty. |
| Auto-snapshot label | `src/app/api/work-logs/import-md/route.ts` | `"Re-imported via Grill Me"` | Label written to the `WorkLogVersion` row so the history panel can distinguish re-imports from regular auto-snapshots. |

## 4. Known Constraints

- **Canvas blocks are dropped on export.** `canvasBlock` is a Tiptap-only construct (free-positioned 2D layout) with no markdown analogue. Exports emit `[Canvas: <title> — not exported]` placeholders and increment `droppedBlocks`. Re-imports strip them entirely.
- **Mentions are re-resolved on re-import.** The frontmatter doesn't carry resolved mention metadata; the markdown serializer emits `@<prefix>:<entityId>` and the import parser re-extracts them. If an entity was deleted between export and re-import, the mention falls back to literal text.
- **No 3-way diff modal yet.** Conflict status surfaces as a textual amber message (`"Server is at v7, file is at v4. Open the note to compare, then re-export and try again."`). A proper visual diff modal is parked for a follow-up sprint.
- **Same 404 for missing vs cross-user.** When the frontmatter id points to a worklog the user doesn't own, the response is `not-found` with the same shape as a frontmatter-pointing-to-a-deleted-id case. Existence is never leaked.
- **`prisma.workLog.findFirst` is owner-scoped on EVERY lookup.** No code path crosses user boundaries; the server cannot leak another user's worklog into the response.
- **Bulk export hard-caps at 100 ids per request.** Large libraries need to be paginated client-side. The cap protects against accidental DOS via massive zip generation.
- **Frontmatter is editable.** Nothing prevents a user from manually swapping the `id` field. Cross-user manipulation falls into the owner-scoped lookup → returns `not-found` → user gets a picker, never a silent write.
- **No CLI tooling for power users.** Round-trip is via the dialog/bulk-bar UI only. Programmatic export/import (e.g. for git-backed worklog history) is not a goal of this sprint.

## 5. Future / Deferred

- **3-way diff modal** for conflict status — show file body, server body, and a preview of the merge so the user can pick. Reuse `WorklogVersionDiffModal` machinery from ADR-0017.
- **Picker dialog** for needs-picker / not-found — let the user manually point the imported body at a target worklog instead of being told "couldn't auto-link."
- **"Force re-import" override** — when conflict, give the user a one-click button to import anyway (server already auto-snapshots first, so it's reversible).
- **Frontmatter signing / HMAC** — sign the frontmatter so manual edits are detectable. Probably overkill for this trust model; deferred unless the threat model changes.
- **Google Drive sync** — explicitly rejected with re-entry criteria in `/memories/repo/parked-ideas.md`. Re-evaluate only if usage telemetry shows ≥5 grill-me round-trips per user per week sustained for 30 days.
