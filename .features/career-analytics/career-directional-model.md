# Feature: Career Directional Model (CDM)

## Status: Planned

## Vision

The Career Directional Model is a **standalone intelligence system** that maps where a user is, where they're going, and every viable path between. It's not a job search tool — it's the brain that *feeds* job search.

Most job seekers are locked into a single title: "I'm looking for a Controls Technician job." They miss the 50 listings titled "Automation Technician," "PLC Tech," or "Systems Integration Specialist" that require identical skills. They also don't realize their skills already qualify them for 3-4 adjacent roles they've never considered.

CDM solves this with three pillars:
1. **Skill Decomposition Tree** — Break any target role into skill domains, then show which domain combinations unlock which careers
2. **Title Synonym Intelligence** — Map the semantic identity of roles across companies and industries
3. **Position Mapping** — Show the user where they sit on the tree today and what moves are available

Once CDM knows the user's plan, it feeds the Job Search auto-search pipeline with expanded queries, synonym-enriched keywords, and growth-employer targeting.

---

## The Pipeline

```
User's Current Skills + Experience
  → CDM Skill Decomposition (what domains do you cover?)
    → Position Mapping (where are you on the tree?)
      → Path Generation (what roles are reachable from here?)
        → Title Synonym Expansion (what are those roles actually called?)
          → Job Search Auto-Pipeline (multi-query with expanded terms)
          → Career Bridging (which employers let you grow along your CDM plan?)
```

---

## Pillar 1: Skill Decomposition Tree

### Concept

Every role is a combination of skill domains. The tree decomposes a target role into its constituent domains, then maps what careers exist at every combination level.

**Example: Mechatronics Engineer**
```
Mechatronics Engineer
├── Electrical Engineering
│   └── → Electrical Technician, Power Systems Tech
├── Software Engineering
│   └── → Embedded Developer, Firmware Engineer
├── Mechanical Engineering
│   └── → Mechanical Technician, CNC Machinist
├── Electrical + Software
│   └── → Controls Engineer, PLC Programmer, Automation Engineer
├── Software + Mechanical
│   └── → Robotics Programmer, CNC Programmer
├── Electrical + Mechanical
│   └── → Electromechanical Technician, Equipment Tech
└── Electrical + Software + Mechanical
    └── → Mechatronics Engineer, Robotics Engineer, Systems Integration Engineer
```

Each node in the tree is a **viable career** — not a stepping stone to be skipped, but a real position with real salary ranges and real job listings.

### Data Model

```ts
interface SkillDomain {
  id: string;
  name: string;              // "Electrical Engineering"
  parentId: string | null;   // for sub-domains
  socCodes: string[];        // O*NET/SOC codes in this domain
  keySkills: string[];       // core skills that define this domain
}

interface DomainCombination {
  id: string;
  domains: string[];         // domain IDs that combine
  resultingRoles: string[];  // role titles this combination unlocks
  socCodes: string[];        // SOC codes for those roles
  salaryRange: { min: number; max: number } | null;
  level: "entry" | "mid" | "senior" | "lead" | "executive";
}

interface DecompositionTree {
  targetRole: string;
  targetSocCode: string;
  domains: SkillDomain[];
  combinations: DomainCombination[];
}
```

### Generation Strategy

- **SOC codes** (`src/data/soc-codes.json`) as the taxonomy backbone
- **O*NET skills/knowledge** data for domain-to-skill mapping
- **LLM-assisted decomposition** for roles not cleanly mapped in SOC
  - Prompt: "Decompose [role] into 2-4 primary skill domains. For each subset of domains, list the job titles that require exactly those domains."
  - Cache results per role to avoid repeated LLM calls
- **User validation** — let users confirm/adjust the tree for their specific industry context

---

## Pillar 2: Title Synonym Intelligence

### The Problem

The same job has different titles at different companies:
- "Controls Technician" = "Automation Technician" = "PLC Technician" = "Industrial Controls Specialist"
- "Software Engineer" = "Software Developer" = "Application Developer" = "SDE"
- "Project Manager" = "Program Manager" = "Delivery Manager" = "Engagement Manager"

Users search for ONE title and miss 60%+ of relevant listings.

### Approach

This is **semantic role matching**, not fuzzy string matching. Two titles are synonyms if they require substantially the same skill set and produce the same day-to-day work, even if the words are completely different.

```ts
interface TitleSynonymCluster {
  id: string;
  canonicalTitle: string;       // display name for the cluster
  synonyms: TitleSynonym[];
  socCodes: string[];           // all SOC codes in this cluster
  skillOverlap: number;         // % skill overlap among titles (0-100)
  domainCombinationId: string;  // links back to decomposition tree
}

interface TitleSynonym {
  title: string;
  frequency: number;           // how often seen in job listings
  companies: string[];         // example companies using this title
  regionBias: string | null;   // some titles are regional
}
```

