# Workflow: Decompose a God File via Phased Hook + Sibling Extraction

**Workflow Type slug:** `decompose-god-file`

When a single client component crosses ~600 LOC and owns mixed concerns
(state, effects, fetch, JSX), Architectural Guardrail says split it.
This recipe is the proven phased approach validated 2026-06-23 on
`src/components/ai-chat.tsx` (1026 → 281 LOC, −72%).

## Stack Context

- Next.js 16 + React 19 (client components only — Server Components are out of scope here).
- Vitest baseline must be green BEFORE starting (the refactor has no new tests; the existing suite is the regression net).
- TanStack Query v5 if data fetching is involved.
- base-ui (NOT Radix) for DropdownMenu / Select.

## Successful Sequence (8 phases, one commit per phase)

Each phase is a single E→T→C cycle: **Execute → Test (`get_errors` + `npm test`) → Commit**.
Browser smoke is deferred to the END (single comprehensive smoke after phase N−1).

1. **Phase 0 — Stabilize the baseline.** Run `npm test 2>&1 | Select-Object -Last 6` and confirm green. If any infrastructure issue blocks compilation (e.g. dangling CSS imports), fix that FIRST as its own commit before touching the god file.

2. **Phase 1 — Extract constants and types.** Pull `interface`, `const ARRAY = [...]`, magic numbers, and module-singleton tables into `src/lib/<feature>-constants.ts`. No behavior change. This phase is the cheapest LOC win and the lowest-risk warm-up — it confirms your imports + test wiring before risking logic moves.

3. **Phases 2 through N — Extract one self-contained hook per commit.** Order by RISK ASCENDING:
   - First: pure presentation chrome (resize/open/close — these are state + effects, no I/O).
   - Next: read-only data hooks (TanStack Query wrappers — easy to verify against network tab).
   - Then: domain-logic hooks that own derived state and callbacks.
   - LAST: the highest-risk hook (typically the streaming/I/O pipeline — async + abort + stale closures).
   For the highest-risk hook, do a Griller round BEFORE writing it:
   - "How does the hook get the latest messages without re-creating sendMessage on every chunk?" (answer: `messagesRef` pattern, set on every render, read inside the callback so the dep array drops `messages`).
   - "Does the hook OWN state or RECEIVE it as params?" (Path A: hook owns. Path B: parent owns, hook gets setter. The convention here is Path B — keeps the parent in control of cross-cutting state shared with siblings).
   - "What does the abort path look like?" (an `abortRef = useRef<AbortController | null>(null)` + `stopStreaming` callback that calls `abortRef.current?.abort()`).

4. **Phase N−1 — Extract sibling components.** Once all hooks are out, the god file's remaining JSX is the last bloat. Split each visually-bounded region into a `<FeatureXxx>` sibling component under `src/components/<feature>-*.tsx`. Common cuts: EmptyState, MessageList, SettingsPanel, Toolbar, ContextChips, SlashMenu (or analogues for your domain). Do these in ONE commit, not one per component — the LOC delta is huge and intermediate states won't compile.

5. **Phase N — Slice manifest refresh.** Bump `lastValidatedAt`, `lastValidatedCommit`, and `refreshHistory[]` in `docs/c-yard/<slice>.json`. Retire the "god-file trap" entry and replace it with the new architectural guardrail (e.g. "new behavior goes in a sibling hook under src/hooks/use-<feature>-*.ts"). Add all new files to `fileFingerprints`. Validate the JSON with `node -e "JSON.parse(require('fs').readFileSync('docs/c-yard/X.json','utf8'))"`.

## First-Attempt Failures

- **JSX-region replacement in one shot is doomed.** Replacing all 5 JSX regions in a single multi-edit call accumulates context errors and the regex/string matches drift mid-call. **Do one region per `multi_replace_string_in_file` call**, verifying the file LOC drops as expected after each.

- **Orphan tails after partial replacements.** If you replace a region's OPEN but the CLOSE is elsewhere (e.g. you swap `<div className="mt-1.5...">...` for `<ToolbarComponent />` but the inner body and its closing tags trail after the new component's `/>`), you'll get a phantom orphan tail that breaks compilation in a confusing way. After each region replacement, scan `Get-Content X | Measure-Object -Line` — if LOC went DOWN by less than expected, you have an orphan. Use a node one-liner to slice the file: `$content.IndexOf(marker) → substring + tail-truncation → fs.writeFileSync`.

- **`get_errors` BEFORE all 6 regions are wired is noise.** The intermediate states reference dropped symbols. Don't run `get_errors` mid-extraction; run it once at the end of phase N−1.

- **`npm test` mid-wiring is also noise.** Same reason. Run once at the end.

- **PowerShell variable bleed across commit pattern.** The pattern `$msg = "..."; $msg | Out-File ...; git commit -F` reuses the same `$msg` across phases and the OLD value contaminates the NEW commit message (Phase 3 of the original refactor hit this). **Use a UNIQUE variable name per commit** (e.g. `$msgP3`, `$msgP4`, `$msgP5`).

- **Single-inline commit pattern is mandatory.** Multi-line PowerShell with `git commit -m "..."` triggers quote-escape hell on OneDrive-synced repos. The proven pattern:
  ```pwsh
  git add <files>; $msgP7 = @"
  commit subject

  body paragraph 1.

  body paragraph 2.
  "@; $msgP7 | Out-File -Encoding utf8 .git/CMSG; git -c gc.auto=0 commit -F .git/CMSG; Remove-Item .git/CMSG; git log --oneline -1
  ```
  The `gc.auto=0` flag dodges the OneDrive y/n loop. The commit lands BEFORE the loop fires.

- **Browser smoke per phase is wasteful.** Each phase has the same vitest regression net; per-phase browser smoke catches nothing that a final end-to-end smoke wouldn't catch faster. **Single comprehensive smoke at the end** (panel renders, all surfaces interactive, one real I/O round-trip if applicable). User explicitly chose this pattern 2026-06-23.

## Gotchas

- **Hook signature convention (Path B).** For hooks that need parent-owned state that other siblings also read, accept `{ state, setState }` as params. Mirror state into an internal `useRef` for stable-closure callbacks. The `useAiChatStream` hook is the canonical example.

- **Composable keydown handlers return `boolean`.** Hooks that intercept keys (`useAiChatSlash`) expose `handleSlashKey: (e: KeyboardEvent) => boolean` — returning true if the event was consumed, false to let the parent handle it. The parent composes inside its own `handleKeyDown`.

- **TS LSP staleness.** `get_errors` can report clean while a prop-shape mismatch is hiding (esp. across newly-extracted boundaries). After the final wiring, verify the parent's `<ComponentName ... />` callsite prop names match the component's `interface Props` declaration manually. Don't trust a clean `get_errors` alone for first-wire-ups.

- **Single-shard memory write.** When the refactor produces a durable architectural shape (hook contracts, composition rules), write ONE shallow `<Feature>Architecture` entity to the closest existing memory shard (don't proliferate shards). Use `mcp_memory_open_nodes` to confirm absence FIRST, then `create_entities`. Always mirror to `docs/memory/<shard>.json` + add the entity to `docs/memory/index.json` shards map.

## Last Updated

2026-06-23 (validated on `src/components/ai-chat.tsx` — commit `34a0f5c`,
1026 → 281 LOC across 8 phases. End-to-end smoke green:
deepseek-r1:32b via Ollama returned 1103 chars in 101.0s with full
markdown rendering, provenance chip hydrated, and context-slice
plumbing verified against profile data.)
