# Shipyard `c-yard/` — Slice manifests

Hand-authored topic-keyed manifests that serve as the **first stop in the Phase 0 lookup stack**. Replaces the bulk of "memory graph → codegraph → read_file" exploration for established surfaces with a single read of `<slice>.json`.

Authoritative ADRs: [ADR-0037](../adr/0037-shipyard-context-engineering-layer.md) (umbrella) and [ADR-0038](../adr/0038-slice-schema-and-extractability.md) (this schema, Extractability NFR).

---

## Files in this directory

- `<slice>.json` — one per top-level UI surface (a route or major panel). Hand-authored in Phase 1; analyzer-promoted candidates land in `_candidates/` from Phase 1.5 onward.
- `_index.json` — cross-slice adjacency list. The **only** place outbound relations live; slice files do not store outbound edges.
- `_candidates/` — (created in Phase 1 commit 2) analyzer mining output staged for review before promotion to a slice.
- `README.md` — this file. Schema spec + Extractability rules. Versioned by the `#schema-v1` fragment in each slice's `$schema` field.

---

## Slice schema (v1)

```jsonc
{
  "$schema": "./README.md#schema-v1",
  "slice": "<slug>",                    // kebab-case, MUST equal filename without .json
  "title": "<human title>",
  "description": "<one paragraph: what this surface is, what it owns, what routes it covers>",
  "lastValidatedAt": "YYYY-MM-DD",      // last time a human or analyzer confirmed this file matches reality
  "lastValidatedCommit": "<short-sha>", // optional but recommended

  "entryPoints": [                      // sub-systems WITHIN this surface (G1 = UI-surface granularity)
    {
      "id": "<slug>",                   // kebab-case, unique within slice
      "name": "<human name>",
      "description": "<2-3 sentences: what it is, why it exists, what owns it>",
      "primarySymbol": "<symbol>",      // primary class / hook / function / component
      "primaryPath": "<repo-relative path>",
      "relatedSymbols": ["<symbol>"],   // optional
      "knownTraps": ["<one-line trap>"] // optional, but heavily encouraged — this is the "save the next traversal" payload
    }
  ],

  "traversalRecipes": [                 // hot paths agents (or humans) take to answer a question about this slice
    {
      "id": "<slug>",                   // kebab-case, unique within slice
      "intent": "<the question this recipe answers>",
      "steps": ["<step 1>", "<step 2>"],
      "source": "hand-authored" | "mined",
      "evidence": { "sessions": [ { "id": "<sessionId>", "turnExcerpt": "<≤200 chars>", "toolCallIndex": <number> } ] }
    }
  ],

  "fileFingerprints": [                 // canonical surface files for this slice. Phase 1.5 will tighten the staleness policy.
    { "path": "<repo-relative path>", "role": "<short-role-label>", "lastValidatedAt": "YYYY-MM-DD" }
  ],

  "staleSurfaces": []                   // analyzer / file-watcher daemon (Phase 4) populates this. Empty array = clean.
}
```

### Field rules

- **`slice`** must equal the filename stem (`worklog-editor.json` → `slice: "worklog-editor"`). Drift here breaks `_index.json` adjacency.
- **`entryPoints[].id`** is unique within a slice; **slice-qualified id** is `<slice>/<entryPoints.id>` (e.g. `worklog-editor/version-history`). Used by `_index.json` when an edge targets a sub-system rather than a whole slice.
- **`traversalRecipes[].source = "hand-authored"`** for anything authored in Phase 1; **`"mined"`** for analyzer-promoted entries. `evidence.sessions` is `[]` for hand-authored — fill in only when mining.
- **`fileFingerprints[].lastValidatedAt`** stamps when the human/analyzer last opened the file. Phase 0 reader (provisional G2) emits an in-context warning if any fingerprint's git mtime is newer than `lastValidatedAt`, but **still serves the slice**. Hard policy deferred to Phase 1.5.
- **`staleSurfaces`** stays `[]` until Phase 4's file-watcher daemon writes to it.

### `_index.json` adjacency list shape

```jsonc
{
  "<sliceA>": {
    "<relationType>": ["<sliceB>", "<sliceC>/<entryPoint>"]
  }
}
```

Relation types are free-form short strings (e.g. `"shares"`, `"extends"`, `"composes"`, `"reads-from"`). Empty `{}` is valid in Phase 1 — no cross-slice edges yet.

**Why an adjacency list and not in-slice outbound edges?** ADR-0038 D1 = B. Rename of slice X requires editing exactly one file (`_index.json`). Slice files have no outbound references to break. Trade-off accepted: contention hotspot at scale, revisit at Phase 4.

---

## Extractability NFR (ADR-0038 §5) — enforceable rules

Shipyard is a product. Resumsify is the Phase 1 incubator and first tenant. Every artifact in this directory must lift out cleanly into a future standalone `shipyard/` repo with no host-specific assumptions baked in. These rules are **enforceable at code review** and **CI-greppable**:

