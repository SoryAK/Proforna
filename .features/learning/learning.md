# Feature: Learning

## Overview
Learning and skill development tracking.

- **Routes**: `/learning`, `/skills`
- **Components**: `learning-tracker.tsx`
- **API endpoints**: `/api/learning`, `/api/skills`
- **Prisma models**: `LearningItem`, `Skill`

### Sub-features
- **Learning Tracker** — Track courses, certifications, and learning progress
- **Skills Inventory** — Manage and rate skill proficiency levels

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /learning | Learning tracker loads | ⬜ |
| 2 | Add a learning item | Item appears in list | ⬜ |
| 3 | Mark item complete | Status updates, dashboard certifications reflect | ⬜ |
| 4 | Navigate to /skills | Skills list loads | ⬜ |

### Edge Cases
- [ ] Expiring certification — shows warning on dashboard
- [ ] No learning items — empty state

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-24 | Initial learning tracker and skills inventory | — |
