# Feature: Email

## Overview
Gmail and Outlook email integration with OAuth, inbox management, and application linking.

- **Routes**: `/email`
- **Components**: (inline in email page)
- **API endpoints**: `/api/email/accounts`, `/api/email/sync`, `/api/email/messages`, `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/microsoft`, `/api/auth/microsoft/callback`
- **Prisma models**: `EmailAccount`, `Email`

### Sub-features
- **Gmail OAuth** — Connect Gmail accounts via Google OAuth 2.0
- **Outlook OAuth** — Connect Outlook accounts via Microsoft MSAL
- **Email Sync** — Pull emails from connected accounts
- **Inbox View** — Searchable/filterable inbox with pagination, expandable email view
- **Application Linking** — Auto-match emails to job applications by company name

## Test Plan

### Setup / Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in .env (for Gmail)
- [ ] `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in .env (for Outlook)

### Manual Tests
| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Navigate to /email | Email page loads with connect buttons | ⬜ |
| 2 | Click "Connect Gmail" | OAuth flow redirects to Google | ⬜ |
| 3 | Complete Gmail OAuth | Account added, redirect back to /email | ⬜ |
| 4 | Click "Sync" | Emails pulled from Gmail | ⬜ |
| 5 | Search emails | Results filter by query | ⬜ |
| 6 | Click an email | Expandable view shows full content | ⬜ |
| 7 | Connect Outlook | OAuth flow with Microsoft | ⬜ |

### Edge Cases
- [ ] OAuth token expiry — should refresh or prompt reconnect
- [ ] No email accounts connected — show connect prompts only
- [ ] Large inbox sync — pagination handles thousands of emails

## Known Issues

| # | Issue | Severity | Repro Steps | Date Found |
|---|-------|----------|-------------|------------|
|   |       |          |             |            |

## Changelog

| Date | Change | Related Issue |
|------|--------|---------------|
| 2026-03-28 | Gmail and Outlook OAuth, email sync, inbox page, application linking | — |
