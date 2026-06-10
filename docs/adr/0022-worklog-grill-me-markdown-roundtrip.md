# Worklog "Grill Me" — Markdown Round-Trip with Identity Frontmatter

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** Sory
- **Tags:** worklog, integration, markdown, ai

## Context and Problem Statement

Resumsify's worklog notes are the user's daily writing surface. Two needs converged into a single feature request:

1. The user wanted to take a worklog note to an external LLM (ChatGPT, Claude, Gemini) for "Socratic grilling" — paste it in, have the AI poke holes, then paste the rewrite back into Resumsify.
2. There was no general-purpose markdown export. The closest thing was the **import** path (ADR-0018) which lands new notes; nothing reversed it.

The naive shape — "let users copy-paste raw markdown" — falls apart on re-import because the file has no identity. Without an identifier, we can't tell whether the user pasted back a *rewrite of an existing note* or a *brand new note*. The wrong guess silently overwrites the wrong row.

We needed an export format that round-trips cleanly: round-trippable bytes plus a way to recognise the file when it comes back.

## Decision Drivers

- **Round-trip without surprises** — re-imports should never silently overwrite a different note than the one the file came from.
- **AI-friendly format** — the export must paste cleanly into chat UIs without preamble or footer noise.
- **Reuse the existing import pipeline** — ADR-0018 already does markdown→ProseMirror parsing well; new code should compose with it, not replace it.
- **No provider lock-in** — clipboard + .md files only. We deliberately rejected Google Drive integration (parked, see [parked-ideas.md](../../memories/repo/parked-ideas.md)).
- **Safe by default** — if the server has changed since export, the user gets a conflict signal rather than a silent overwrite.

## Considered Options

- **Option A — Plain markdown export, dedupe by content fingerprint on re-import.** Re-use the existing import path. Identity inferred from content hash.
- **Option B — Markdown + YAML frontmatter carrying `id` + `version` + `exportedAt`.** Re-import inspects the YAML, looks up the worklog by id, and decides match / conflict / picker / not-found.
- **Option C — Custom binary blob (e.g. JSON with a `.rsm` extension).** Round-trip is lossless, but breaks paste into ChatGPT.

## Decision Outcome

**Chosen option: "Option B — markdown + YAML frontmatter"**, because it's the only option where the round-trip is identity-preserving without sacrificing AI-friendliness. ChatGPT/Claude/Gemini all preserve fenced YAML headers verbatim, and the frontmatter is invisible to the user once they're in chat.

### Positive Consequences

- **Clean round-trip semantics.** A file exported at v4 and re-imported when the server is still at v4 lands cleanly. A file exported at v4 but the server is at v7 surfaces a conflict instead of clobbering.
- **Re-uses ADR-0018's import pipeline.** Re-import calls the same `importMarkdown()` parser the first-time import does. New code is just the routing decision and the version bookkeeping.
- **Endpoint shape is small.** One pure decision function (`decideImport`) returning a 4-case union → one route handler → one client-side discriminator. No new database columns.
- **Auto-snapshot via ADR-0017** — every successful re-import fires the same auto-snapshot writer the editor uses, so re-imports are reversible.
- **Bulk export is free.** The single-worklog endpoint composes into a zip endpoint with `JSZip`. N=1 returns `.md`, N>1 returns `.zip`.

### Negative Consequences

- **Canvas blocks are dropped.** `canvasBlock` is a Tiptap-only construct (free-positioned 2D layout) with no markdown analogue. We surface a placeholder line `[Canvas: <title> — not exported]` and count it in `droppedBlocks` so the UI can warn. Re-import strips them entirely.
- **Mentions are re-resolved on re-import.** The frontmatter doesn't carry the resolved mention metadata; mentions emit as `@<prefix>:<entityId>` and are re-parsed on re-import. If an entity was deleted between export and re-import, the mention falls back to the literal text.
- **No 3-way diff modal yet.** Phase 5 ships the conflict status with a textual message ("server is at v7, file is at v4 — open and re-export"). A proper 3-way diff modal is parked.
- **Frontmatter is editable.** Nothing prevents a user from manually swapping the `id` field. The server still owner-scopes lookups by `userId`, so the worst case is a needs-picker response, not a cross-user write.

## Pros and Cons of the Options

### Option A — Plain markdown + content-fingerprint dedupe

- ✅ Zero schema changes; export is literally "serialize ProseMirror to markdown."
- ❌ Re-import is ambiguous when the AI rewrites the body — the fingerprint changes, so the file looks like a brand-new note. The whole point of the feature dies here.
- ❌ Worse, if the AI's rewrite happens to fingerprint-collide with an unrelated note, the dedupe path silently merges them.

### Option B — Markdown + YAML frontmatter (chosen)

- ✅ Identity is durable: frontmatter survives copy-paste through every major LLM chat UI.
- ✅ Conflict detection is mechanical: frontmatter `version` vs server `count(WorkLogVersion)`.
- ✅ Falls back to picker when frontmatter is missing or stripped — never silently writes the wrong note.
- ❌ Adds ~10 lines of YAML to the top of every export (acceptable; LLMs ignore it).
- ❌ Custom Tiptap nodes (canvas, mood, shift) need explicit handling in the serializer.

### Option C — Custom JSON blob

