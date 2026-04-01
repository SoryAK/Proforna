# Feature: Research

## Overview
Company research tools including company intel, scholar search, industry research, and job market data.

- **Routes**: `/research`
- **Components**: `company-intel.tsx`, `company-deep-dive.tsx`, `company-news.tsx`, `scholar-search.tsx`, `industry-research.tsx`, `job-market-research.tsx`
- **API endpoints**: `/api/company-intel`, `/api/scholar`, `/api/market-data`
- **Prisma models**: `SiteMarketData`

### Sub-features
- **Company Intel** — Company overview, financials, culture insights
- **Company Deep Dive** — Detailed company analysis with news, financials
- **Scholar Search** — Academic paper search for industry insights
- **Industry Research** — Market trends and industry data
- **Job Market Research** — BLS data, salary trends, demand analysis

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] BLS_API_KEY in .env (for market data)

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /research | Research page loads with sections | ⬜ |
| 2 | Search for a company | Company intel results appear | ⬜ |
| 3 | Open company deep dive | Detailed analysis with tabs | ⬜ |
| 4 | Search scholar papers | Academic results returned | ⬜ |
| 5 | View job market data | Charts and statistics render | ⬜ |

### Edge Cases
- [ ] Company not found — graceful empty state
- [ ] BLS API rate limit — error handling
- [ ] Scholar search with no results — empty state

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-24 | Initial research page with company intel, scholar search | — |
