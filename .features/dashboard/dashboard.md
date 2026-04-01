# Feature: Dashboard

## Overview
The main landing page after login. Provides a high-level summary of the user's career status.

- **Routes**: `/dashboard`
- **Components**: `page.tsx`, `personal-finance.tsx`, `notification-bell.tsx`, `command-palette.tsx`
- **API endpoints**: `/api/dashboard`, `/api/reminders`, `/api/search`
- **Prisma models**: `UserProfile`, `Reminder`, `ActivityLog`

### Sub-features
- **Summary Cards** — Profile header, active position, income growth, upcoming interviews, expiring certifications
- **Personal Finance** — Monthly net income vs expenses sidebar widget
- **Notifications** — Bell icon with reminder list and create form
- **Command Palette** — Global Cmd+K search across jobs, applications, documents
- **Dark Mode Toggle** — Theme switcher (light/dark/system)

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] At least one active position exists
- [ ] At least one application exists

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /dashboard | Dashboard loads with profile header and summary cards | ⬜ |
| 2 | Check income growth card | Shows CFM data with employer count | ⬜ |
| 3 | Click notification bell | Popover opens with reminders list | ⬜ |
| 4 | Create a new reminder | Reminder appears in bell dropdown | ⬜ |
| 5 | Press Cmd+K | Command palette opens | ⬜ |
| 6 | Search for a job/application | Results appear and are navigable | ⬜ |
| 7 | Toggle dark mode | Theme switches correctly without hydration errors | ⬜ |
| 8 | Check personal finance widget | Shows monthly income vs expenses | ⬜ |

### Edge Cases
- [ ] Dashboard with no positions — should show empty state
- [ ] Dashboard with no applications — cards should handle gracefully
- [ ] Rapid theme toggling — no hydration errors

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-28 | Initial dashboard with summary cards, personal finance, notifications, command palette, dark mode | — |
