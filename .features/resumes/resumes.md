# Feature: Resumes

## Overview
Resume management with version tracking and application matching.

- **Routes**: `/resumes`
- **Components**: `interactive-resumes-manager.tsx`
- **API endpoints**: `/api/resumes`, `/api/resumes/[id]`
- **Prisma models**: `ResumeVersion`

### Sub-features
- **Resume Manager** — Create, edit, upload resume versions with labels
- **Smart Matching** — Suggests best resume version for each application based on job title/keywords

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /resumes | Resume list loads | ⬜ |
| 2 | Upload a new resume | File stored, version appears in list | ⬜ |
| 3 | Edit resume label/version | Changes persist | ⬜ |
| 4 | Check smart match from applications | Correct resume suggested for job | ⬜ |

### Edge Cases
- [ ] Large PDF upload (>10MB) — should respect body size limits
- [ ] No resumes — empty state with upload prompt

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-24 | Initial resume manager | — |
| 2026-03-28 | Resume-application matching with smart suggestions | — |
