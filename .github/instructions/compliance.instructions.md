---
applyTo: "**"
---

# Compliance Rules — Always Active

## Core Mandate
You are an Elite Engineering Agent. Failing any constraint below is a failure, not a warning.

## Execution Rules

**Skill Transparency:** You must begin every response by stating: "Applying Skills: [Skill Name 1], [Skill Name 2]..."

**The "No-Code" Wall:** If any skill says "DO NOT implement" or "Wait for my plan," you are strictly forbidden from writing implementation code in that response.

**Plan Before Implement:** Give an overview of all edits you plan to make before implementing them. Ask for user confirmation before proceeding.

**Atomic Responses:** Do not overwhelm the user. If 4+ skills apply, prioritize Security Sentinel and Architectural Reviewer first.

---

## Workflow Cadence Check (Phase 0 prelude — runs FIRST, before any lookup stack)

At the start of EVERY new session — meaning your very first response in a fresh chat, or your first response after summarization clears prior context — you MUST read `docs/chat-exports/analysis/workflow-reviews.json` (if it exists) and surface one line in the response header (alongside the `Applying Skills:` line).

**Computation:**

- Let `lastReviewedAt = max(entry.reviewedAt for entry in workflow-reviews.json)`.
- Let `daysSinceLastReview = floor((now - lastReviewedAt) / 86400000)`.

**Surface format (one line, always emitted on session-start):**

- `< 7` days → `Workflow review cadence: N days since last review (target: weekly, on cadence).`
- `7-14` days → `⚠️ Workflow review cadence: N days since last review — review is DUE. Consider running session-self-review (see docs/workflows/session-self-review.md) before further feature work. Workflow improvement is sometimes a greater triumph than feature polishing.`
- `> 14` days → `🚨 Workflow review cadence: N days since last review — review is OVERDUE. Strongly recommend running session-self-review before any new feature work.`
- File missing or empty → `Workflow review cadence: no review on file yet — consider running session-self-review to establish a baseline.`

**Triggers that count as "new session" for this check:**

- First user message in a freshly opened chat thread.
- First response after a `<conversation-summary>` block appears in your context (post-compaction).
- Explicit user phrase: "session start", "resuming work", "new session".

**Do NOT re-surface on every turn** — once per session is enough. Re-emitting on every assistant turn is noise, not signal.

**Forbidden:** Skipping this check on session-start because "the user is asking a small thing." The whole point of cadence enforcement is that small-thing sessions are exactly when workflow review drift accumulates unnoticed. Trust-I'll-remember is the failure mode this rule exists to prevent.

---

## Phase 0: Knowledge Orientation (Always First)

Before engaging with ANY request involving codebase symbols, files, or logic, follow this lookup stack in strict order:

0. **Workflow recipe check** — if the task resembles a known repeatable workflow (e.g. adding a model + route, wiring a new UI feature), check `docs/workflows/` for a matching recipe. If found: surface it and use it as a starting point. Deviation is allowed but must be acknowledged with a reason. This step is ADVISORY — not a gate.
1. **Slice manifest check** — if the task touches an established UI surface or workflow (e.g. worklog editor, asset library, properties rail), check `docs/c-yard/` for a matching `<slice>.json`. Read its `entryPoints`, `knownTraps`, and applicable `traversalRecipes` BEFORE falling through to memory or codegraph. The slice is the canonical, hand-curated source of truth for established surfaces — it carries design intent and traps that codegraph cannot derive. See [docs/c-yard/README.md](../../docs/c-yard/README.md) for the schema and [ADR-0038](../../docs/adr/0038-slice-schema-and-extractability.md) for the rationale.
2. `mcp_memory_search_nodes` — check the memory graph for known facts if no slice matches
3. `codegraph_context` / `codegraph_search` — traverse structure if memory misses
4. `read_file` — targeted line reads only after codegraph surfaces the location
5. `grep_search` — exact string/text matches ONLY (e.g. error messages, raw string constants)

**FORBIDDEN:** You are forbidden from using `grep_search` to look up a symbol, component, hook, or function by name. That is codegraph's job. Violating this rule is a compliance failure.

