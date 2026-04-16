# Feature: Experience Diffusion Model (EDM)

## Overview

The Experience Diffusion Model treats each work-history role as a **diffusion source** that radiates exposure outward through four concentric zones — similar to Gaussian splattering in 3D rendering. Instead of listing discrete skills, it models the **blast radius** of a job: core skills at the center, with knowledge gradually fading through adjacent, contextual, and ambient layers.

The metaphor: drop a stone in water. The splash is your direct skill use. The ripples are the processes you observed, the departments you interacted with, and the industry knowledge you absorbed by osmosis.

- **Routes**: `/skill-graph` (visualization lives inside the skill graph page)
- **Components**: `src/components/skill-graph.tsx` (rendering, toolbar, detail panel)
- **API endpoints**: `POST /api/skill-graph/edm` (generate), `GET /api/skill-graph/edm` (accumulated field), `GET /api/skill-graph/edm?workHistoryId=xxx` (per-role splat), `GET /api/skill-graph/edm?sources=1` (list available roles)
- **Prisma models**: `DiffusionExposure` (zone, intensity, category, exposureType → linked to User, WorkHistory, SkillNode)
- **Math library**: `src/lib/edm.ts`

---

## Core Concepts

### The Four Zones

Each role radiates through four zones with decreasing base intensity:

| Zone | Base Intensity | What It Captures | Example |
|------|---------------|-------------------|---------|
| **CORE** | 1.0 | Skills you used daily, hands-on | Python, React, equipment assigned |
| **NEAR** | 0.7 | Adjacent things you observed or participated in | Skills gained, your major, adjacent processes |
| **MID** | 0.4 | Contextual interactions | Department, milestones, team accomplishments |
| **FAR** | 0.15 | Ambient knowledge through osmosis | Industry norms, company size context, compliance |

### Tenure Factor

Longer tenure = deeper penetration into outer zones.

```
tenure_factor = min(1, months / 24)
```

| Tenure | Factor | Interpretation |
|--------|--------|----------------|
| 6 months | 0.25 | Touched CORE, barely reached NEAR |
| 12 months | 0.50 | Solid CORE + NEAR, some MID |
| 24+ months | 1.0 | Full penetration through all zones |

### Effective Intensity

```
effective_intensity = base_intensity × tenure_factor
```

A NEAR-zone skill at a 12-month job: 0.7 × 0.5 = 0.35

### Accumulated Intensity (Diminishing Returns)

When multiple roles expose you to the same concept, intensities stack with diminishing returns:

$$I_{acc} = 1 - \prod_{i}(1 - I_i)$$

Two roles each contributing 0.7 → `1 - (0.3 × 0.3) = 0.91`

This prevents intensity from exceeding 1.0 and models the real-world pattern where the first exposure matters most.

### Exposure Categories

| Category | SkillNode Type | Description |
|----------|---------------|-------------|
| `skill` | technical | Hard/soft skills |
| `process` | process | Workflows, methods, schedules |
| `role_exposure` | role_exposure | Adjacent roles observed |
| `equipment` | tool | Hardware/tools assigned |
| `domain_concept` | domain | Field-specific knowledge |
| `industry` | industry_concept | Industry-level context |

### Exposure Types

How the person encountered the concept:

- **direct** — hands-on daily use (CORE zone)
- **observed** — watched others do it (NEAR zone)
- **collaborated** — worked alongside (MID zone)
- **ambient** — absorbed through environment (FAR zone)

---

## Zone Classification (What Goes Where)

### From WorkHistory records:
| Field | Zone | Category | Exposure Type |
|-------|------|----------|---------------|
| `skillsUsed` | CORE | skill | direct |
| `skillsGained` | NEAR | skill | observed |
| `major` (education) | NEAR | domain_concept | direct |
| `department` | MID | role_exposure | collaborated |
| `milestones` | MID | process | collaborated |
| `accomplishments` | MID | process | direct |
| `companySize` | FAR | industry | ambient |
| `workMode` | FAR | process | ambient |
| `scheduleType` | FAR | process | ambient |

### From CurrentPosition records:
| Field | Zone | Category | Exposure Type |
|-------|------|----------|---------------|
| `techStack` | CORE | skill | direct |
| `equipment` | CORE | equipment | direct |
| `department` | MID | role_exposure | collaborated |
| `industry` | FAR | industry | ambient |

