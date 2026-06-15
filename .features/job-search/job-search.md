# Feature: Job Search

## Overview
Job discovery system with map-based exploration, board listing, and interest group communities.

- **Routes**: `/job-search`
- **Components**: `job-board.tsx`, `job-map.tsx`, `job-map-google.tsx`, `job-interest-groups.tsx`, `places-autocomplete.tsx`
- **API endpoints**: `/api/jobs`, `/api/jobs/search`, `/api/commute`, `/api/life-anchors`
- **Prisma models**: `JobPosting`, `InterestGroup`, `LifeAnchor`

### Sub-features
- **Job Board** — Searchable/filterable job listings with salary, location, contract type
- **Discovery Map** — Google Maps with clustered salary-colored markers, heatmap, and toggle-able tile styles
- **Commute Routes** — Driving/transit/walking/bicycling routes with travel time and transit itinerary
- **Life Anchors** — Pin important locations (home, gym, daycare) to calculate sweet spot zones
- **Search This Area** — Re-search when panning >25km with drag-only trigger
- **Job Interest Groups** — Community groups around job categories

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] Google Maps API key configured (for commute routes)
- [ ] Adzuna API key configured (for job search)

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /job-search | Job board and map render | ⬜ |
| 2 | Search for a job title + location | Results populate on board and map | ⬜ |
| 3 | Click a job marker on map | Job card highlights, floating detail card shows | ⬜ |
| 4 | Zoom in/out on map | No tile seam lines, smooth transitions | ⬜ |
| 5 | Toggle heatmap | Density heatmap overlays correctly | ⬜ |
| 6 | Switch tile style (OSM → Google) | Tiles swap without flicker | ⬜ |
| 7 | Click "Get Directions" on a job | Route polyline renders, travel time shows | ⬜ |
| 8 | Select transit mode | Transit itinerary with colored line badges shows | ⬜ |
| 9 | Add a life anchor | Anchor marker appears on map, sweet spot recalculates | ⬜ |
| 10 | Pan map >25km by dragging | "Search this area" pill appears | ⬜ |
| 11 | Pan map <25km | Button does NOT appear | ⬜ |
| 12 | Click a job programmatically (not drag) | Button does NOT appear | ⬜ |

### Edge Cases
- [ ] No jobs returned — map should show empty state
- [ ] Job with no coordinates — should be excluded from map
- [ ] Multiple office locations for same company — cluster circle renders
- [ ] Life anchor right-click toggle — enable/disable without removing

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-29 | Transit itinerary with colored line badges, per-segment polylines | — |
| 2026-04-01 | Search-area button: 25km threshold, drag-only trigger, dark pill style | — |
| 2026-04-01 | Fix tile seam lines: preferCanvas, tile scale(1.002) overlap | — |
