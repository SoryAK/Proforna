# Skill Graph Revamp — Development Plan

> **Status:** Proposed — pending sprint scheduling
> **Created:** 2026-05-23
> **Owner:** Sory
> **Inspiration:** [Understand-Anything](https://github.com/Lum1104/Understand-Anything) (visualization & UX patterns only — not adopting as a tool)
> **Related ADRs:** TBD (one per accepted decision below)

---

## 1. Context & Motivation

The current `/skill-graph` feature is functionally rich but is built around a single **3,303-line** `src/components/skill-graph.tsx` god-file plus a 632-line analytics companion. It already uses `react-force-graph-2d` (D3 force simulation on canvas), so the underlying rendering tech is solid — what's missing is a modern UX layer.

Understand-Anything (21.6k★ Copilot plugin for codebase understanding) demonstrates several UX patterns that translate well to a personal skill/career graph:

- Color-coded layer/community legends
- Force layout + alternate "domain flow" view
- Fuzzy + semantic search across nodes
- Guided tours / onboarding
- Click-to-summary side panel with LLM-generated plain-English explanations
- Diff/impact view (what changed → what it affects)

We are **not** adopting their plugin or graph format. We are borrowing UX patterns onto our existing graph.

---

## 2. Hard Blocker (must come first)

**`skill-graph.tsx` at 3,303 lines violates the Architectural Guardrail.** No new features land in this file. A refactor into a modular folder is a non-negotiable prerequisite for everything below.

---

## 3. Proposed Module Structure (Sprint 0 deliverable)

```
src/components/skill-graph/
  index.tsx                          ← orchestrator (~150 lines)
  hooks/
    use-graph-data.ts                ← TanStack Query + transforms
    use-graph-layout.ts              ← D3 force config, position memo
    use-graph-selection.ts           ← selected node + URL sync
    use-graph-filters.ts             ← layer toggles, search state
  views/
    force-view.tsx                   ← <ForceGraph2D> render (~300 lines)
    career-flow-view.tsx             ← NEW horizontal/layered view
    analytics-view.tsx               ← migrated from skill-graph-analytics.tsx
  panels/
    node-detail-panel.tsx            ← right-side panel on selection
    layer-legend.tsx                 ← color-coded legend
    search-bar.tsx                   ← fuzzy + (later) semantic
    guided-tour-launcher.tsx
  lib/
    node-styling.ts
    layer-grouping.ts
    diff.ts
  types.ts
```

**Constraint:** every file < 600 lines. Each subfolder enforces single responsibility.

---

## 4. Sprint Breakdown

### Sprint 0 — Refactor (foundation)
**Goal:** zero user-facing change; pure structural split.
**Tasks:**
- [ ] Inventory all responsibilities currently inside `skill-graph.tsx`
- [ ] Extract hooks (`use-graph-data`, `use-graph-layout`, `use-graph-selection`, `use-graph-filters`)
- [ ] Move force-graph render into `views/force-view.tsx`
- [ ] Migrate `skill-graph-analytics.tsx` into `views/analytics-view.tsx`
- [ ] Pure functions into `lib/`
- [ ] Wire orchestrator `index.tsx`
- [ ] Snapshot/visual regression: confirm `/skill-graph` and `/career-growth` evidence deep-link still work
- [ ] Delete legacy files

**Acceptance:** Lighthouse + manual smoke pass; no file > 600 lines; HMR remains fast.
**Risk:** state hoisting bugs around force simulation reheat (we already documented position-preservation logic — preserve verbatim).
**ADR:** none needed (pure refactor) unless we change render lib.

---

### Sprint 1 — Visual & Findability Wins
**Goal:** instant "this looks better and is easier to scan" payoff.
**Tasks:**
- [ ] **Layer legend overlay** — color-coded chips, click to toggle layer visibility
- [ ] **Color tightening** — normalize palette per layer (Tech / Business / Soft / Tools / Domains)
- [ ] **Fuzzy search bar** (top-left) using `fuse.js` over `{name, aliases, layer}`
- [ ] Selecting a search result pans + zooms to node
- [ ] Empty-state illustration when graph has < 5 nodes
- [ ] Persist last-used layer toggles in `localStorage`

**Acceptance:** User can find any skill node in < 5 seconds; legend reflects actual graph contents dynamically.
**No LLM cost.**
**ADR candidate:** "Adopt fuse.js for client-side skill search" (lightweight, justify vs semantic).

---

### Sprint 2 — Career Flow Alternate View
**Goal:** second lens on the same data — horizontal left→right DAG showing Skills → Occupations → Goals.
**Tasks:**
- [ ] View toggle in toolbar: `Force | Flow | Analytics`
- [ ] Layered DAG layout (Dagre or ELK) in `views/career-flow-view.tsx`
- [ ] Edge color encodes evidence strength
- [ ] Click node in flow view → same `node-detail-panel`
- [ ] Maintain selection state across view switches

**Acceptance:** Toggling Force ↔ Flow keeps selected node highlighted; flow view renders in < 500ms for a typical graph (≤ 200 nodes).
**ADR candidate:** "Dagre vs ELK for layered career graph layout" (trade-off table required).

---

### Sprint 3 — Node Detail Panel + LLM Summaries
**Goal:** click a skill → understand *why it matters in your career arc*.
**Tasks:**
- [ ] Right-side `node-detail-panel.tsx` (collapsible, ~360px)
- [ ] Show: evidence count, linked occupations, recent activity, related skills
- [ ] **LLM-generated narrative** ("Why this matters for your trajectory")
  - Cache per `(skillId, profileVersion)` in DB (new `SkillNarrative` table)
  - Generated lazily on first click; regenerated when profile changes materially
  - Use existing Gemini integration in `api/skill-graph/ingest`
- [ ] Loading skeleton; offline fallback to plain stats
- [ ] Deep-link: `/skill-graph?node=<id>&panel=open` → opens panel on load

**Acceptance:** Click → panel open < 100ms; narrative streams in < 2s on cache miss; cache hit instant.
**Cost guardrail:** estimate $X/user/month at 10 nodes/session; cap regeneration to once per 24h per node.
**ADRs needed:**
- "SkillNarrative cache schema & invalidation strategy"
- "LLM cost ceiling for skill-graph features"

---

### Sprint 4 — Guided Tour / Onboarding
**Goal:** solve the "I opened this view after 2 months and forgot what I'm looking at" pain.
**Tasks:**
- [ ] First-time visitor modal: 4-step intro (force layout / layers / search / view toggle)
- [ ] **Career path walkthroughs**: predefined tours like "Show me how my skills ladder up to a Senior Engineer role" — animates camera + highlights nodes in sequence
- [ ] Persist "completed tour" in user prefs
- [ ] Trigger replay from a `?` button in toolbar

**Acceptance:** New user can complete intro tour in < 60s; tour state survives navigation.
**Library candidate:** `driver.js` or `shepherd.js` (evaluate in trade-off table).

---

### Sprint 5 — Diff / Impact View (stretch)
**Goal:** "what changed since last sync, and what does it affect?"
**Tasks:**
- [ ] Use existing `sync-profile` + `auto-evidence` activity logs as source-of-truth
- [ ] Highlight added/removed/strengthened nodes + edges since user-selected timestamp
- [ ] Sidebar: bullet list of "X new evidence for Skill Y → improved fit with Occupation Z by N%"
- [ ] Date picker for "compare against"

**Acceptance:** Diff renders for a typical graph in < 1s; clear visual differentiation (added=green pulse, removed=ghosted, strengthened=thicker edge).
**ADR candidate:** "Diff computation: client-side vs server pre-computed snapshots."

---

## 5. Out of Scope (explicit rejections)

- ❌ **Persona-adaptive UI** (junior / PM / power user modes) — wrong mental model for a personal career tool with a single user persona.
- ❌ **Multi-agent LLM pipeline** for analyzing the graph — overkill cost & complexity; targeted single-call summaries are sufficient.
- ❌ **Replacing `react-force-graph-2d`** — current engine is fit for purpose; no migration cost justified.
- ❌ **Sharing/export of graph as JSON file** — privacy concerns, not asked for.

---

## 6. Sequencing & Sizing (rough)

| Sprint | Effort (sessions) | User-Visible Impact | LLM Cost |
|---|---|---|---|
| 0 — Refactor | 2 | None (foundational) | $0 |
| 1 — Visual + search | 1-2 | High | $0 |
| 2 — Career flow view | 2 | High | $0 |
| 3 — Detail panel + LLM | 2-3 | Very high | Monitored |
| 4 — Guided tour | 1-2 | Medium-high | $0 |
| 5 — Diff view | 2 | Medium | $0 |

**Total:** ~10-13 focused sessions across 5 sprints.

---

## 7. Open Questions (resolve before Sprint 0 kickoff)

1. Are we committing to the modular folder structure in §3, or proposing alternatives first?
2. For Sprint 3 LLM narratives — Gemini (already integrated) or evaluate alternatives?
3. Do we want a "share read-only graph snapshot" mode for mentors/coaches? (Was explicitly rejected above — confirm.)
4. Should the analytics view stay in this codebase or get its own `/skill-graph/analytics` route?

---

## 8. References

- Current god-file: `src/components/skill-graph.tsx` (3,303 lines)
- Current analytics: `src/components/skill-graph-analytics.tsx` (632 lines)
- Skill graph API surface: `src/app/api/skill-graph/**`
- Page entry: `src/app/(app)/skill-graph/page.tsx`
- Deep-link source: `src/app/(app)/career-growth/page.tsx` (line ~332)
- Nav entry: `src/lib/constants.ts` (line ~95)
- Inspiration: https://github.com/Lum1104/Understand-Anything
