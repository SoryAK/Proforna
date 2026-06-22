# 0046 — AI Chat Context-Awareness and Rich Actions

## Status

Accepted — 2026-06-22 (signed off after ADR-0045 deferred follow-ups landed in `bc13016`). Phase A is the next implementation slice; Phases B / C / D / B' are sequential and gated on their predecessors landing green.

## Context

ADR-0045 (Accepted 2026-06-21) shipped AI provenance UI across all 14 routes plus a 4-mode chat picker. The chat panel in [src/components/ai-chat.tsx](src/components/ai-chat.tsx) now exposes provider/model/usage and lets users pick a task class (chat / ground / reason / summarize).

What it still doesn't do, audited 2026-06-22 against [VS Code's chat panel](https://github.com/microsoft/vscode-copilot-chat) (now folded into `microsoft/vscode`, MIT):

1. **Show what context the AI is using.** `systemPrompt` is fetched from `/api/ai/context` and silently injected; the user can't see, edit, or remove individual context slices.
2. **Let users surgically pull entities into the prompt.** Users have to paste names or rely on `systemPrompt`'s implicit context. No way to say "look at this specific job."
3. **Discover the structured workflows the app supports.** Users have to know what to type. Slash commands (`/grill-me`, `/summarize-week`, etc.) are not exposed.
4. **Render markdown or act on code blocks.** Messages render via `<div className="whitespace-pre-wrap">` ([ai-chat.tsx#L588](src/components/ai-chat.tsx#L588)) — no markdown, no code-block detection, no copy/insert actions.
5. **Show provenance per turn cleanly.** The `AIProvenanceChip` ships but provenance is rendered as `via {provider}` inline text in the assistant turn ([ai-chat.tsx#L594](src/components/ai-chat.tsx#L594)).

User-initiated comparison with VS Code Copilot Chat identified the patterns above as the highest-leverage gaps. A literal source-copy was rejected (see Alternatives) — pattern adoption with re-implementation against shadcn + Tailwind is the chosen path.

### Griller questions resolved

1. **Bundle weight for markdown rendering.** User accepted the cost — markdown is a core foundation that will be heavy-use across the app. Go with full-fidelity `react-markdown` + `remark-gfm` + a real syntax highlighter (shiki or prism, locked in Phase D review).
2. **@-mention ranking signal.** Use "most frequently injected as AI context" — a counter incremented every time an entity ID is referenced inside a chat prompt. NOT view-count, NOT alphabetical.
3. **Multi-turn stateful slash commands** (`/interview-me`, `/test-me`, `/teach-me`). PARKED in [/memories/repo/parked-ideas.md](memories/repo/parked-ideas.md). They re-enter scope as orchestrators on top of a future Interview Practice / Teaching Mode feature, not as one-shot prompts. The slash command surface ships without them.

## Decision

**Ship as a 4-phase sprint, one E.T.C. cycle per phase, each phase landing as a single commit followed by a Memory Keeper write.** No phase blocks on a future phase except where explicitly noted (B' depends on C). Light UI polish folded into each phase.

### Phase A — Polish + Context Awareness

- **#1 Context chips above the input row.** Visual surface for the entity slices `systemPrompt` already collects. Pills are removable; removing one **suppresses that slice from the next system-prompt assembly** (chips are gates, not informational). Refactor `/api/ai/context` to return slices (`{ page, activeJob, activeWorklog, activeSkill, ... }`) and the chat panel composes the system prompt from the un-suppressed slices.
- **#4 Turn header with model badge + collapse.** Hoist the existing `AIProvenanceChip` out of inline text into a per-turn header pill. Add a chevron to collapse old turns (helpful for long threads).
- **#6 Stop button icon swap.** Already functional ([ai-chat.tsx#L632-640](src/components/ai-chat.tsx#L632)). Replace generic `X` with VS Code-style circular stop. ~5 LOC cosmetic.
- **#7 Streaming shimmer.** Pulse / blinking cursor on the active assistant turn while text streams in (distinct from the existing "Thinking..." spinner that shows while content is empty).

**Backend changes:** only the `/api/ai/context` slice refactor. **Estimated 2-3 days.**

### Phase B — Slash Commands (simple)

- **#2 Slash menu shell.** Triggered when `/` is the **first character** of the input (VS Code convention — avoids URL conflicts mid-string). Keyboard-navigable popover; arrow keys + Enter.
- **Commands shipping in B** (template-only, no parameters):
  - `/grill-me` — Socratic interrogation of current context
  - `/summarize-week` — assemble + summarize last 7 days of worklog
  - `/draft-bullets` — generate resume bullets from current context

Each simple command expands into a prompt template that the chat panel sends as the user message. **No backend changes.** **Estimated 1-2 days.**

### Phase C — @-Mention Picker + Entity Search Backend

- **#3 Mention popover.** Triggered on `@` keystroke. Keyboard-navigable. Inserts a pill into the input (visual) AND emits structured data into the outgoing prompt.
- **Entity scope (v1):** Jobs (`WorkHistory`), Skills (`SkillNode`), Worklog notes (`WorkLog`), Personas (`Contact`).
- **Ranking signal:** "Most frequently AI-context'd." New `EntityAIMentionCount` table — `{ userId, entityType, entityId, count, lastMentionedAt }` — incremented at chat-route time when a mention is parsed out of the prompt. Sort order: `count DESC, lastMentionedAt DESC`, fall through to alphabetical when both zero.
- **Backend route:** New `POST /api/ai/mention-search { type, q, limit }` returning `{ id, type, label, secondary, score }[]`. **Fork** from the existing `/api/work-logs/mention-search` (which is editor-scoped and ranks differently) rather than overloading it. Owner-scoped twice per [ADR-0028](0028-persona-contact-reverse-lookup.md) pattern (404 on cross-user entity, not empty).
- **Prompt serialization:** Mentions inject a JSON block into a hidden system message: `[{ type: "job", id: "abc", label: "Acme Corp" }, ...]`. UI shows the pill in the user message. AI sees both: the structured block (for context use) and the inline `[label]` reference. Human-readable transcripts + structured context — wins both halves of the Griller trade-off.

**Estimated 2-3 days.**

### Phase D — Markdown Renderer + Code-Block Toolbar + Domain Actions

- **Markdown foundation:** Replace `<div whitespace-pre-wrap>` with `react-markdown` + `remark-gfm` + `rehype-raw` + a syntax highlighter (shiki vs prism locked during Phase D review — shiki is server-rendered + theme-aware; prism is client-side + lighter; pick on bundle measurement).
- **#5 baseline:** Copy button on every fenced code block. Sticky on hover.
- **#5 differentiators (Resumsify-specific, baseline):**
  - **Send to Worklog** — opens the current worklog editor with the block prepended, or creates a new note if no active worklog.
  - **Add to Job Notes** — appends to the active job's notes field, or prompts for target if no active job (see target-picker rule below).
  - **Save as Bullet** — adds the block to the active job's bullets list.
- **Future-additive list (post-D):** more actions as the app grows. Each one is one new button + one mutation handler. Don't try to land them all in D — ship the three baseline ones and the framework so adding more is mechanical.

**Architectural call-out — target-picker pattern:** Actions resolve target by precedence:

1. **Ambient context** (the page the user is currently on).
2. **Most recent @-mention** of the matching type in the current chat thread.
3. **Popover picker** — only if (1) and (2) both fail.

This rule must be codified **once** in a `resolveActionTarget(action, threadContext, pageContext)` helper and reused across all three baseline actions and any future ones. Telemetry hook: track frequency of step-(3) picker-open; revisit the rule if it fires more than the user finds tolerable.

**Estimated 3-4 days.**

### Phase B' — Parameterized Slash Commands (after C)

- `/compare-jobs` — opens with two `@job` slots; user picks two via mention picker; sends comparison prompt.
- Composes Phase C primitives. **Estimated 0.5-1 day after C.**

## Alternatives Considered

- **Literal source copy from `microsoft/vscode-copilot-chat`.** Rejected. License is MIT-clear but the source is built on VS Code's internal DI / webview / theme-token / codicons stack. Lifting components means dragging in scaffolding that fights our shadcn + Tailwind + React 19 architecture. Translation cost ≈ rebuild cost. Patterns are not copyrightable; re-implementing from inspiration is the cheaper path.
- **Move model picker into the input row** (alternative #8 from the candidate list). Rejected. Conflicts with the mode picker shipped Day 3 of ADR-0045. Real estate cost too high for negligible UX gain.
- **Ship `/interview-me`, `/test-me`, `/teach-me` as one-shot prompts in Phase B.** Rejected. These are multi-turn stateful flows (ask question → wait for answer → grade → next question). Modeling them as template prompts gives a degraded experience and locks in the wrong shape. They re-enter scope after a future Interview Practice feature builds the multi-turn engine.
- **Reuse `/api/work-logs/mention-search` for the AI mention picker.** Rejected. The editor mention surface ranks by recency-in-the-current-note + alphabetical; the AI use case wants count-based "what does the user most often pull into AI context." Two different SLAs, two different routes is the cleaner seam.

## Consequences

### Pros

1. **Each phase ships independently.** A → B-simple → C → D → B'. Real revertable progress every 1-3 days. ADHD-friendly cadence + room for the user to course-correct after each ship.
2. **Phase A alone closes the biggest user-felt gap** (context transparency) without any backend work — fastest path to a visible upgrade.
3. **Phase D markdown foundation is reusable.** Once it lands, anywhere else in the app that needs to render AI output (worklog promotion review, resume review, future flows) inherits proper markdown for free.
4. **Patterns, not code.** Zero MIT-attribution debt accrued from VS Code; no upstream-churn risk; no scaffolding fighting our stack.
5. **Slash + mention seam is extensible.** Both surfaces compose: B' shows the pattern; future Interview/Teaching features plug into B' the same way without needing their own chat surface.

### Cons / Trade-offs

1. **Bundle weight in Phase D.** `react-markdown` + `remark-gfm` + `shiki` adds ~200-400KB depending on highlighter choice. User explicitly accepted this trade-off because chat is core. **Mitigation:** lazy-load the chat panel itself (it's already client-only, already conditionally mounted on `open`); markdown deps land in the chat chunk, not the main route bundle.
2. **Phase C requires a schema migration.** `EntityAIMentionCount` is a new Prisma table. **Mitigation:** purely additive; default rank without any rows is safe (everything ranks 0, falls through to alphabetical/recent).
3. **Mention serialization shape (JSON in system message + label inline) is unverified across all 4 task classes.** Could leak structured tokens into providers that handle hidden system blocks differently. **Mitigation:** hermetic Phase C test asserting the JSON block reaches the router but does NOT appear in the rendered UI message body. Run against all 4 modes in the live smoke.
4. **Phase D target-picker rule has UX ambiguity at the edges.** "Add to Job Notes" with no active job AND no recent @job mention WILL open a picker. Some users will find that interrupts flow. **Mitigation:** ship with telemetry on picker-open frequency; revisit the precedence rule if it fires too often.
5. **`/interview-me` / `/test-me` / `/teach-me` are parked** — users who saw the original framing may ask "where are they?" — answer: they re-enter scope as orchestrators when the Interview Practice feature ships. Documented in parked-ideas.md.
6. **Phase A chips-as-gates is a real refactor of `/api/ai/context`**, not a UI bolt-on. Today the route returns one big `systemPrompt` string; making slices removable means returning them as `{ slices: [...] }` and composing client-side. That ripples into any consumer of `/api/ai/context` (check before Phase A code).

## Parked (Cross-References)

- **Multi-turn slash commands** — see [/memories/repo/parked-ideas.md](memories/repo/parked-ideas.md) entry "VS Code-inspired chat — multi-turn slash commands."
- **Model picker in input row** — would conflict with mode picker.
- **Tool-use disclosure cards** — only relevant if/when we add agent tools.
- **Multi-turn diff / checkpoint UI** — chat doesn't mutate files in Resumsify.
- **Additional code-block actions beyond the three baseline** — future-additive list, one new mutation per addition.

## Cross-references

- [ADR-0044](0044-ai-task-router.md) — `ai.generate` task router that ADR-0045 mode picker drives.
- [ADR-0045](0045-ai-provenance-and-mode-picker-ui.md) — provenance envelope + mode picker (the foundation this builds on).
- [ADR-0028](0028-persona-contact-reverse-lookup.md) — owner-scoped reverse-lookup pattern reused for `/api/ai/mention-search`.
- [src/components/ai-chat.tsx](src/components/ai-chat.tsx) — surface being upgraded across all 4 phases.
- [src/components/ai-provenance-chip.tsx](src/components/ai-provenance-chip.tsx) — chip lifted into turn header in Phase A.
- `/api/ai/context` — slice refactor in Phase A.
- `/api/work-logs/mention-search` — pattern reference (not extension target) for the new `/api/ai/mention-search` in Phase C.
