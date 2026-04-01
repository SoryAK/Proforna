# Feature: Career Analytics

## Overview
Career Financial Model (CFM), income projections, W-2 import, and application analytics.

- **Routes**: `/career-model`, `/career-growth`, `/analytics`
- **Components**: `career-direction-model.tsx`
- **API endpoints**: `/api/cfm`, `/api/w2-parse`, `/api/analytics`
- **Prisma models**: `CareerIncomeYear`, `CareerIncomeEntry`, `WageTier`

### Sub-features
- **Career Financial Model** — Income history table with expandable employer breakdown, line chart, stacked bar chart
- **W-2 Import** — PDF parser using pdfjs-dist positional extraction, employer-to-history, multi-W-2 per year with accumulation
- **Live Projections** — Real-time annual income estimate from current position data
- **Wage Tier Goals** — Set target income milestones with time-to-target calculations
- **Application Analytics** — Status pie chart, pipeline timing, volume trends, response rates, salary trends, KPI cards

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] At least one active position with compensation data
- [ ] At least one income year entry (or W-2 to import)

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /career-model | CFM page loads with chart and table | ⬜ |
| 2 | Add an income year manually | Row appears in table, chart updates | ⬜ |
| 3 | Upload a W-2 PDF | Correct extraction of wages, taxes, employer | ⬜ |
| 4 | Import W-2 data | Income year created/updated, chart reflects it | ⬜ |
| 5 | Expand a year row | Per-employer entries shown | ⬜ |
| 6 | Check live estimate card | Shows projected income from current position | ⬜ |
| 7 | Add a wage tier goal | Goal line appears on chart, time-to-target calculated | ⬜ |
| 8 | Navigate to /analytics | 7 visualizations render with data | ⬜ |

### Edge Cases
- [ ] W-2 with multiple copies (A, B, C, D) — only page 1 parsed
- [ ] Multiple W-2s for same year — amounts accumulate, not replace
- [ ] No income data — empty state with import prompt
- [ ] CFM cache invalidation — editing position should refresh CFM

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-26 | Initial CFM with income table, chart, wage tiers | — |
| 2026-03-27 | W-2 parser (unpdf → pdfjs-dist rewrite), employer tracking | — |
| 2026-03-27 | Live projections from current position, cross-page cache invalidation | — |
| 2026-03-28 | Application analytics page with 7 visualizations | — |