### Building the Synonym Database

1. **SOC code grouping** — titles sharing the same SOC code are strong synonym candidates
2. **LLM semantic clustering** — "List all common job titles that are functionally equivalent to [role] across different companies and industries"
3. **Job listing mining** — over time, analyze saved/searched job descriptions to discover title patterns
4. **User feedback loop** — when a user marks a job as relevant that has a different title, record that as a synonym signal

### Integration with Job Search

When CDM knows a user's target role, it expands the search:
- User targets: "Controls Technician"
- CDM synonym expansion: `["Controls Technician", "Automation Technician", "PLC Technician", "Industrial Controls Specialist", "Controls Engineer I"]`
- Multi-Query Search receives these as auto-suggested queries (user can accept/reject)

---

## Pillar 3: Position Mapping

### Concept

CDM maps the user's current position on the skill decomposition tree:
- Which domains does the user already cover? (from resume, skills inventory, current role)
- Which domain combinations are they closest to completing?
- What's the gap between where they are and each reachable role?

### Existing Infrastructure

The component `career-direction-model.tsx` already has:
- **CareerPath** — `targetRole`, `requiredSkills` (JSON), `milestones`, `level`, `targetSalaryMin/Max`
- **DirectionScore** — `skillMatch`, `incomeAlignment`, `goalAlignment`, `overallScore`, `gaps` (JSON)
- **CareerSnapshot** — periodic capture of user's skill state, proficiency averages, active goals, cert count
- **BLS Wage Comparison** — target salary vs BLS percentile data for the occupation
- **Radar chart** — `@nivo/radar` visualization of skill proficiency across required skills

### What's Missing

| Capability | Current State | CDM Enhancement |
|-----------|---------------|-----------------|
| Skill taxonomy | Flat list of required skills per path | Hierarchical domain tree with combinations |
| Title awareness | Single `targetRole` string | Synonym cluster feeding multi-query |
| Adjacent roles | Not tracked | Domain combinations reveal roles at each level |
| Auto-search | Manual job search | CDM feeds queries + synonyms into search pipeline |
| Stepping stones | Milestones are manual text entries | Auto-generated from domain combination levels |
| Skill sourcing | User manually enters skills | Parse from resume, current position, learning tracker |

---

## CDM → Job Search Integration

CDM is a **standalone system** that communicates with Job Search. It does NOT search for jobs itself.

### What CDM Provides to Job Search

```ts
interface CDMSearchPayload {
  // Primary queries (from target role + adjacent roles)
  suggestedQueries: {
    keyword: string;
    source: "target" | "synonym" | "adjacent" | "stepping-stone";
    confidence: number;    // 0-1, how relevant to user's plan
  }[];

  // Companies to prioritize (growth employers)
  priorityEmployers: {
    company: string;
    reason: string;        // "Hires both Controls Tech and Automation Engineer"
  }[];

  // Skills to highlight in match scoring
  matchWeights: {
    skill: string;
    weight: number;        // higher = more important in resume-job matching
  }[];
}
```

### Auto-Search Pipeline Flow

1. User sets up a career path in CDM (target role, current skills)
2. CDM decomposes the target role and generates the skill tree
3. CDM identifies the user's position and reachable roles
4. CDM expands titles via synonym intelligence
5. CDM packages `CDMSearchPayload` and sends to Job Search
6. Multi-Query Search receives suggested queries, user can accept/modify/reject
7. Cross-reference layer uses `priorityEmployers` to highlight growth employers
8. Resume match scoring uses `matchWeights` to rank results

---

## API Design

### New Routes Needed

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cdm/decompose` | POST | Generate skill decomposition tree for a target role |
| `/api/cdm/synonyms` | POST | Generate/fetch title synonym cluster for a role |
| `/api/cdm/position` | GET | Calculate user's current position on their active tree |
| `/api/cdm/search-payload` | GET | Generate CDMSearchPayload for Job Search integration |
| `/api/cdm/validate-tree` | PUT | User adjusts decomposition tree nodes |

### Existing Routes (already working)

| Route | Purpose |
|-------|---------|
| `/api/career-paths` | CRUD for career paths (title, targetRole, skills, milestones) |
| `/api/career-paths/[id]` | Update/delete individual path |
| `/api/career-snapshots` | Capture periodic skill/career state |

---

## Prisma Model Changes

```prisma
model SkillDomain {
  id          String   @id @default(cuid())
  name        String
  parentId    String?
  parent      SkillDomain?  @relation("SubDomains", fields: [parentId], references: [id])
  children    SkillDomain[] @relation("SubDomains")
  socCodes    String?       // JSON array
  keySkills   String?       // JSON array
  createdAt   DateTime @default(now())
}

