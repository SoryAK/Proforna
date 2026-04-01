# Feature: Applications

## Overview
Job application tracking with kanban/table views, offer comparison, interview prep, and email linking.

- **Routes**: `/applications`
- **Components**: `offer-comparison.tsx`, `interview-prep.tsx`, `interview-resume-sidebar.tsx`, `interview-room-launcher.tsx`
- **API endpoints**: `/api/applications`, `/api/applications/[id]`, `/api/applications/link-emails`
- **Prisma models**: `JobApplication`

### Sub-features
- **Application Tracker** — Kanban board and table views with status pipeline (Applied → Phone → Interview → Offer → Accepted/Rejected)
- **Offer Comparison** — Side-by-side offer details (salary, benefits, equity, PTO)
- **Interview Prep** — 3-tab dialog: company research, practice questions, post-interview reflection with rating
- **Email Linking** — Auto-match emails to applications by company name, manual link button
- **Resume Matching** — Smart suggestions for which resume version to attach per application

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] At least 2-3 applications in different statuses
- [ ] At least one email account connected (for email linking)

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /applications | Applications list loads | ⬜ |
| 2 | Create new application | Application appears in list | ⬜ |
| 3 | Move application through statuses | Status updates, pipeline reflects change | ⬜ |
| 4 | Open offer comparison | Side-by-side view with offer details | ⬜ |
| 5 | Open interview prep dialog | 3 tabs: research, questions, reflection | ⬜ |
| 6 | Save reflection with rating | Persists on reload | ⬜ |
| 7 | Click "Link Emails" | Matching emails found by company name | ⬜ |
| 8 | Attach resume version | Resume badge shows on application | ⬜ |

### Edge Cases
- [ ] Application with no emails — link button shows "0 emails"
- [ ] Offer with missing fields — comparison handles nulls gracefully
- [ ] Duplicate company name matching — verify correct email linking

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-24 | Initial application tracker | — |
| 2026-03-28 | Email linking, interview prep, resume matching, offer comparison | — |
