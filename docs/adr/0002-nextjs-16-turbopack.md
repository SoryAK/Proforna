# 0002 — Use Next.js 16 with Turbopack

- **Status:** Accepted
- **Date:** 2026-05-17 (backfilled — decision made early in project)
- **Deciders:** Sory Kaba
- **Tags:** frontend, framework, build

## Context and Problem Statement

Resumsify is a full-stack web application combining a server-rendered UI (resume builder, job map, work log, analytics) with API route handlers backed by Prisma + SQLite. We needed a single framework for the SSR/RSC frontend, file-based API routes, and the dev server.

At the time of selection, Next.js 16 had just shipped with **Turbopack as the default dev bundler** and stable Server Components. Webpack was still available as a fallback.

## Decision Drivers

- React Server Components support (we use them heavily for data-fetching layouts)
- Single integrated framework for UI + API routes (no separate Express/Fastify server)
- Fast dev iteration on a god-file-prone codebase (1k+ line components exist)
- File-based routing matches our team's intuition
- Strong TypeScript story

## Considered Options

- **Option A** — Next.js 16 + Turbopack (App Router)
- **Option B** — Next.js 15 + Webpack (one major behind, more stable)
- **Option C** — Vite + React Router + separate API server
- **Option D** — Remix / React Router 7

## Decision Outcome

**Chosen option: "Next.js 16 + Turbopack"**, because the App Router's RSC model + integrated route handlers eliminated an entire class of infra (no separate API server, no client/server data-fetching mismatch), and Turbopack's incremental rebuild speed is a daily-felt benefit given how often we edit large files.

### Positive Consequences

- One framework, one dev server, one build pipeline
- RSC keeps client bundles small (heavy stuff like Prisma stays server-only)
- Turbopack rebuilds in tens of ms even with the god-file components
- File-based routing reads directly from `src/app/` structure

### Negative Consequences

- Bleeding-edge: hit the `experimental.proxyClientMaxBodySize` quirk for >10MB uploads (see lessons memory)
- Some ecosystem libraries lag on RSC compatibility
- Page-component prop typing is strict — custom props on route components (like `compact` on `analytics/page.tsx`) trigger lint discouragement, requiring a wrapper for clean cases

## Pros and Cons of the Options

### Option A — Next.js 16 + Turbopack

- ✅ RSC + route handlers in one framework
- ✅ Turbopack dev speed
- ✅ Largest React ecosystem
- ❌ Bleeding-edge quirks (body size limits, route prop typing)
- ❌ Vendor steerage toward Vercel hosting

### Option B — Next.js 15 + Webpack

- ✅ Same model, more battle-tested
- ❌ Slower dev rebuilds
- ❌ Locks us out of newer RSC features

### Option C — Vite + React Router + separate API server

- ✅ Best-in-class dev server
- ❌ Two servers to manage
- ❌ No built-in RSC story (yet)
- ❌ More boilerplate for data fetching

### Option D — Remix / React Router 7

- ✅ Strong data-loading primitives
- ❌ Smaller ecosystem for our heavy UI components (shadcn, maps)
- ❌ Less mature RSC support

## Links / References

- See `next.config.ts` — note `experimental.proxyClientMaxBodySize: "50mb"` (Next 16 body-size workaround)
- User memory: `~/memories/resumsify-lessons.md` "Next.js 16 Body Size Limit"
