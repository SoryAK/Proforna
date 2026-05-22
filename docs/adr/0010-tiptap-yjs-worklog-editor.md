# 10. Adopt Tiptap 3 + Y.js for Worklog editor and offline support

## Status
Proposed

## Context
The Worklog notes/capture flow was being built in-house from plain `<textarea>` + ad-hoc draft sync (ADR-0009). This was slow to evolve, lacked rich-text affordances, and had no offline story — the user explicitly wants:

1. A faster, more delightful capture flow (Cmd/Ctrl+K quick capture).
2. A richer notes editor with future room for custom blocks (shift, mood, mentions, locations).
3. Offline access to worklogs and notes (drafting on a plane, in a basement, etc.).
4. Zero AGPL/GPL exposure — Resumsify must remain free of copyleft contamination.

Open-source landscape considered:

| Option | License | Rejected because |
|---|---|---|
| Outline (fork) | BSL→MIT | Server-coupled, monolith, AGPL deps upstream |
| Kimai / Logseq / AppFlowy (copy code) | AGPL | Legal risk |
| Novel (Next.js Tiptap shell) | Apache-2.0 | Targets Tiptap 2; we already run Tiptap 3 |
| BlockNote | MPL-2.0 | Heavier surface, opinionated UI |
| Plate | MIT | Slate-based; doesn't compose with installed Tiptap |
| **Tiptap 3 directly** | **MIT** | **Already installed; headless; full control** |

For offline state, Y.js + `y-indexeddb` is the de-facto standard for CRDT-backed offline editing and integrates with Tiptap via `y-prosemirror`. Dexie provides a boring IndexedDB cache for saved-log lists/readers.

The Grilling that informed this:
- **Capture surface?** → Cmd/Ctrl+K global modal first (extend existing `command-palette.tsx`).
- **Storage format?** → Additive: add `WorkLog.contentJson Json?`, keep `content` as plain-text projection so search/exports/legacy readers keep working.
- **Sync scope?** → Phase 1 = local-only CRDT via `y-indexeddb`; defer `y-websocket`/Hocuspocus to Phase 2. ADR-0009 server draft sync remains the network layer.

## Decision
Adopt the following stack for Worklog editor + offline:

| Concern | Library | License |
|---|---|---|
| Editor engine | `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-placeholder` + `@tiptap/extension-link` + `@tiptap/extension-collaboration` | MIT |
| CRDT doc | `yjs` | MIT |
| Offline persistence | `y-indexeddb` | MIT |
| Tiptap ↔ Y.js binding | `y-prosemirror` | MIT |
| Offline read cache for saved logs | `dexie` + `dexie-react-hooks` | Apache-2.0 |

Phased rollout:
- **1a** (this ADR): deps installed, `contentJson Json?` added to `WorkLog`, API routes accept/return it with size+shape validation.
- **1b**: `worklog-editor.tsx` (Tiptap wrapper) replaces textarea in `worklog-note-reader.tsx`.
- **1c**: `quick-capture-dialog.tsx` wired into `command-palette.tsx`.
- **1d**: Dexie cache surfaces saved logs offline.
- **1e**: Custom Tiptap nodes (ShiftBlock, MoodBlock, mentions).

`WorkLog.content` is retained as a plain-text projection generated client-side from the ProseMirror JSON on save. Search, AI consumers, and exports continue to read `content` unchanged.

## Consequences

### Pros
- All chosen libraries are MIT or Apache-2.0 — no copyleft risk.
- Tiptap is already in the bundle; marginal cost is small (~80KB gzipped for Y.js + bindings).
- Offline-first via Y.js solves drafting reliably; CRDT semantics prevent conflicts when Phase 2 adds multi-device sync.
- Custom blocks (shift/mood/mention) become first-class editor nodes rather than bolt-on UI.
- Phased rollout — each phase is independently revertible (e.g. `contentJson` can sit unused without breaking anything).

### Cons / Trade-offs
- New storage format (ProseMirror JSON) becomes the source of truth. Going back to plain text would be lossy.
- Two-write on save (`content` plain projection + `contentJson` doc) — slight extra payload, must stay consistent.
- Y.js doc per worklog grows over time; we will need a compaction strategy if a doc accumulates massive edit history (defer to Phase 2).
- Tiptap 3 collaboration extensions pin exact peer versions — upgrading Tiptap means upgrading all extensions in lockstep.
- IndexedDB is unencrypted at rest; on a shared OS user account, another user with disk access could read drafts. Acceptable for Phase 1; optional passphrase-encrypted store is Phase 2 backlog.
