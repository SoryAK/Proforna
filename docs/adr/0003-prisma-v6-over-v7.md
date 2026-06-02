# 0003 — Pin Prisma to v6 instead of v7

- **Status:** Accepted
- **Date:** 2026-05-17 (backfilled)
- **Deciders:** Sory Kaba
- **Tags:** data, orm, prisma

## Context and Problem Statement

Resumsify uses Prisma as its ORM over SQLite (with plans to optionally support Postgres). When Prisma v7 released, we evaluated upgrading from v6 (specifically `prisma@6.19.2`).

Prisma v7 introduced a new client-generation model with **custom output directories** and **driver adapters as the primary path** for non-default databases. Testing the upgrade on the existing schema revealed severe issues with the v7 + custom output + SQLite combination, particularly around ESM resolution and adapter wiring.

## Decision Drivers

- Stability (we have 40+ migrations and live SQLite data)
- Minimal time spent fighting tooling
- Standard `@prisma/client` import path (used in dozens of files)
- Compatibility with the Next.js 16 build pipeline

## Considered Options

- **Option A** — Stay on Prisma v6 (`6.19.2`), `prisma-client-js` generator, standard `@prisma/client` import
- **Option B** — Upgrade to Prisma v7 with the new generator + custom output
- **Option C** — Upgrade to Prisma v7 but keep the legacy generator configuration
- **Option D** — Migrate off Prisma entirely (Drizzle, Kysely)

## Decision Outcome

**Chosen option: "Stay on Prisma v6"**, because v7 in our exact configuration (custom output + SQLite) produced ESM resolution failures and adapter wiring issues that cost more than the v7 features were worth. The v6 path is well-trodden and works.

### Positive Consequences

- Builds and dev server work without intervention
- Standard `import { PrismaClient } from "@prisma/client"` pattern unchanged across the codebase
- No need to touch the 40+ existing migrations
- Driver adapters can still be opted into later (Postgres swap)

### Negative Consequences

- We don't get v7 perf improvements
- Eventual upgrade is now a deferred chore — gets harder the longer we wait
- Need to revisit when v7.x SQLite story matures (set a reminder when v7.2+ ships)

## Pros and Cons of the Options

### Option A — Prisma v6.19.2 (current)

- ✅ Works, full stop
- ✅ Familiar API
- ❌ Behind the upgrade curve

### Option B — Prisma v7 + new generator

- ✅ Future-proof
- ✅ Newer perf and DX improvements
- ❌ ESM/adapter issues with custom output + SQLite (empirically confirmed)
- ❌ Multiple import-path changes across the codebase

### Option C — Prisma v7 + legacy generator config

- ✅ Some v7 benefits
- ❌ Hybrid config — confusing, brittle
- ❌ Likely deprecated path

### Option D — Drizzle / Kysely

- ✅ Lighter runtime, better TypeScript inference
- ❌ Full migration of 40+ Prisma migrations would be massive
- ❌ Loses Prisma Studio, generated client, model relations DX

## Links / References

- User memory: `~/memories/resumsify-lessons.md` "Prisma v7 Issues"
- Re-evaluate when: Prisma v7 + SQLite + custom output combination is confirmed stable in changelog
