# Echo — Session History

What Echo knows about this project. Accumulated across sessions.

## TypeScript State

- Strict mode is ON. Pre-existing errors in `job-map.tsx`, `annotation-editor.tsx`, and some `work-log` route files — do not introduce new errors there.
- W1.1–W1.3 worklog work passes `pnpm tsc --noEmit` for worklog-related paths.
- Common pattern: TanStack Query v5 types require explicit generics on `useQuery<DataType, ErrorType>`.

## Test Infrastructure

- Vitest configured via `vitest.config.ts` in project root.
- Test files: `*.test.ts` or `*.test.tsx` alongside source or in `__tests__/`.
- No test coverage exists yet for worklog hooks — high priority for W2.

## Security Patterns to Enforce

- All user input through Route Handlers must be validated before Prisma write.
- Query params: validate type (string check), presence, and length before use.
- JSON field parsing (`JSON.parse`) must be wrapped in try/catch.
- Prisma errors must NOT be forwarded raw to clients — always return a generic message.

## Known Edge Cases in Worklog

- Bulk delete of a folder-containing note: the bulk API uses `$transaction` but does not currently cascade to folder membership — verify this in W2.
- FTS search with empty string `q=` should return recent notes, not error.
- `collectDescendantIds` is used in search scope — must handle circular folder references gracefully.

## Learnings

### First test files created (Sprint W2.1 — 2026-05-25)

**Paths and patterns:**
- `src/lib/worklog-folders.test.ts` — pure unit tests; no mocks needed; import directly from `@/lib/worklog-folders`
- `src/app/api/work-logs/reorder/route.test.ts` — route integration test; mocks `@/lib/auth-utils`, `@/lib/prisma`, `@/lib/activity`
- `src/app/api/work-logs/folders/reorder/route.test.ts` — same pattern; `assertNoCycle`/`getDepth` intentionally NOT mocked (pure functions, let them run)

**How to mock `prisma.$transaction` with fn callback:**
```typescript
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// In each test that exercises the transaction:
vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
  const mockTx = { workLog: { update: vi.fn().mockResolvedValue({}) } };
  return fn(mockTx); // calls the route's real callback with the mock tx context
});
```

**Vitest globals config:**
- `globals: true` in `vitest.config.ts` means `describe`, `it`, `expect`, `beforeEach` need no import.
- `vi` for mock helpers must still be imported explicitly: `import { vi } from "vitest"`.
- Path alias `@` → `src/` is configured in both `tsconfig.json` and `vitest.config.ts` via `resolve.alias`.

**`getDepth` edge case — orphaned folder:**
- When `parentId` points to a non-existent id, `getDepth` returns **1** (not 0).
- The loop increments `depth` before discovering the parent is `undefined`.
- Task spec said 0; actual code returns 1. Always verify against implementation, not spec prose.

**Two `findMany` calls in folders/reorder:**
- First call: `{ select: { id: true } }` — ownership check of ids in request.
- Second call: `{ select: { id: true, parentId: true } }` — full folder list for cycle/depth.
- Only happens when `reparentItems.length > 0` (items with a `parentId` field).
- Use `.mockResolvedValueOnce(...).mockResolvedValueOnce(...)` to return different values per call.

**`reparentItems` filter logic:**
- Route uses `Object.prototype.hasOwnProperty.call(item, "parentId") && item.parentId !== undefined`.
- `parentId: null` IS included (null !== undefined → true) but server skips cycle/depth for null (moving to root).
- Omit `parentId` from items entirely to avoid triggering the second `findMany`.