---

## Visualization

### Accumulated View (default)
When "Intensity" is toggled on, every node in the skill graph is sized and colored by its accumulated intensity across all roles:
- **Size**: 4–16 range proportional to intensity
- **Color**: Warm gradient — amber (high) to blue (low)
- Non-exposed nodes remain at base size/color

### Per-Role Splat View
When a specific role is selected via the "Role Splat" dropdown or "View Splat" button on an occupation:
- Nodes are colored by their **zone** in that role: amber (CORE), blue (NEAR), purple (MID), gray (FAR)
- Nodes not in the selected role's blast radius dim to 15% opacity
- Zone-colored outer rings appear on affected nodes
- Tooltips show zone name + intensity percentage

### Transferable Skills
When "Transferable" is toggled on:
- Skills appearing in 2+ roles get amber highlighting + glow ring
- Non-transferable skills dim to 25% opacity
- Detail panel shows a "Transferable" badge

### Legend Panel
When EDM data exists, the legend shows:
- Zone color key (CORE/NEAR/MID/FAR)
- Total exposure nodes count
- Transferable skills count
- Source roles count

---

## Data Flow

```
WorkHistory + CurrentPosition records
        │
        ▼
  POST /api/skill-graph/edm
        │
        ├── Classify fields into zones
        ├── Create SkillNodes for new concepts
        ├── Compute effective_intensity per zone × tenure
        └── Write DiffusionExposure records
                │
                ▼
  GET /api/skill-graph/edm
        │
        ├── (default) Accumulated field across all roles
        ├── (?workHistoryId=xxx) Per-role splat data
        └── (?sources=1) List of available roles
                │
                ▼
  skill-graph.tsx renders with intensity/zone coloring
```

---

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] At least 2 work history entries with different skills
- [ ] Current position data with tech stack + equipment

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Click "Diffusion Map" button | Toast shows nodes/exposures created, Intensity view activates | ⬜ |
| 2 | Toggle "Intensity" on | Nodes resize + recolor by accumulated intensity | ⬜ |
| 3 | Toggle "Transferable" on | Multi-role skills glow amber, others dim | ⬜ |
| 4 | Open "Role Splat" dropdown | Lists all work history entries with diffusion data | ⬜ |
| 5 | Select a specific role | Graph recolors by zone (amber/blue/purple/gray), unrelated dims | ⬜ |
| 6 | Click "Show All (Accumulated)" | Returns to accumulated view | ⬜ |
| 7 | Click an occupation → "View Splat" | Activates splat for that role's matching work history | ⬜ |
| 8 | Click a skill node with EDM data | Detail panel shows intensity bar, source count, zone badges | ⬜ |
| 9 | Hover a node in splat mode | Tooltip shows zone name + intensity % | ⬜ |
| 10 | Toggle Intensity off | Splat clears, graph returns to normal | ⬜ |

### Edge Cases
- [ ] User with no work history — Generate should handle gracefully
- [ ] Single role — no transferable skills expected
- [ ] Overlapping skills between work history and current position — should merge
- [ ] Very short tenure (< 1 month) — tenure factor near 0, minimal FAR penetration

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
| 1 | View Splat on occupation relies on title/company substring matching to find workHistoryId | 🟡 medium | Click occupation whose title doesn't match any work history label | 2026-04-15 |
| 2 | Splat sources query fires only when Intensity is toggled on — "View Splat" on occupation won't show if Intensity is off | 🟢 low | Click occupation while Intensity is off | 2026-04-15 |

---

## Role Instance Topology (Planned)

### Problem

Occupations in the graph today are **category nodes** (one per O*NET SOC code). A person who held "Technical Support Engineer" at three different companies sees one hexagon — losing the per-company timeline and the fact that each stint had a different blast radius.

### Architecture: Collapsible Hierarchical Grouping

Role instances form a **three-level tree** that collapses and expands:

```
COLLAPSED (default)
  ⬡ Technical Support Engineer (3)     ← one node, badge shows instance count
  ⬡ Manufacturing Eng Tech (1)         ← single instance, no expand needed

EXPANDED LEVEL 1 (click to expand)
  ⬡ Technical Support Engineer
     ├── TA Instruments
     ├── Dell
     └── HP

EXPANDED LEVEL 2 (click company to see timeline + splat)
  ⬡ Technical Support Engineer
     ├── TA Instruments
     │   └── May 2025 — Dec 2027  (2yr 7mo)  [SPLAT]
     ├── Dell
     │   └── Jan 2028 — Feb 2031  (3yr 1mo)  [SPLAT]
     └── HP
         └── Mar 2031 — Present   (ongoing)   [SPLAT]
```

