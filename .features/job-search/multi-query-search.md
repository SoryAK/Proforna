# Feature: Multi-Query Job Search

## Status: Planned

## Vision

Most job boards limit users to one search at a time. We allow up to 3 simultaneous job queries rendered on a single map, cross-referenced against each other to surface career-path employers, multi-role companies, and geographic role corridors.

This is not "3 tabs." It's **career intelligence** — the app synthesizes multiple searches into insights no single search could produce.

---

## The Pipeline

This feature connects to the broader app ecosystem:

```
Life Anchors (where you live)
  → Multi-Search (the roles you'd take)
    → Cross-Reference (companies hiring across those roles)
      → Resume Match (which ones you qualify for today)
        → Career Bridging (companies where you can grow from Role A → Role B)
```

The Career Directional Model (see: [career-directional-model.md](../career-analytics/career-directional-model.md)) feeds suggested search terms into multi-query automatically via `CDMSearchPayload` — synonym-expanded queries, adjacent-role keywords, growth-employer targeting, and skill-weighted match scoring.

---

## Layers

### Layer 1 — Multi-Query Data (Foundation)
- Support 1-3 simultaneous search queries, each with its own keyword
- All queries share location, radius, and filters (global filters)
- Results merge into a single job array with a `queryIndex` (0, 1, 2) tag
- Each query gets a visual identifier (color-coded border/badge on pins and cards)
- Legend overlay on map shows query color mapping
- "+Add Query" button, collapsible on mobile
- Per-query toggle: show/hide results on the map

### Layer 2 — Cross-Reference Intelligence
- Companies posting in 2+ of the user's queries get highlighted with a special badge/glow
- "Cross-match" badge on job cards: "This company also hires for [Query 2 title]"
- Sort/filter: "Show cross-match companies first"
- Company Deep Dive gains a "Your Roles Here" section showing which of the user's queries this company satisfies

### Layer 3 — Area Intelligence
- Per-query heatmap layers (toggle-able: "show where HVAC jobs cluster vs Maintenance jobs")
- Hotspot detection: geographic zones where 2+ query types cluster within a radius
- "Career corridor" overlay: highlight road/transit corridors connecting role-dense areas to user's life anchors
- Industrial park / campus detection: clusters of cross-match companies in a tight area

### Layer 4 — Career Bridging (connects to CDM)
- For cross-match companies: show the career ladder from Query 1 role → Query 2 role → Query 3 role
- "Growth Employer" badge: companies where the user's current-level role AND target-level role both have openings
- Powered by the Career Directional Model's skill decomposition tree

---

## Architecture Considerations

### Pre-requisite: Refactor job-map.tsx
- Current file is ~4,400 lines handling everything
- Must extract into: `<SearchQueryManager>`, `<JobFilters>`, `<JobList>`, `<JobDetailPanel>`, `<MapOverlays>`
- Multi-query state needs clean separation: `queries: [{ keyword, results, visible, color }]`

### Data model
```ts
interface SearchQuery {
  index: 0 | 1 | 2;
  keyword: string;
  color: string;       // visual identifier
  visible: boolean;    // toggle on map
  results: MapJob[];   // tagged with queryIndex
  loading: boolean;
}

// Extended MapJob
interface MapJob {
  // ...existing fields
  queryIndex: number;         // which query produced this
  queryIndices: number[];     // if matched by multiple queries (cross-match)
}
```

### API cost
- 3 queries × 5 Adzuna pages = 15 API calls per search (within free tier)
- SerpAPI: 3 queries × 1 page = 3 calls (more expensive, monitor)
- Commute pre-fetch: scope to visible page only, not all 750 jobs

### Visual design
- Pin salary color remains (too useful to replace)
- Query differentiation via pin BORDER color or small dot indicator
- Cross-match pins get a pulsing ring or star overlay
- Legend overlay: top-right of map, collapsible

### Deduplication
- Same job from 2 queries = **feature, not bug**
- Mark as "multi-match" with both queryIndices
- These are high-signal: the listing matches multiple target roles

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Map clutter with 750+ markers | High | Already have clustering. Per-query visibility toggle. Progressive disclosure. |
| Mobile UX with 3 search bars | High | Start with 1 bar, "+" to add more. Accordion collapse. |
| Filter ambiguity (per-query vs global) | Medium | Global by default. Per-query override is v2. |
| Scope creep consuming weeks | High | Build in phases. Layer 1 delivers value alone. |
| 4,400-line file becomes worse | High | Refactor BEFORE adding multi-query state. |
| Commute pre-fetch 3x overhead | Medium | Limit pre-fetch to visible page. Cache aggressively. |

---

## Build Order

1. Refactor job-map.tsx into sub-components (pre-requisite)
2. Multi-query state + data layer (Layer 1)
3. Visual differentiation on map + legend
4. Cross-reference highlighting (Layer 2)
5. Area density heatmaps (Layer 3)
6. Career bridging integration with CDM (Layer 4)

---

## Success Criteria

- User can search 2-3 role keywords on one map
- Cross-match companies are visually obvious
- Feature loads within existing performance budget (no degradation)
- Mobile UX is not worse than current single-query
- Connects to Career Directional Model for suggested queries