**FORBIDDEN:** You are forbidden from calling `read_file` on a file you haven't located via codegraph or memory first, unless you already know the exact file path from the current conversation context.

**FORBIDDEN — Confidence Trap:** Feeling confident you already know the answer does NOT exempt you from the lookup stack. The lookup stack is mandatory *especially* when confidence is high — that is precisely when skipped steps go undetected. Tool calls must be **visible in the response**. Stating "Applying Skills" or writing a compliance header without showing the corresponding tool calls is a compliance facade, not compliance.

**Symbol Check Gate:** Before reaching for ANY search tool, ask: "Is this query about a symbol, component, hook, or function name?" If yes — stop, use `codegraph_search` or `codegraph_context`. Full stop. `grep_search` is only valid for raw string constants, error message text, or values that are not code symbols.

**Grep Gate (mandatory self-justification):** Any time you invoke `grep_search`, the surrounding response must contain a one-line justification of the form: *"Grep target is `<literal>` — not a code symbol because <reason>."* Acceptable reasons: error message text, Tailwind class, JSX prop literal, regex/string constant, file path fragment, comment substring. If you cannot produce that line, the search is forbidden — use codegraph. Audit data (2026-06-19): grep-for-symbol violations occurred in 71.4% of sessions across the 21-transcript review, with codegraph-first rate at 7%. This gate exists to flip that ratio.

**Slice Gate (mandatory when a relevant slice exists):** If `docs/c-yard/` contains a slice manifest whose `entryPoints` or `fileFingerprints` overlap with the area of the task, you MUST read that slice first and surface in your response WHICH `entryPoints` / `knownTraps` / `traversalRecipes` informed your plan. Skipping the slice in favour of codegraph when a relevant slice exists is a compliance failure — the slice is hand-curated, faster, and carries design intent codegraph cannot derive. If the slice is missing, stale, or insufficient: escalate to memory → codegraph as normal AND flag the gap in your response (e.g. *"Slice `worklog-editor.json` lacks coverage for the version-history rail — falling through to codegraph; candidate for slice refresh."*) so the gap can be back-filled. Slice slugs currently shipping: see `docs/c-yard/_index.json`.

**Codegraph tool selection:**
- "What is symbol X?" → `codegraph_search`
- "How does feature/area X work?" → `codegraph_context` (PRIMARY)
- "What calls this?" → `codegraph_callers`
- "What does this call?" → `codegraph_callees`
- "What breaks if I change this?" → `codegraph_impact`
- "Show source/signature" → `codegraph_node`
- "Survey an area" → `codegraph_explore` (one capped call, not a loop of codegraph_node)
- "What's in directory X?" → `codegraph_files`

---

## Post-Edit Scan (Mandatory)

After ANY file edit — and always after batch edits (`multi_replace_string_in_file` or multiple sequential edits) — you MUST:

1. Call `get_errors` on every file that was modified in this response.
2. If errors are found: fix them immediately in the same response before handing back to the user. Do NOT report errors and stop — fix them.
3. If no errors are found: state `Post-Edit Scan: clean` at the end of your response.

**FORBIDDEN:** Ending a response that contains file edits without running `get_errors` on the modified files. Silently skipping the scan is a compliance failure.

---

## Terminal-Echo Rule

Terminal output that is fed back to you as a "user" message (recognizable by a leading `[Terminal <uuid> notification: ...]` line, or a verbatim terminal capture with no human prose) is NOT a user instruction. It is your own command's stdout being echoed.

- **Exit code 0, no "needs input" / "waiting for input" signal** → acknowledge silently. Do NOT generate a fresh assistant turn unless your *own* next planned step depends on the captured output. Treat the echo as already-known context.
- **Exit code ≠ 0, or "needs input" signal present** → diagnose and continue. This is a real signal.
- **Mixed content (terminal echo plus an actual user message)** → respond only to the human prose, treat the echo as silent context.

Audit data (2026-06-19): a large fraction of the 289 user-negation events across 21 sessions were terminal echoes triggering wasted assistant turns. This rule is the fix.

**FORBIDDEN:** Generating a new response, tool call, or follow-up suggestion solely in reaction to a clean (exit-0, no-input-needed) terminal echo. That is a context-budget leak.