- ✅ Lossless round-trip including canvas blocks.
- ❌ Breaks the entire use case — you can't paste JSON into ChatGPT and get useful editing back.

## Implementation Layout

```
src/lib/worklog/
├── export/
│   ├── frontmatter.ts          ─ YAML serialize/parse (gray-matter)
│   ├── frontmatter.test.ts     ─ 16 tests
│   ├── pm-to-markdown.ts       ─ ProseMirror JSON → CommonMark+GFM walker
│   ├── pm-to-markdown.test.ts  ─ 27 tests
│   ├── worklog-to-markdown.ts  ─ Composer: frontmatter + body → file
│   ├── worklog-to-markdown.test.ts — 11 tests
│   └── client.ts               ─ Browser-side download helpers
└── import/
    ├── grill-frontmatter.ts    ─ Pure decideImport() returning a 4-case union
    └── grill-frontmatter.test.ts — 6 tests

src/app/api/work-logs/
├── [id]/export/route.ts        ─ GET single .md attachment (11 tests)
├── export-bulk/route.ts        ─ POST bulk .md or .zip (13 tests)
└── import-md/route.ts          ─ POST re-import endpoint (13 tests)
```

The four `decideImport` cases:

```ts
type ImportDecision =
  | { kind: "match";        workLogId: string }
  | { kind: "conflict";     workLogId: string; fileVersion: number; currentVersion: number }
  | { kind: "needs-picker"; reason: "no-frontmatter" }
  | { kind: "not-found";    attemptedId: string };
```

UI integration:

- `WorklogNotesBulkBar` exposes a single **Send** dropdown trigger (replacing the original Export button between Move and Delete). One verb ("send out of the system"), two destinations:
  - **Download** — always available; saves `.md` (N=1) or `.zip` (N>1) directly via the existing bulk-export endpoint.
  - **Share to…** — routes the same blob through `navigator.share({ files })` (Web Share API Level 2). Used to hand the file to ChatGPT/Claude/Gemini mobile apps, AirDrop, Mail, Slack, Notion, or any installed share target.
- `WorklogImportDialog` discriminates on a regex check (`---` fence + `id:` + `version:` keys) and routes grill-me files to `/api/work-logs/import-md`. Four new row statuses (`reimported` / `conflict` / `needs-picker` / `not-found`) surface the four `decideImport` outcomes.

## Addendum (2026-06-09) — Web Share onramp

The round-trip needs an outbound destination, not just "file on disk." Native sharing turns one-tap-to-AI into reality on mobile and stays useful on desktop (Mail, Slack, Drive, Dropbox, etc.) without adding a single line of provider-specific code.

**Decision**: Add `shareWorklogs(ids)` next to `exportBulkWorklogs(ids)`. Both reuse `POST /api/work-logs/export-bulk` so the artifact is identical — only the destination differs. The bulk-bar Send dropdown picks which one to call.

**Capability gating**: `canShareFiles()` (SSR-safe predicate) checks `navigator.share` + `navigator.canShare({ files: [<probe File>] })`. False on SSR, Firefox desktop, insecure contexts, and any browser without Web Share Level 2.

**Outcome contract** (`ShareOutcome` from `decideShareOutcome`):

```ts
type ShareOutcome = "shared" | "cancelled" | "downloaded";
```

- `"shared"` — OS share sheet succeeded.
- `"cancelled"` — user dismissed the share sheet (`AbortError`, both `DOMException` and plain `Error` variants).
- `"downloaded"` — share unsupported OR threw a non-cancellation error; we fell back to the existing download path so the user always gets their file. The view surfaces an honest sonner toast: *"Sharing isn't supported on this browser. The file was downloaded instead."*

**Why this beats Google Drive integration** (parked permanently in `parked-ideas.md`):

| Dimension              | Web Share              | Google Drive             |
| ---------------------- | ---------------------- | ------------------------ |
| Code                   | ~80 LOC                | ~1000+ LOC               |
| Destinations           | Anything installed     | Drive only               |
| Vendor lock-in         | None                   | Permanent                |
| Return trip from AI    | Manual (paste/upload)  | Manual (paste/upload)    |

The return trip is manual either way — Drive doesn't actually save a step. Web Share gives users **every** AI / messenger / cloud target their device knows about for ~5% of the build cost.

**Out of scope for this addendum** (parked separately):

- Per-row Send menu inside the notes list (would be a new UI surface across table/grid/list — follow-up sprint).
- Top-level Export button + standalone worklog picker dialog (separate feature; needs picker UX of its own).
- Bulk streaming + progress dialog (markdown is small; YAGNI until BULK_MAX changes or users complain).

## Links / References

- ADR-0018 (External Import Integrations) — first-time markdown/HTML import, the pipeline this feature reuses.
- ADR-0017 (Worklog Version History) — auto-snapshot writer fired on every successful re-import; conflict detection counts `WorkLogVersion` rows.
- ADR-0010 (Tiptap + Y.js) — the Tiptap node schema this feature serialises out of and parses back into.
- [parked-ideas.md](../../memories/repo/parked-ideas.md) — Google Drive integration superseded by Web Share onramp; per-row Send menu + standalone picker dialog parked with re-entry criteria.
- `src/lib/worklog/share/` — `canShareFiles()` predicate + `shareWorklogs(ids)` client (Phase 1, 12 tests).
