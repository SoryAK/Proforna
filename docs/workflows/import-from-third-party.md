# Import content from a third-party source into the worklog

**Workflow Type:** `import-from-third-party`
**Last Updated:** 2026-06-08

## Stack Context

- Next.js 16 Route Handlers (App Router, `src/app/api/integrations/<provider>/**`)
- Prisma v6.19.2 with the existing `WorkLog`, `WorkLogFolder`, `WorkLogImport`, and `IntegrationConnection` models. **Schema already supports cross-provider imports** via `WorkLog.externalSource + externalId` and `@@unique([userId, externalSource, externalId])`.
- AES-256-GCM token decrypt via `decryptToken()` in `src/lib/integration-crypto.ts`
- Pure ProseMirror converter pattern from `src/lib/worklog/import/markdown-to-pm.ts`, `html-to-pm.ts`, and now `notion-to-pm.ts`. All three share the `ImportResult { contentJson, plainText, droppedBlocks }` shape.
- `buildWorkLogImportRecord()` helper in `src/lib/worklog/import/build-import-record.ts` — extend its `ImportSourceType` union when adding a new source.
- shadcn/ui v2 (base-ui) Dialog + Checkbox; TanStack Query v5 for picker.
- vitest `environment: "node"` — pure converter is fully testable; UI components are not.

## When this recipe applies

You're adding a new **content import on-ramp** from a third-party source the
user has already authenticated (Notion, OneDrive, Google Drive, etc.). The
authentication piece is a separate workflow — see
[`add-oauth-integration-provider.md`](./add-oauth-integration-provider.md).
This recipe assumes a working `IntegrationConnection` row with an encrypted
token.

## Successful Sequence

