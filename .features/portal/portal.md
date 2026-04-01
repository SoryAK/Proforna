# Feature: Portal

## Overview
User profile, portal settings, recruiter-facing portal, and onboarding flow.

- **Routes**: `/portal-settings`, `/profile`, `/portal/[slug]`, `/onboarding`, `/r/[slug]`
- **Components**: `onboarding-flow.tsx`
- **API endpoints**: `/api/portal-settings`, `/api/avatar`, `/api/profile`
- **Prisma models**: `UserProfile`

### Sub-features
- **Profile Identity** — Full name, headline, email, phone, avatar, city/state, LinkedIn/GitHub/portfolio URLs
- **Avatar Upload** — Image upload via `/api/avatar`
- **Portal Settings** — Recruiter portal customization (slug, visibility, stealth mode)
- **Recruiter Portal** — Public-facing profile at `/r/[slug]`
- **Onboarding Flow** — First-time user setup wizard

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] User account created

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /portal-settings | Settings page loads with profile fields | ⬜ |
| 2 | Upload avatar | Image uploads and displays | ⬜ |
| 3 | Edit profile fields | Changes persist on reload | ⬜ |
| 4 | Set portal slug | Recruiter portal accessible at /r/[slug] | ⬜ |
| 5 | Toggle stealth mode | Portal visibility changes | ⬜ |
| 6 | Visit /r/[slug] | Public profile renders | ⬜ |
| 7 | Complete onboarding flow | Profile populated, redirected to dashboard | ⬜ |

### Edge Cases
- [ ] Avatar upload >5MB — should validate and reject
- [ ] Duplicate portal slug — should show error
- [ ] Stealth mode on — public portal returns 404 or hidden state

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-25 | Profile identity fields, avatar upload | — |
| 2026-03-26 | Portal settings, recruiter portal, stealth mode | — |
| 2026-03-28 | Onboarding flow | — |