1. **Schema field names stay generic.** `entryPoints`, `traversalRecipes`, `fileFingerprints`, `staleSurfaces`, `evidence` — never `worklogEntryPoints`, `resumsifyFingerprints`, or other host-specific prefixes.
2. **No host-repo name substrings in schema field names or top-level keys.** Grep test: `grep -i -E "(worklog|resumsify|tiptap|prisma)[A-Z]" docs/c-yard/**/*.json` should match **nothing in field names** (it WILL match in values — that's tenant-specific instance data and is correct).
3. **Tooling reads paths from config, not hardcoded literals.** The analyzer flag (`--mine-traversals <slice>`, Phase 1 commit 2) reads its output directory from a config object — never inlines `"docs/c-yard/"` as a literal in script logic.
4. **The migration script keys off generic shapes.** `scripts/memory-to-slice.mjs` (Phase 1 commit 4) operates on `docs/memory/<shard>.json` structure, not domain-specific assumptions.
5. **The Phase 0 reader rule describes the protocol generically, then names the instance.** When `compliance.instructions.md` is updated in Phase 1 commit 3, it says *"the slice manifest lookup"* first, *"in this repo, that is `docs/c-yard/`"* second.

### Self-check questions before merging any change in this directory

- Could I literally `cp -r docs/c-yard/ ../shipyard/docs/c-yard/` into a fresh repo and have the schema make sense without further edits?
- Are all paths in `fileFingerprints[].path` repo-relative (not absolute, no `C:\` or `/home/`)?
- Does any field name contain `worklog`, `resumsify`, `prisma`, `tiptap`, or other host-specific tokens? (Values: fine. Names: never.)
- Would this rule make sense to a hypothetical future tenant that has no `src/components/worklog/`?

If any answer is no, the change violates the Extractability NFR and must be reshaped before merging.

---

## How to author a new slice by hand

1. Pick a top-level UI surface (a route or major panel). G1 = UI-surface granularity. Rule of thumb: *if you can't navigate to it as a user, it's not a slice.*
2. Copy an existing slice as a template (`worklog-editor.json` is the canonical Phase 1 seed).
3. Fill in `entryPoints[]` for each sub-system inside the surface. A slice may grow past ~15 `fileFingerprints` before being split (promotion-by-growth, not pre-emptive splitting).
4. Author `traversalRecipes[]` from your own past traversal patterns — what questions did you actually answer about this surface this month? Recipes ARE the time-saving payload; missing recipes mean the agent falls back to codegraph + read_file each time.
5. List canonical files in `fileFingerprints[]`. Stamp `lastValidatedAt` to today's date.
6. Leave `staleSurfaces` as `[]`. The file-watcher daemon (Phase 4) populates it.
7. If this slice has cross-slice edges, add them to `_index.json` — never in the slice file.
8. Manual Phase 0 trial: open the slice file fresh and answer *"show me the X architecture"* using only what's there. If you have to fall back to codegraph or read_file for foundational questions, the slice is incomplete.

---

## How Phase 0 reads it (Phase 1 commit 3)

The Phase 0 lookup stack in `compliance.instructions.md` becomes, in this order:

0. **Workflow recipe check** (`docs/workflows/`) — unchanged.
1. **Slice manifest** (`docs/c-yard/<slice>.json` — this directory) — read FIRST when the request involves a known UI surface or sub-system. Includes the `staleSurfaces[]` warning emit.
2. **Memory graph** (`mcp_memory_*`) — falls through here only when no slice matches.
3. **Codegraph** (`codegraph_search` / `codegraph_context`) — for structural questions the slice didn't answer.
4. **`read_file`** — targeted line reads.
5. **`grep_search`** — exact text matches only.

Provisional G2 staleness policy: warn-and-serve. A slice with stale fingerprints emits *"⚠️ Stale surfaces in `<slice>`: [list of files]"* but the slice content is still served. Hard refusal policy deferred to Phase 1.5 after first-slice data shows actual churn rates.

---

## Roadmap status

- **Phase 1 commit 1** — schema doc + `worklog-editor.json` + empty `_index.json`. **Current commit.**
- **Phase 1 commit 2** — `scripts/analyze-chat-exports.mjs --mine-traversals <slice>` flag.
- **Phase 1 commit 3** — `compliance.instructions.md` Phase 0 lookup-stack update.
- **Phase 1 commit 4** — `scripts/memory-to-slice.mjs` migration script.
- **Phase 1 commit 5** — promotes ADR-0037 + ADR-0038 to Accepted after first slice round-trips through Phase 0.
- **Phase 1.5** — firm G2 fingerprint policy + G3 evidence schema based on real data.

See [docs/plans/shipyard-roadmap.md](../plans/shipyard-roadmap.md) for the full 6-phase plan and post-Phase-6 standalone-repo extraction trigger.