### Grouping Key

The grouping key evolves through three tiers of sophistication:

| Tier | Method | Grouping Key | Cost | Accuracy |
|------|--------|-------------|------|----------|
| **1 — SOC code** | O*NET occupation mapping | `socCode` (e.g., 15-1232) | Free (already built) | High for standard roles |
| **2 — String similarity** | Levenshtein + token overlap | Normalized title | Free (local compute) | Catches abbreviations/variations |
| **3 — Semantic embedding** | Embed role description + responsibilities, cluster by cosine similarity | `clusterId` | API cost per embedding | Catches entirely different titles with same function |

**Build order**: Tier 1 first (SOC codes are the backbone), Tier 2 for obvious variations, Tier 3 as the long-term play.

### Identity Model

| Level | Identity Key | What It Represents |
|-------|-------------|-------------------|
| Title group | SOC code (Tier 1) or semantic cluster (Tier 3) | The *type* of role |
| Company branch | `workHistory.company` | Where the role was held |
| Instance (leaf) | `workHistoryId` | The actual stint — the diffusion source |

**Same title + different company** = different instance under same group.
**Same title + same company + different dates** = separate instances (promotion cycles, rehires).

### Detail Panel for Role Instance

When a leaf instance is selected, the detail panel shows:

- **Title @ Company**
- **Timeline bar**: `startDate ———— endDate` with duration
- **Tenure factor**: computed value (e.g., 1.0 = full depth)
- **Zone breakdown**: collapsible sections for CORE / NEAR / MID / FAR with skill counts and names
- **Actions**: `[View Splat]` to activate per-role splat on the graph, `[Compare]` (future: diff two instances)

### Relationship to Existing Occupations

Role instances **coexist** with O*NET occupation nodes:

- **O*NET occupations** = the categorical/market layer (SOC codes, requirements, bright outlook data)
- **Role instances** = the personal/experiential layer (actual jobs held, with timeline and diffusion data)
- They connect: a role instance links to its parent occupation via SOC code or title match
- The occupation requirements show what the market expects; the role instance shows what you actually touched

### Title Synonym Engine (Future — Tier 3)

Companies label the same function differently. The synonym engine will:

1. **Embed** the role description, job objective, and responsibilities from each WorkHistory entry
2. **Cluster** embeddings by cosine similarity (threshold TBD, likely 0.85+)
3. **Assign** a canonical group label (most common title in the cluster, or the O*NET title)
4. **Store** the cluster ID on each WorkHistory for fast grouping

Use cases:
- "Customer Success Manager" + "Client Relationship Lead" + "Account Manager" → same cluster
- "Software Engineer" + "Software Developer" + "Programmer" → same cluster
- Same embeddings can feed the Career Direction Model later

### Implementation Phases

| Phase | Work | Status |
|-------|------|--------|
| A | Include WorkHistory data in graph API response (id, title, company, dates) | Not started |
| B | Group work histories by occupation SOC code (Tier 1 grouping) | Not started |
| C | Render role instance nodes in graph (collapsed/expanded states) | Not started |
| D | Detail panel for role instances (timeline, tenure, zone breakdown) | Not started |
| E | Wire instance click → per-role splat (uses existing `?workHistoryId` endpoint) | Not started |
| F | String similarity fallback for ungrouped instances (Tier 2) | Not started |
| G | Semantic embedding + clustering (Tier 3) | Not started |

---

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-04-15 | Phase 1-5: Prisma model, math lib, generate + accumulated API | — |
| 2026-04-15 | Phase 6-7: Node sizing, intensity coloring, transferable highlighting, toolbar buttons, detail panel | — |
| 2026-04-15 | Per-role splat: API endpoint, Role Splat dropdown, View Splat button, zone-colored rendering | — |
| 2026-04-15 | Clear Graph: DELETE endpoint + toolbar button with confirm dialog | — |
| 2026-04-15 | Documented Role Instance Topology plan (hierarchical grouping, 3-tier matching, implementation phases) | — |
