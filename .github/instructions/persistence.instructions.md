---
applyTo: "**"
---

# Persistence & Institutional Knowledge Skills

### Skill: ADR Author
- DO NOT write an ADR until the "Architectural Reviewer" or "The Griller" skill has reached a final conclusion.
- Once a decision is reached, propose creating a new ADR file in `docs/adr/`.
- The ADR must follow this strict format:
  1. **Title:** Sequential number and short title (e.g., `0004-choice-of-db.md`)
  2. **Status:** Always start as `Proposed` unless the user says `Accepted`
  3. **Context:** Summarize the conversation and the "Grilling" questions covered
  4. **Decision:** The final choice made
  5. **Consequences:** At least two "Pros" and two "Cons/Trade-offs"
- You are forbidden from editing old ADRs. If a decision changes, create a NEW ADR and mark the old one as `Superseded by ADR XXX`.

### Skill: Manual Engineer
- Use this skill whenever a new feature is successfully implemented.
- Create or update a file in the `.Manual/` folder following this "Industry Manual" template:
  1. **Feature Name:** Clear, non-technical title
  2. **Functional Description:** What does this feature do for the end-user?
  3. **Internal Workflow:** Step-by-step logic path (e.g., User clicks X → Script Y runs → Database Z updates)
  4. **Configuration/Params:** Any settings, grid sizes, or constants that control this feature
  5. **Known Constraints:** What can this feature NOT do?
- The Manual must be written so that a human engineer or a fresh AI can understand the ENTIRE system without reading the source code.

### Skill: Memory Keeper
- **Trigger:** Any session where codegraph was traversed and non-obvious conclusions were reached.
- **Timing:** Run in Phase 4 BEFORE the Handoff Architect writes the session log.
- **What to write to memory graph:**
  - Domain entry points discovered (e.g., "WorklogEditor is the primary entry point for worklog")
  - Architectural gotchas (e.g., "draft flush has a race condition if editor unmounts before debounce fires")
  - Non-obvious dependencies (e.g., "WorkHistoryPanel mounts BioCardEditor via portal into asideHost")
  - Design intent that codegraph cannot derive
- **What NOT to write:** Line numbers, specific values, function signatures codegraph already has, implementation details.
- **Staleness discipline (HARD GATE):** Tag every observation with the current date. For every domain touched this session, you MUST verify whether the entity already exists in the memory graph before deciding whether to create or update it. Verification protocol:
  1. **Primary check (canonical name known):** `mcp_memory_open_nodes(["DomainName"])` — exact-match lookup; the only reliable way to confirm presence/absence. Domain canonical names are listed in `docs/memory/index.json`.
  2. **Discovery check (canonical name unknown):** `mcp_memory_search_nodes("singletoken")` — the upstream `searchNodes` is patched to AND-tokenize whitespace-split queries (see `scripts/patch-mcp-memory.js`), so multi-word queries now work, but single-token queries are still the most robust starting point. Treat search as discovery, not as the verification gate.
  3. **NEVER** infer "graph is empty" from a `search_nodes` result of zero hits. Always confirm with `open_nodes` before concluding an entity is absent.
- The Memory Graph Status line in the handoff must show the actual `open_nodes` (or, when discovering, `search_nodes`) tool call result. Writing "no new entities warranted" or "nothing to update" without showing that result is a compliance failure, identical in severity to skipping the Post-Edit Scan.
- **Write protocol (read-then-write, never blind):**
  1. **Gate every write with `open_nodes`** — `mcp_memory_open_nodes([entityName])` returns the entity if present, empty list if not. This is the only reliable existence check; never infer existence from a `create_entities` response.
  2. **If the entity exists** (open_nodes returned it):
     - `mcp_memory_add_observations` — append new curated conclusions with date tag. Skip if no new observations this session. Calling without prior `open_nodes` confirmation is forbidden — `add_observations` throws on missing entities.
     - `mcp_memory_create_relations` — idempotent (server-side dedupes by from+to+relationType). Safe to call; emits only new edges.
  3. **If the entity does NOT exist** (open_nodes returned empty):
     - `mcp_memory_create_entities` — pass `entityType` plus the initial observations baked in. Verify the response contains your entity name. An empty response means a concurrent write created it; switch to step 2 (`add_observations`) for any observations not in the initial payload.
     - `mcp_memory_create_relations` — same as above.
  4. **Shard backup:** After the MCP write, append the same observations to the entity's `observations` array in `docs/memory/<shard>.json`. If this is a new entity, also add the `EntityName: shard.json` line to `docs/memory/index.json`'s `shards` map. Commit the shards with the session commit.
- **Forbidden write patterns:**
  - Calling `create_entities` first to "see if it exists" — it silently dedupes by name and returns only the actually-created entities. An empty response is ambiguous (all dupes vs. all created elsewhere) and must never be interpreted as "entity is missing."
  - Calling `add_observations` without an `open_nodes` confirmation in the same session.
  - Treating `create_entities`'s response shape as a presence signal of any kind.
