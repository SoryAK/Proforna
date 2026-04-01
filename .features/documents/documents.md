# Feature: Documents

## Overview
Document storage, categorization, and data import/export.

- **Routes**: `/documents`, `/import-export`
- **Components**: (inline in pages)
- **API endpoints**: `/api/documents`, `/api/documents/[id]`, `/api/import-export`
- **Prisma models**: `Document`

### Sub-features
- **Document Storage** — Upload, download, categorize, and edit documents
- **Data Import** — Import full JSON backup, CSV application data
- **Data Export** — Export all data as JSON backup

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /documents | Document list loads | ⬜ |
| 2 | Upload a document | File stored with category | ⬜ |
| 3 | Download a document | File downloads correctly | ⬜ |
| 4 | Navigate to /import-export | Import/export page loads | ⬜ |
| 5 | Export data as JSON | Valid JSON file downloads with all data | ⬜ |
| 6 | Import JSON backup | Data restored correctly | ⬜ |

### Edge Cases
- [ ] Large file upload — body size limit handling
- [ ] Import malformed JSON — should show error, not crash
- [ ] Import into non-empty database — should merge, not duplicate

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-28 | Document storage with upload/download/categorize | — |
| 2026-03-28 | Data import/export (JSON backup, CSV import) | — |
