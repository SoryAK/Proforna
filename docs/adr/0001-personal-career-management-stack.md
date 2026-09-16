# 0001 — Personal career management on core + Hono + Vite

- **Status:** Accepted
- **Date:** 2026-09-16
- **Deciders:** Sory Kaba
- **Tags:** product, stack, frontend, server

## Context

Proforna is **personal career management**: you own the data and you act on
it (profile, resumes, work history, worklog, documents, job search,
applications). It is not a log-only tracker.

Distribution is not locked (laptop, self-host, or hosted). The previous app
used Next.js because that is a hosted-web default. That pulled management
logic into route files and React, which is expensive to move later.

## Decision

- **Product:** personal career management, not a tracker.
- **Layout:** `core/` (domain), `server/` (Hono), `web/` (Vite + React).
- **v1 runtime:** one Node process in production (Hono serves `/api` and the
  Vite build). SQLite on disk. No Docker, no Vercel, no Prisma.
- **Hard rule:** management logic (resume completeness, application state,
  history facts) lives in `core/`. Routes and React screens call it; they do
  not own it.

Later shells (hosted Hono, Tauri, mobile) change `server/` or `web/` only.

## Consequences

- Contributors learn three folders, not a Next.js app tree.
- First-run occupant and onboarding can be tested at `core` and HTTP seams.
- Public shareable portfolios, if they return, are a later shell (SSR/hosting),
  not a reason to bring Next.js back.