- **Rebuild protocol:** If MCP graph is ever wiped, read `docs/memory/index.json` → for each shard file, run `mcp_memory_create_entities` then `mcp_memory_create_relations` to restore.
- **Shallow graph rule:** Only write domain/component-level entities, not individual function-level nodes. Shallow graph = durable graph.

### Skill: Workflow Logger
- **Trigger:** Called by the Handoff Architect at Phase 4 when a non-trivial multi-step workflow was completed this session (e.g. adding a Prisma model + migration + route + hook, wiring a new UI feature end-to-end, setting up a new integration).
- **NOT triggered by:** single-file edits, config tweaks, bug fixes under 3 steps, or pure refactors.
- **Output:** Create or UPDATE a file in `docs/workflows/` named by workflow type slug (e.g. `add-prisma-model-route.md`, `wire-tiptap-extension.md`). One file per workflow type — update it if it already exists, never duplicate.
- **Recipe format:**
  1. **Workflow Type:** Short slug + human title
  2. **Stack Context:** Libraries and versions involved (e.g. Prisma v6, Next.js 16 Route Handler, TanStack Query v5)
  3. **Successful Sequence:** Numbered steps in the order that worked
  4. **First-Attempt Failures:** What was tried first and exactly why it failed
  5. **Gotchas:** Non-obvious constraints, ordering requirements, or env quirks
  6. **Last Updated:** Date of this session
- **Authority level:** ADVISORY — these recipes are starting points, not hard rules. The agent may deviate for good reason but must acknowledge the recipe and state why it is diverging.

### Skill: Handoff Architect
- **Trigger:** Use this skill ONLY when the user says "Wrap up," "Session End," or "Handoff."
- **Pre-requisite:** Before writing the handoff doc, invoke **Workflow Logger** if a non-trivial multi-step workflow was completed this session.
- **File Management:**
  1. Create a NEW file for every session in `docs/handoffs/`
  2. **Naming Convention:** `YYYY-MM-DD_HHmm_handoff.md` (e.g., `2026-05-28_1700_handoff.md`)
  3. Never overwrite previous handoffs; they serve as the project's chronological memory
- **Content Requirements:**
  1. **Current Sprint:** The high-level goal we are working toward
  2. **Last Completed Step:** Exactly what was achieved in this specific session
  3. **The "Live" Context:** Specific variables, active logic paths, or line numbers currently "warm" in memory
  4. **Next Immediate Step:** The exact sentence/prompt to use to resume work
  5. **Unresolved Blockers:** Bugs, missing info, or technical debt left open
  6. **UI Graph Status:** List every `.github/ui/` file read and updated by the UI Graph Keeper this session. If the Keeper ran and found nothing new, state: *"UI Graph Keeper audited [files read] — no new tokens or patterns introduced."* The word "none" is forbidden here.
  7. **Memory Graph Status:** List every entity written or updated by the Memory Keeper this session. If Memory Keeper ran and wrote nothing, state: *"Memory Keeper audited session — no new entities warranted."* The word "none" is forbidden here.
  8. **Workflow Review Cadence:** Read `docs/chat-exports/analysis/workflow-reviews.json`, compute `daysSinceLastReview = floor((now - max(reviewedAt)) / 86400000)`, and report:
     - `< 7` days → *"Workflow Review Cadence: ✅ on cadence — N days since last review."*
     - `7-14` days → *"Workflow Review Cadence: ⚠️ DUE — N days since last review. Recommend running session-self-review next session before new feature work."*
     - `> 14` days → *"Workflow Review Cadence: 🚨 OVERDUE — N days since last review. Strongly recommend a workflow-improvement sprint before further feature work."*
     - File missing/empty → *"Workflow Review Cadence: no review on file yet — recommend establishing a baseline via session-self-review."*
     If THIS session performed a workflow review (i.e. ran `scripts/analyze-chat-exports.mjs` and shipped resulting rule edits), you MUST also append an entry to `docs/chat-exports/analysis/workflow-reviews.json` BEFORE writing the handoff doc, with shape `{ reviewedAt: <ISO timestamp>, sessionId: <current session id>, summary: "<1-line>", ruleEditsShipped: ["<file>:<rule-slug>", ...], commits: ["<sha>", ...] }`. The file is gitignored (lives under `docs/chat-exports/`) so the append is a local-only write — no commit required.
- **Phase 4 Composite Gate:** The Handoff doc may only be written **after** Memory Keeper has run in the same response (or has been explicitly waived by the user for that session). "Memory Keeper ran" means a visible `mcp_memory_*_open_nodes` tool call appears in this response — claim text alone is not proof. Without that tool call, the Handoff doc must not be saved and the response must include the line: *"Phase 4 gate failed: Memory Keeper did not run — handoff deferred."* Audit data (2026-06-19): only 28.6% of sessions across the 21-transcript review wrote to memory despite the pipeline mandating it. This gate exists to flip that ratio.
- **CRITICAL:** At the start of any new session, your first priority is to locate and read the **most recent** file in `docs/handoffs/` and summarize it.
