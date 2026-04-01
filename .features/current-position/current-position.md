# Feature: Current Position

## Overview
Manage the user's active and past employment positions including compensation, benefits, time off, and work logging.

- **Routes**: `/current-position`, `/experience`, `/experience/[id]`
- **Components**: `compensation-tracker.tsx`, `benefits-tracker.tsx`, `timeoff-tracker.tsx`, `hours-worked-tracker.tsx`, `work-log-tracker.tsx`, `equipment-tracker.tsx`, `pay-period-calendar.tsx`, `paycheck-estimator.tsx`
- **API endpoints**: `/api/current-position`, `/api/paycheck-parse`, `/api/benefits`, `/api/time-off`
- **Prisma models**: `CurrentPosition`, `Benefit`, `TimeOffEntry`, `WorkLog`, `Equipment`

### Sub-features
- **Position Management** — Add/edit positions, rotating shift toggle, OT auto-detection
- **Compensation Tracker** — Yearly estimate with OT tiers, differentials, tax calculations
- **Paycheck Parser** — ADP-aware PDF parser with positional text extraction, tax percentages
- **Benefits Tracker** — Health, dental, vision, 401k tracking
- **Time Off Tracker** — PTO, sick, vacation tracking with balance calculations
- **Work Log** — Hours worked tracker with overtime detection
- **Equipment Tracker** — Company equipment inventory
- **Pay Period Calendar** — Visual pay schedule
- **Experience Pages** — Listing of all positions with detail sub-pages

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] At least one active position exists

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /current-position | Position details load with tabs | ⬜ |
| 2 | Edit position — change hourly rate | Annual estimate updates in real-time | ⬜ |
| 3 | Toggle rotating schedule | Schedule B fields appear, estimate includes both | ⬜ |
| 4 | Set hours > 40 | OT auto-detected, OT fields appear | ⬜ |
| 5 | Upload paycheck PDF (ADP format) | Correct extraction of hours, rate, taxes with percentages | ⬜ |
| 6 | Apply paycheck data to estimator | Estimator fields populate with extracted values | ⬜ |
| 7 | Navigate to /experience | All positions listed | ⬜ |
| 8 | Click a position | Detail page loads with same tabs as current-position | ⬜ |
| 9 | Estimator settings persist after page reload | Values saved via debounced JSON save | ⬜ |

### Edge Cases
- [ ] Paycheck PDF with split numbers (ADP) — merging handles `$1` + `862` + `09` → `$1,862.09`
- [ ] No active position — should show create form
- [ ] Position with no benefits — empty state in benefits tab

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-22 | Initial position management, compensation tracker | — |
| 2026-03-25 | Rotating shift, OT auto-detection, estimator persistence | — |
| 2026-03-28 | Experience listing and detail sub-pages | — |
| 2026-04-01 | Paycheck parser rewrite: ADP positional extraction, tax percentages, YTD | — |
