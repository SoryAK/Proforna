# Axiom — Session History

What Axiom knows about this project. Accumulated across sessions.

## Key API Patterns

- All route handlers follow: GET/POST at `/api/[feature]/route.ts`, GET/PATCH/DELETE at `/api/[feature]/[id]/route.ts`
- All mutations call `logActivity(entityType, id, action, description)` — defined in `src/lib/activity.ts` (or similar)
- JSON fields must be stringified on write and parsed on read: `requiredSkills`, `skills`, `tags`, `gaps`, `estimatorSettings`
- External API integrations require env vars: `BLS_API_KEY`, `USAJOBS_API_KEY`, `USAJOBS_EMAIL`, `WALKSCORE_API_KEY`
- Dashboard route (`/api/dashboard`) runs 20 parallel Prisma queries — be careful adding more

## Key API Patterns

- All route handlers follow: GET/POST at `/api/[feature]/route.ts`, GET/PATCH/DELETE at `/api/[feature]/[id]/route.ts`
- All mutations call `logActivity(entityType, id, action, description)` — defined in `src/lib/activity.ts` (or similar)
- JSON fields must be stringified on write and parsed on read: `requiredSkills`, `skills`, `tags`, `gaps`, `estimatorSettings`
- External API integrations require env vars: `BLS_API_KEY`, `USAJOBS_API_KEY`, `USAJOBS_EMAIL`, `WALKSCORE_API_KEY`
- Dashboard route (`/api/dashboard`) runs 20 parallel Prisma queries — be careful adding more

## Worklog-Specific

- Worklog bulk API: `POST /api/work-logs/bulk` — actions: `move | delete | pin | unpin`, wrapped in `$transaction`
- Worklog FTS: `GET /api/work-logs/search?q=&folderId=&limit=20` — PostgreSQL tsvector GIN index
- Work log `PUT /api/work-logs/[id]` treats payload as SPARSE PATCH — only update fields present in body
- Worklog reorder API (W2.1): `POST /api/work-logs/reorder` — body `{ items: [{id, sortOrder, folderId?}] }`
- Folder reorder API (W2.1): `POST /api/work-logs/folders/reorder` — body `{ items: [{id, sortOrder, parentId?}] }`

## W2.1 Implementation (2026-05-25)

- Schema: added `sortOrder Int @default(0)` to `WorkLog` model + `@@index([userId, folderId, sortOrder])`
- Migration: `20260525000000_add_worklog_sort_order` — includes backfill that assigns dense 0-based rank per (userId, folderId) ordered by date DESC, createdAt DESC
- **Column name gotcha**: Prisma default (no `@map`) = camelCase columns. Backfill must use `"sortOrder"`, `"folderId"`, `"createdAt"` (quoted). The task's provided backfill used snake_case — corrected in the migration file.
- Extracted helpers to `src/lib/worklog-folders.ts`: `assertNoCycle(folderId, newParentId, allFolders)` and `getDepth(folderId, allFolders)`. Updated `src/app/api/work-logs/folders/[id]/route.ts` PATCH handler to use them.
- `src/app/api/work-logs/reorder/route.ts` — notes reorder endpoint
- `src/app/api/work-logs/folders/reorder/route.ts` — folders reorder endpoint
- **Blocked**: `npx prisma generate` fails with EPERM (OneDrive locks `query_engine-windows.dll.node`). Migration applied; DB column exists. Must pause OneDrive sync and re-run `prisma generate` before TypeScript build will pass for `sortOrder` on `WorkLog`.

## Known Gotchas

- Prisma v6 ONLY. v7 has ESM/adapter issues with SQLite.
- Two migrations were modified after application (migration drift) — non-blocking but noted.
- OneDrive locks git objects: always use `git -c gc.auto=0` for git operations.
- Next.js 16 body size limit for Route Handlers: use `experimental.proxyClientMaxBodySize` in `next.config.ts`.