model DomainCombination {
  id            String   @id @default(cuid())
  domainIds     String   // JSON array of SkillDomain IDs
  roles         String   // JSON array of role titles
  socCodes      String?  // JSON array
  salaryMin     Int?
  salaryMax     Int?
  level         String   @default("mid")
  treeId        String
  tree          DecompositionTree @relation(fields: [treeId], references: [id], onDelete: Cascade)
}

model DecompositionTree {
  id            String   @id @default(cuid())
  targetRole    String
  targetSocCode String?
  userId        String
  pathId        String?  // links to CareerPath
  combinations  DomainCombination[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model TitleSynonymCluster {
  id              String   @id @default(cuid())
  canonicalTitle  String
  synonyms        String   // JSON array of { title, frequency, companies, regionBias }
  socCodes        String?  // JSON array
  skillOverlap    Int      @default(0)
  combinationId   String?  // links to DomainCombination
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

## Build Order

### Phase 1 — Skill Decomposition (Foundation)
1. Create `/api/cdm/decompose` route (LLM-powered, SOC-backed)
2. Add `DecompositionTree`, `SkillDomain`, `DomainCombination` Prisma models
3. UI: Tree visualization in CDM component (expand/collapse domains, see roles at each combination)
4. Wire to existing CareerPath — selecting a target role triggers decomposition

### Phase 2 — Title Synonyms
5. Create `/api/cdm/synonyms` route (LLM + SOC clustering)
6. Add `TitleSynonymCluster` Prisma model
7. UI: Show synonym chips on career path cards ("Also called: Automation Tech, PLC Tech...")
8. Cache synonym clusters aggressively (same role = same synonyms for all users)

### Phase 3 — Position Mapping
9. Create `/api/cdm/position` route (compare user skills against tree nodes)
10. Pull skills from: resume parser, learning tracker completions, manual skill inventory
11. UI: Highlight user's current node on the tree, show gaps to adjacent nodes
12. Connect to existing DirectionScore for skill match scoring

### Phase 4 — Job Search Integration
13. Create `/api/cdm/search-payload` route
14. Wire CDMSearchPayload into Multi-Query Search suggested queries
15. "Growth Employer" badge in Cross-Reference layer
16. Resume match scoring weighted by CDM matchWeights

---

## Existing Component Reference

- **Component**: `src/components/career-direction-model.tsx`
- **Routes**: `/api/career-paths`, `/api/career-paths/[id]`, `/api/career-snapshots`
- **Prisma models**: `CareerPath`, `DirectionScore`, `CareerSnapshot`
- **Visualization**: `@nivo/radar` for skill proficiency radar chart
- **Data source**: `src/data/soc-codes.json` for occupation taxonomy

---

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] At least one career path created with targetRole and requiredSkills
- [ ] SOC codes data available at `src/data/soc-codes.json`

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Create career path with target role "Mechatronics Engineer" | Path saved with correct targetRole | ⬜ |
| 2 | Trigger decomposition for that path | Tree generated with 3+ skill domains and combination nodes | ⬜ |
| 3 | View decomposition tree UI | Expandable tree showing domains, combinations, and roles at each level | ⬜ |
| 4 | Check synonym expansion for target role | Synonym cluster with 3+ alternative titles | ⬜ |
| 5 | View position mapping | User's current skills highlighted on the tree | ⬜ |
| 6 | Generate search payload | CDMSearchPayload contains suggestedQueries from synonyms + adjacent roles | ⬜ |
| 7 | Accept suggested queries in Job Search | Multi-Query Search populates with CDM-suggested keywords | ⬜ |
| 8 | Adjust tree manually | User edits persist, position recalculates | ⬜ |

### Edge Cases
- [ ] Role with no SOC code match — LLM decomposition still works
- [ ] User has no skills entered — position mapping shows "start here" state
- [ ] Synonym cluster is empty — falls back to exact title search only
- [ ] Multiple career paths — each has independent tree and payload

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM decomposition quality varies | High | SOC codes as ground truth, LLM as supplement. User can validate/edit. |
| Synonym false positives | Medium | Skill overlap threshold (>70%) before clustering. User feedback loop. |
| Tree too complex for simple roles | Low | Collapse domains with <2 sub-skills. Limit depth to 3 levels. |
| API cost for LLM calls | Medium | Cache trees per role. Share across users for common roles. |
| Scope creep | High | Build in phases. Decomposition delivers value alone. |

---

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-29 | Initial CDM feature specification | — |
