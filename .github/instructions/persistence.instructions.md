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
- **Staleness discipline:** Tag every observation with the current date. If this session touched a domain heavily, scan that domain's existing memory entities and mark stale ones before writing new ones.
- **Write protocol:**
  1. `mcp_memory_create_entities` — domain name, file, kind
  2. `mcp_memory_create_relations` — "calls", "depends-on", "implements", "mounts-via-portal"
  3. `mcp_memory_add_observations` — curated conclusions with date tag
  4. **Shard backup:** After writing to MCP graph, update the corresponding shard file in `docs/memory/`. Check `docs/memory/index.json` to find the right shard. Append new observations to the entity's `observations` array. Commit the shard file with the session commit.
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
- **CRITICAL:** At the start of any new session, your first priority is to locate and read the **most recent** file in `docs/handoffs/` and summarize it.