1. **ADR.** Draft `docs/adr/00XX-<provider>-import-onramp.md`. Capture:
   - **One-time migration vs. sync.** Sprint 6B chose one-time on-ramp.
   - **Idempotency dimension** — almost always `WorkLog.externalSource + externalId` (the existing `@@unique` is exactly right; you don't need a schema migration).
   - **Lossy conversion plan** — list every block/element type the source has and decide: native node, lossy-but-acceptable transform, or `[unsupported X block]` placeholder.
   - **Re-import policy** — Sprint 6B chose skip-on-reimport (protect local edits). Future v2 may add an opt-in refresh.
   - **Out-of-scope** items go in their own section so reviewers don't re-litigate.

2. **Schema check FIRST.** Before assuming you need a migration, grep `prisma/schema.prisma` for `externalSource`. Sprint 6B discovered the column already existed with the perfect unique constraint. Zero migration needed. **Always verify before generating one.**

3. **Pure converter** at `src/lib/worklog/import/<provider>-to-pm.ts`:
   - Mirror the shape of `markdown-to-pm.ts` / `html-to-pm.ts`.
   - Export `importX(input, opts) → ImportResult`.
   - Aggregate consecutive list items into one `bulletList` / `orderedList` / `taskList` via a `runType` state machine in your `convertBlocks()` walker.
   - Unsupported types route through a single `handleUnsupported(block)` that emits the `[unsupported <type> block]` placeholder AND increments a `Map<string, number>` of counts.
   - Empty docs MUST emit a single empty paragraph (Tiptap requires at least one node).
   - Trim title; fall back to `"Untitled"` when blank.
   - Compute a `plainText` projection by walking inline content; this powers full-text search later.

4. **TDD RED → GREEN** on the converter. Pure functions + JSON fixtures = no flakiness:
   - Helper test fixtures: `rt(content, ann, href)` for rich text, `block(type, body)` for blocks.
   - Cover one happy path per block type, the run-aggregation cases, the marks set, the unsupported-block counter (independent + aggregated), and the empty-doc edge case.
   - Pre-existing `markdown-to-pm.test.ts` / `html-to-pm.test.ts` are the style reference. 25 tests on Notion was sufficient.
   - Run the import suite (`npm run test -- src/lib/worklog/import`) — full green is the gate. Sprint 6B landed at 127/127.

5. **Provider SDK wrapper** at `src/lib/integrations/<provider>-client.ts`:
   - `buildXClient(config)` decrypts the token via `decryptToken()` and returns the SDK client.
   - `listAccessibleX(client)` paginates a hard cap (Notion = 100) and returns a typed `XSummary[]`.
   - `fetchXContent(client, id)` paginates children up to a per-resource cap (Notion = 1000 blocks).
   - Centralize the SDK so the converter stays SDK-agnostic and the routes don't bleed types.

6. **Picker route** `GET /api/integrations/<provider>/pages` (or equivalent):
   - `await getUserId()` → 401 if missing.
   - `findFirst({ userId, provider, enabled: true })` → 404 if missing.
   - Build SDK client → list resources.
   - Compute `importedIds` via `prisma.workLog.findMany({ where: { userId, externalSource: "<provider>" } })` so the picker can dim already-imported entries.
   - Catch SDK errors → 502 with `redact()`-cleaned message.
   - Response shape: `{ items: XSummary[], importedIds: string[] }`.

7. **Import route** `POST /api/integrations/<provider>/import`:
   - Body: `{ ids: string[] }` with hard cap (Sprint 6B = 25). Validate with zod.
   - **Sequential** per-resource processing — third-party APIs rate-limit aggressively.
   - For each id:
     - Idempotency check FIRST (`findUnique` on the unique key) — return `{ status: "skipped" }` if hit.
     - Fetch + convert + `validateContentJson()`.
     - One transaction: create `WorkLog` + create `WorkLogImport` audit row.
     - **P2002 race-safe:** catch the unique-violation, re-read the winner, return `{ status: "skipped" }` instead of 500.
     - Pipe SDK errors through `redact()` (strip token fragments, slice 200 chars) → `{ status: "failed", error }`.
   - `ensureImportFolder(userId)` find-or-creates a per-user **"Imported from `<provider>`"** root folder.
   - Response shape: `{ results: PerResourceResult[], folderId: string }`.

8. **`buildImportRecord` extension.** Open `src/lib/worklog/import/build-import-record.ts`, extend the `ImportSourceType` union to include your new source string, and add it to `VALID_SOURCE_TYPES`. **Do this natively** rather than overriding the helper output post-construction — see Failure #2 below.

9. **Picker UI** at `src/components/integrations/<provider>-import-dialog.tsx`:
   - shadcn/ui v2 Dialog with `useQuery(["<provider>-pages"])`, `staleTime: 60_000`.
   - Title filter input (case-insensitive contains).
   - "Select all visible" checkbox — exclude already-imported.
   - Dim already-imported rows (`opacity-60` + "Imported" badge + checkbox disabled).
   - `useMutation` posts ids, parses results into a `"Imported X · skipped Y · Z failed"` toast.
   - Invalidate `["work-logs"]`, `["integrations"]`, `["<provider>-pages"]` on success.
   - Empty state: tell the user how to grant access (link to provider's permission UI).

10. **Wire into IntegrationsSection.** Add a provider-specific button (`Browse pages` for Notion). Use `useState<boolean>` for dialog open. Mount the dialog as a sibling.

## First-Attempt Failures

1. **Believing the schema needs a migration.** Sprint 6B nearly generated a noop migration before checking that `externalSource + externalId` already existed with the right unique constraint. **Always grep `prisma/schema.prisma` for the columns you think you need before running `prisma migrate`.**

2. **Post-construction override of `buildWorkLogImportRecord`.** Initial Sprint 6B impl did `const importData = { ...successRecord, sourceType: "notion" }` to bypass the helper's `sourceType` validation. Cleaner: **extend** the helper's `ImportSourceType` union and `VALID_SOURCE_TYPES` set so the new source is a first-class citizen. Spreads-and-overrides hide the gap from future readers.

3. **TDD callout test failure.** First Notion converter run was 24/25, not 25/25. The test asserted `q?.content?.[0]?.content?.[0]?.text === "📌 ..."` but my implementation correctly emitted the emoji prefix as a separate text node. The implementation was right; the test had to join all inline text nodes before asserting. **Lesson:** when a test fails on output shape, look at the actual output before "fixing" the implementation — the test is wrong as often as the code.

4. **Prisma `InputJsonValue` cast on contentJson.** Same TS quirk that exists elsewhere — Prisma's generated input types reject `ProseMirrorDoc | undefined`. Fix: `contentJson: (validation.value ?? undefined) as Prisma.InputJsonValue`. Already noted in the codebase but easy to forget on new routes.

5. **Token leaking in error messages.** SDK errors sometimes echo the auth header. Sprint 6B's `redact()` strips `secret_*` and `ntn_*` (Notion's two token prefixes) and slices to 200 chars. **For each new provider, learn its token prefix and add it to the redaction list before shipping.**

## Gotchas

- **Picker queries use a separate query key from the integrations list.** `["notion-pages"]` ≠ `["integrations"]`. Make sure the import-success path invalidates BOTH so the picker's "Imported" dim state updates without a manual refresh.
- **Sequential per-resource is correct, even if it feels slow.** Notion 429s aggressively under parallel children-fetches. 25 sequential round-trips is the right ceiling for the v1 batch size.
- **Empty paragraph requirement is a Tiptap quirk.** If your converter emits an empty doc, Tiptap throws. Always backfill a single empty paragraph node — do this in the converter, not in the route.
- **`WorkLogImport` is the audit trail.** Even on `status: "skipped"`, you don't write a new `WorkLogImport` row (the original survives). On `status: "failed"`, no row is written either. `WorkLogImport.droppedBlocks` is the surface where lossy-conversion shows up — don't lose it.
- **OneDrive sync interaction during commits.** When committing batched changes after a long session, run `git -c gc.auto=0 commit -m "..."` to bypass auto-gc y/n loops. Stage explicit paths via `git add <path1> <path2> ...` rather than `git add -A` — the worktree usually has unrelated noise from other branches.
- **The "Imported from `<provider>`" folder is not a system folder.** It's a regular `WorkLogFolder` row. The user can rename or delete it. The route's `ensureImportFolder()` will recreate it on the next import. That's intentional.
