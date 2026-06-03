# Feature Request: Conversation Context Management for GitHub Copilot Chat

**Category:** Chat UX / Developer Productivity  
**Audience:** GitHub Copilot team, VS Code Copilot extension team  

---

## TL;DR

AI coding sessions are session-based by nature, but Copilot Chat treats the context window as a passive scroll buffer with two nuclear options: compact or clear. This proposal introduces **context management** — a first-class system for pruning, pinning, snapshotting, and persisting conversation context as structured work product. The core primitive is the **Session Frame**: a bounded, named, exportable unit of context that can be versioned in git, distilled into memory graphs, handed off between agents, and measured with analytics. Tier 1 (selective pruning + pinned turns) can ship independently. The full system closes the loop that currently leaks knowledge at every session boundary.

---

## The Problem

Every AI coding session degrades over time — not because the model gets worse, but because the **context window fills with noise it can't ignore**.

Three failure modes, same root cause, different scales:

### 1. The Nuclear Reset (catastrophic)
Context fills mid-task. The only options are "Compact" (lossy summarization you can't control) or "Clear" (wipe everything). You lose the live reasoning — the exact variable names, the half-formed plan, the last error message that was about to be relevant. The mental model you've been building across 40 turns vanishes. You start over.

### 2. The Noise Problem (chronic)
Old, irrelevant turns stay in context indefinitely. An early brainstorm about a feature you pivoted away from. A debugging detour that went nowhere. A UI decision that was reversed two turns later. The model can't distinguish "this was overruled" from "this is still true." It confidently reasons from stale context you've mentally discarded.

### 3. The Dead-End Problem (silent)
You explore a direction. It doesn't work. You backtrack — but the failed attempt is now permanently woven into your context. There's no way to say "ignore everything from turn 22 onward and try a different approach." You either live with the contamination or reset everything.

### 4. The Lookup Waste Problem (invisible)
An agent runs `semantic_search` across your entire codebase, or calls an MCP tool that fetches 200 records from a database. That result is injected into the context window once — and then it's gone. Next session, next task, same topic: the agent runs it again. And again. And again. There is no way to say "you already did this lookup; reuse the result." Every session starts from zero, burning tokens and time on work that was already done.

**These aren't four bugs. They're one missing primitive: context management.**

---

## Proposed Solution

Treat the conversation context window as a **first-class, user-manageable object** — not a passive scroll buffer that you periodically nuke.

Borrow the mental model that already works for managing evolving state under complexity: **version control**.

But go further. Developers don't just manage code state — they manage **session state**. Every non-trivial coding session has a natural shape: a start, a focus area, a set of discoveries, and an end. That shape is already captured implicitly in the chat transcript. The proposal is to make it explicit — to give that shape a name, an interface, and a persistence layer.

---

## The Session Frame Model

Developers naturally code in sessions. There's a "start session" moment and an "end session" moment, and everything in between forms a **frame** — a bounded unit of context with a purpose, a topic, and a set of outcomes.

Frames are already how developers communicate. Handoff documents are manually written frames. Session logs are informal frames. Sprint retrospectives are curated frames. The cognitive overhead of maintaining all of this by hand is enormous — and entirely avoidable if the tooling understood that sessions have structure.

### What is a Frame?

A frame is a named, bounded segment of a conversation with:
- A **start boundary** (explicit or inferred from topic shift)
- An **end boundary** (session end, checkpoint, or user-defined)
- A **topic label** (`worklog-search`, `auth-bug`, `db-schema-refactor`)
- A **status** (`active`, `closed`, `archived`, `exported`)
- A **set of outcomes** — key decisions, code changes, file paths touched, tool results produced

The session currently produces all of this data implicitly. The feature request is to surface it explicitly.

### Frame Operations

| Operation | What it does |
|-----------|-------------|
| **Export** | Serialize the frame to a portable format (JSON, Markdown, structured YAML). Send it to another agent, another tool, or a file. |
| **Compact** | User-directed summarization of a frame: keep the outcomes, discard the reasoning trail. Compaction is always scoped and always previewed before applying. |
| **Prune** | Remove specific turns from a frame without compacting. Surgical, non-destructive. |
| **Archive** | Close a frame without deleting it. It leaves the active context window but remains searchable and reloadable. |
| **Import** | Inject a previously exported frame (or part of one) into a new session's context. |
| **Merge** | Combine the outcomes of two frames into a single context object — e.g., merge "auth-redesign" frame findings into the "dashboard-rebuild" frame. |
| **Extract to Memory** | Distill a frame's key entities, decisions, and file paths into a persistent memory graph that survives session reset. |

### Frame-Based Handoffs

Today, AI-assisted developers manually write handoff documents at the end of sessions to preserve context for the next one. These documents are essentially manually authored frames.

With first-class frame support, the handoff becomes **automatic**:
- Session ends → frame is closed and serialized
- Frame includes: topic, decisions made, files touched, open questions, tool results cached
- Next session starts → agent loads the frame as its opening context, not a blank slate
- Frame can be passed to a **different agent entirely** — allowing clean task handoffs between specialized agents without context loss

This isn't just a convenience. For teams using multiple AI agents (one for backend, one for frontend, one for review), frames are the **native inter-agent communication protocol**.

---

## Feature Breakdown

### 1. Checkpoints (Snapshots)
> *"Commit" the current state of the conversation.*

- User can mark any point in the conversation as a named checkpoint: `checkpoint: "before refactor"`, `checkpoint: "working login flow"`.
- Checkpoints are visible in a side panel or inline in the chat as labeled markers.
- Restoring a checkpoint restores the model's effective context to that moment — subsequent turns are not deleted, just excluded from the context window.
- This is non-destructive. History is preserved; what's *fed to the model* is scoped.

### 2. Selective Turn Pruning
> *"Stage" specific turns for removal from the context window.*

- Right-click any turn → "Remove from context" — the message stays in the visual history (grayed out) but is excluded from future requests.
- Multi-select: prune a range of turns at once (e.g., a debugging detour that's now resolved).
- "Prune resolved" shortcut: automatically gray out any turns where the user followed up with "ok, ignore that" or "never mind."
- Pruned turns are visually distinct but never permanently deleted — they can be re-added to context at any time.

### 3. Pinned Turns
> *"This turn always stays in context, no matter what."*

- Pin any turn — a key architectural decision, a confirmed constraint, a snippet that must be referenced.
- Pinned turns are immune to compaction, pruning, and scroll-off.
- Shown in a dedicated "Active Context" panel so you can see exactly what the model always knows.
- Maximum pin count enforced by token budget (shown as a live indicator).

### 4. Branches
> *"Explore a dead-end without polluting the main thread."*

- "Branch from here" — creates a parallel conversation that shares all turns up to that point but diverges from that moment forward.
- Branch is labeled and switchable from a tab or dropdown.
- Branches can be abandoned (archived) or **merged back** — cherry-pick specific turns from the branch into the main thread.
- Enables: "let me try approach B without losing approach A."

### 5. Turn Annotations
> *"Teach the model what this turn means."*

- Annotate any turn with a status tag: `✅ Resolved`, `⚠️ Overruled`, `📌 Key constraint`, `🚧 In progress`, `❌ Dead end`.
- Annotations are optionally injected as a preamble to every request: *"Note: the following earlier decisions have been overruled: [turns 12, 18, 31]."*
- This is lightweight semantic context — no new tokens consumed by restating the content, only by naming the status.

### 6. Tool Result Caching (Topic-Scoped Lookups)
> *"You already did this lookup. Reuse it."*

This is one of the most overlooked sources of token waste in agentic workflows.

When an agent runs an expensive tool — a full codebase semantic search, an MCP database query, a web fetch, a dependency graph traversal — that result is injected into context once, used, and then lost. The next session that touches the same topic re-runs the tool from scratch.

**Proposed behavior:**
- Any tool call result can be marked as **"cached for topic"** — e.g., `topic: auth-module`.
- When a new task arrives that matches the topic, the agent is offered the cached result before re-running the tool.
- Cache entries have a TTL (configurable: by session, by commit SHA, by date, or manual invalidation).
- Cached results are shown in the Active Context panel with a label: `📦 Cached: codebase-scan (auth) — 2026-06-01`.
- The agent can reason over cached lookups without re-executing the underlying tool, cutting both latency and token cost.

**Example:**
An agent ran `codegraph_context` across the worklog module and produced a 3,000-token result. That result is now cached under topic `worklog`. Every subsequent worklog task this session — or across sessions, if the commit SHA hasn't changed — can reference the cached result instead of re-running the graph traversal.

This is **topic-scoped ambient context**: the agent knows the territory without having to rediscover it.

---

## UX Sketch

```
┌─────────────────────────────────────────┐
│  COPILOT CHAT                       ⚙️  │
├──────────────┬──────────────────────────┤
│ ACTIVE CTX   │                          │
│              │  [Turn 1] user: ...      │
│ 📌 Turn 3    │  [Turn 2] assistant: ... │
│ 📌 Turn 14   │  ━━━━ checkpoint: "v1"   │
│              │  [Turn 3] 📌 ...         │
│ CHECKPOINTS  │  ...                     │
│              │  [Turn 22] ░ (pruned)    │
│ ✓ "v1"       │  [Turn 23] ░ (pruned)    │
│ ✓ "auth ok"  │  ━━━━ checkpoint: "auth" │
│              │  [Turn 24] user: ...     │
│ BRANCHES     │  [Turn 25] assistant:... │
│              │                          │
│ main ●       │  > _                     │
│ try-yjs      │                          │
└──────────────┴──────────────────────────┘
```

---

## Git as the Persistence Layer

Frames are data. Data belongs in version control.

### Frames as Git Artifacts

- When a session frame is closed and exported, it is committed to the repository as a structured artifact — e.g., `.copilot/sessions/2026-06-02_auth-redesign.frame.json`.
- The frame file contains: topic, status, timestamps, the full turn log (or a compacted summary), tool results cached, file paths touched, decisions recorded, open questions.
- The frame is committed at the same time as the code changes it produced — creating an **unbreakable link between the conversation and the commit**.
- `git log` shows both the code diff and the reasoning that produced it. `git blame` gains a new dimension: not just who changed a line, but **what conversation led to that change**.

### Frame → Commit Linkage

```
git log --frames  (hypothetical)

  2c4f2ba  feat(auth): implement OAuth flow
           Frame: .copilot/sessions/2026-06-02_auth.frame.json
           Topic: auth-redesign | Turns: 38 | Tool calls: 4 cached
           Key decisions: [JWT over session cookies, RS256 signing]
           Open at close: [refresh token rotation — deferred]

  1dae6b6  refactor(db): normalize user schema
           Frame: .copilot/sessions/2026-05-31_db-refactor.frame.json
           Topic: db-schema | Turns: 22 | Tool calls: 6
```

This isn't just provenance. It's **institutional memory** — the reasoning behind every decision, automatically preserved alongside the code.

### Session Resume from Git

- Checking out an older branch? The frame files from that branch's sessions are available.
- An agent can be instructed: "load the frame from when we last worked on this branch" and resume with the same context that produced the original code — without reading the entire codebase from scratch.
- This is the difference between "here's the code" and "here's the code and here's why it works this way."

### Memory Graph Extraction

Frames are the raw material for persistent memory graphs.

- On session close (or on demand), a frame can be **distilled into a memory graph** — extracting domain entities, key decisions, file paths, and architectural observations.
- These memory nodes persist across sessions, across branch switches, across team members.
- The memory graph is the compressed, structured, always-available form of every frame ever closed.
- When a new session starts, the agent doesn't load raw frames — it loads the memory graph for the relevant topic, which is small, dense, and token-efficient.

```
Frame (raw, 8,000 tokens)
  → Distill
    → Memory graph nodes (300 tokens):
       - "auth module uses RS256 JWT, refresh rotation deferred"
       - "UserSchema normalized 2026-05-31, migration in 20260531_normalize_users.sql"
       - "OAuth callback at /api/auth/callback, handler in src/app/api/auth/route.ts"
```

This is the **closed loop**: sessions produce frames, frames produce memory, memory seeds the next session's context — without any manual handoff writing.

---

## Automated Context Pipelines

Once frames are first-class objects with a defined schema, developers can build **automated systems** around them — pipelines that treat context as a data product.

### Automated Pruning

- A post-session pipeline reads the closed frame and applies pruning rules: remove turns tagged `❌ Dead end`, remove tool call responses beyond a configurable token threshold, remove duplicate reasoning chains.
- Result: a lean, pruned frame that preserves outcomes without preserving the path — ready for handoff or memory extraction.
- Rules are configurable per-project (`.copilot/pruning-rules.json`) and can be tuned by the user or auto-learned from their manual prune history.

### Automated Extrapolation for Reusability

- A pipeline scans closed frames for **reusable patterns** — repeated tool calls, frequently referenced file paths, recurring architectural questions.
- These patterns are promoted to a "project knowledge base" that's injected at session start for relevant topics, without the user doing anything.
- Example: every session that touches the `auth` module automatically opens with the last 3 key decisions from the `auth` memory graph — zero token overhead, maximum relevance.

### Inter-Agent Routing

- A frame can be exported and **handed off to a specialized agent** — e.g., the backend agent closes its frame, exports it, and the frontend agent imports just the API contract section as its opening context.
- This makes multi-agent workflows composable: each agent works in its own context frame, and frames are the handoff protocol between them.
- No agent needs the full conversation history of another. It gets the **extracted interface** — the decisions and outputs that are relevant to its domain.

### Example Pipeline (developer-defined)

```yaml
# .copilot/pipelines/on-session-close.yaml
on: session.close
steps:
  - prune:
      remove_tagged: [dead-end, overruled]
      max_tool_result_tokens: 1000
  - extract_memory:
      topics: auto-detect
      destination: .copilot/memory/
  - commit_frame:
      path: .copilot/sessions/
      message: "chore(context): close session — {topic}"
  - notify:
      if: open_questions > 0
      message: "Session closed with {open_questions} unresolved items"
```

---

## Context Analytics

Once frames are serialized and stored, they become a **data source** — and context becomes measurable.

### Metrics That Become Possible

| Metric | What it tells you |
|--------|------------------|
| **Tokens per session by topic** | Which areas of the codebase are most expensive to work in |
| **Tool call repetition rate** | How often the same lookup is run across sessions (measures caching opportunity) |
| **Prune rate by turn type** | What kinds of turns are most often removed — signals noisy prompt patterns |
| **Dead-end ratio** | What fraction of explored paths are abandoned — proxy for task clarity |
| **Frame-to-commit density** | How many sessions it takes to produce a commit — proxy for task complexity |
| **Memory hit rate** | How often an opened session finds relevant memory nodes vs. starts cold |
| **Context freshness** | How old (by commit SHA or date) the cached tool results being used are |
| **Handoff gap** | Time between session close and the next session that opens the same frame — measures context decay risk |

### Why This Data Matters

For individual developers: these metrics surface **their own inefficiency patterns**. If your dead-end ratio spikes every time you work on a particular module, that module has a clarity problem — not a code problem.

For teams: aggregate context analytics reveal **organizational knowledge debt** — the modules where every developer starts from scratch every session, burning tokens on lookups that should be in shared memory.

For tooling builders: context metrics enable **adaptive context management** — the system learns what to pin, what to prune, and what to cache based on observed patterns across sessions, not just per-request rules.

### Privacy and Data Ownership

This data is sensitive. It contains reasoning trails, failed approaches, and decision context that developers may not want shared broadly.

- **Local by default**: frame files and analytics live in the repository (or a local `.copilot/` folder), not in a cloud service unless explicitly opted in.
- **User-controlled export**: no frame data leaves the machine without an explicit export action.
- **Opt-in aggregation**: team-level analytics require explicit opt-in at the repository level.
- **Redaction support**: before committing a frame to git, a user can redact specific turns or fields (API keys accidentally pasted, personal notes, etc.).

---

## Why This Matters Beyond One User

This isn't a power-user feature. It's the **missing layer** between "AI pair programmer" and "AI collaborator."

Today, every non-trivial AI-assisted work session requires the user to manually maintain their own external context — handoff documents, session notes, re-pasting key snippets at the start of new conversations. This is cognitive overhead that defeats the purpose of the tool. Developers have built entire custom systems to compensate: memory MCP servers, handoff markdown conventions, `.instructions.md` files, prompt templates that reconstruct context at session start. **The tooling has forced users to become their own context managers.**

Long sessions are where the highest-value work happens: architectural decisions, complex debugging, iterative design. These are also the sessions most likely to exhaust the context window and produce the most valuable frames. The users who need Copilot most — the ones building complex things over multiple sessions — are penalized most by the lack of context management.

Session-based development is how software is actually built. Every sprint is a session. Every feature branch is a frame. Every PR description is a manually written frame summary. The gap is that the tooling treats all of this as informal — text written by the developer, disconnected from the conversation that produced it. Making it formal closes that gap entirely.

**The primitive already exists in every other tool that manages evolving state: version control, undo history, layers in design tools, breakpoints in debuggers.** Conversations are state. State deserves management.

---

## Implementation Tiers

Proposing in ascending complexity so the team can ship incrementally:

| Tier | Features | Complexity |
|------|----------|------------|
| **Tier 1** — Surgical Control | Selective turn pruning + pinned turns | Low — UI-side context filtering before request |
| **Tier 2** — Snapshots | Named checkpoints + restore | Medium — serialize context state, store per-session |
| **Tier 3** — Session Frames | Bounded named frames + export/import/compact | Medium-High — frame schema, frame operations, frame panel UI |
| **Tier 4** — Tool Result Caching | Topic-scoped lookup caching + TTL management | Medium — instrument tool call results, cache with invalidation |
| **Tier 5** — Git Integration | Frame → commit linkage, frame artifacts in repo | High — git hook integration, `.copilot/sessions/` schema |
| **Tier 6** — Memory Extraction | Frame → memory graph distillation | High — extraction pipeline, memory graph API |
| **Tier 7** — Automated Pipelines | Developer-defined post-session YAML pipelines | High — pipeline runner, configurable rules, inter-agent routing |
| **Tier 8** — Context Analytics | Metrics dashboard, adaptive context management | Very High — data pipeline, aggregation, privacy controls |
| **Tier 9** — Branching | Branch + annotate + cherry-pick merge | Very High — conversation graph, not just a linear array |

Tier 1–2 alone eliminate the Nuclear Reset and Noise problems. Tier 3–4 eliminate the Lookup Waste problem. Tier 5–6 close the handoff loop. Tier 7–9 are the platform.

---

## Prior Art / Analogues

- **Git** — the foundational mental model for managing evolving state with branching, commits, and annotation. Frames are to conversations what commits are to code.
- **Jupyter Notebooks** — cells as named, reorderable, re-runnable units of reasoning. Frames extend this to conversational turns.
- **Photoshop History panel** — non-destructive editing with named snapshots; prune without losing the original.
- **Debugger breakpoints** — pin specific execution points for repeated inspection; cache the state at that point.
- **Obsidian Canvas** — spatial arrangement of ideas that were previously linear; topic-scoped ambient context.
- **Redis / Memcached** — TTL-based caching of expensive computation results. Topic-scoped tool result caching applies the same principle to agent lookups.
- **GitHub Actions** — developer-defined automation pipelines triggered by lifecycle events. The post-session pipeline is the same primitive applied to conversation lifecycle.
- **Linear / Notion** — structured work items with provenance and history. Frames formalize the same structure for AI conversations.

None of these solve the AI chat context problem directly — but the user intuition for "checkpoint, branch, prune, pin, cache, pipeline" is already widely established across tools developers use every day. This proposal extends familiar patterns into a new medium.

---

## Closing

The context window is the most constrained resource in an AI-assisted workflow, and today it's managed entirely by the model — not the user. Giving users first-class control over what the model knows, when it knows it, and what it should forget is not a quality-of-life improvement.

But this proposal is larger than context window management. It's about what happens when you treat a conversation not as a chat log, but as **structured work product** — something that can be versioned, persisted, searched, handed off, measured, and automated around.

Developers have been session-based workers since the first terminal. AI coding tools should be session-aware. Frames are the unit. Git is the persistence layer. Memory is the compressed intelligence. Pipelines are the automation surface. Analytics are the feedback loop.

The full system closes a loop that currently leaks knowledge at every session boundary: from conversation → frame → memory → next session's context. No manual handoffs. No token waste on repeated lookups. No dead reasoning contaminating live context. No institutional knowledge trapped in chat logs that no one can search.

When that loop closes, it's the difference between a tool you use and a system that learns — not by training, but by remembering.

---

*Draft by Sory Kaba — 2026-06-02*  
*Related: VS Code Copilot Chat, GitHub Copilot, AI pair programming, context window management, agentic workflows, session-based development, memory graphs, automated context pipelines*
