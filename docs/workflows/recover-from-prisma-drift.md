# Recover from Prisma migration drift

**Workflow Type:** `recover-from-prisma-drift`
**Last Updated:** 2026-06-09

## Stack Context

- Prisma v6.19.2 (NOT v7 per ADR-0003)
- PostgreSQL @ `localhost:5432` (db: `resumsify`)
- `schema.prisma` source of truth; `prisma/migrations/` shadows it as the deploy history
- `Unsupported("tsvector")?` columns are present (see ADR-0011 search). Prisma cannot express GENERATED expressions for these — every `migrate diff` will eternally report `DROP DEFAULT` against them. This is intrinsic, NOT real drift.

## When this recipe applies

You discover that `prisma/schema.prisma` and the live dev DB agree, but the
ordered list of migration files in `prisma/migrations/` does NOT replay to that
state. Symptoms:

- `prisma migrate status` says "Database schema is up to date!" (history-vs-DB
  table check passes)
- But a fresh clone running `prisma migrate deploy` against an empty DB
  produces a schema that no longer matches `schema.prisma`
- Or: `prisma migrate dev` proposes a destructive reset
- Or: someone (probably you, 6 weeks ago) ran `prisma db execute --stdin` to
  patch in a column instead of authoring a real migration file

Drift sources on Resumsify (history at time of writing):

- ADR-0012 Asset Knowledge Backbone — `AssetType` / `AssetDocument` /
  `AssetLink` tables + `JobAsset.assetType` (string) → `JobAsset.assetTypeId`
  (FK) rename. Shipped without migration files.
- ADR-0020 Voice Dictation — `WorkLogPreference.voiceDictationConsentedAt`
  added via `db execute` because of pre-existing drift, compounding the
  problem.
- `WorkLog_shiftId_idx` removed from schema but DROP INDEX never recorded.

## Successful Sequence

1. **Establish ground truth.** Run `npx prisma migrate status` — confirm the
   live DB is up to date with the recorded history (no failed/pending). If
   this fails, stop. You have a different problem (a partially-applied
   migration) and this recipe doesn't apply.

2. **Create a shadow DB on the same Postgres instance.** Same host, same
   credentials, different name:
   ```powershell
   $envLine = (Get-Content .env | Select-String "^DATABASE_URL=").Line
   $dbUrl = $envLine -replace '^DATABASE_URL=', '' -replace '^"', '' -replace '"$', ''
   $env:LIVE_URL = $dbUrl
   $env:SHADOW_URL = $dbUrl -replace '/resumsify(\?.*)?$', '/resumsify_shadow$1'
   'CREATE DATABASE resumsify_shadow;' | npx prisma db execute --stdin --url $env:LIVE_URL
   ```

3. **Diff history-vs-schema.** Asks Prisma "what SQL would I need to add to
   replay the recorded migrations and reach the current schema?":
   ```powershell
   npx prisma migrate diff `
     --from-migrations prisma/migrations `
     --to-schema-datamodel prisma/schema.prisma `
     --shadow-database-url $env:SHADOW_URL `
     --script > drift.sql
   ```

4. **Read `drift.sql` line-by-line and sanitize.** The output is raw,
   alphabetically ordered, and may contain false positives:
   - **Skip every `ALTER COLUMN "<tsvector_col>" DROP DEFAULT` line.** This is
     the intrinsic Prisma false-positive for `Unsupported("tsvector")?`
     columns. Including it WILL break a fresh deploy: Postgres rejects
     `DROP DEFAULT` on `GENERATED ALWAYS` columns — the correct cleanup is
     `DROP EXPRESSION`, which Prisma also can't express.
   - **Reorder for FK safety.** `migrate diff` may emit FKs alongside their
     tables out of dependency order. CREATE TABLEs first, then ALTER TABLEs,
     then indexes, then foreign keys.
   - **Add a header comment** documenting every drift source by ADR or sprint
     so the next reader knows why each block exists. Future Sory will thank
     present Sory.

5. **Author the migration file.** Name it
   `prisma/migrations/YYYYMMDDHHMMSS_baseline_drift_capture/migration.sql`.
   Date should be today, time can be any non-clashing value. Paste the
   sanitized SQL.

6. **Mark applied on live DB without re-executing.** Live DB already has the
   target state — running the SQL would conflict:
   ```powershell
   $env:DATABASE_URL = $env:LIVE_URL
   npx prisma migrate resolve --applied "<your_migration_dir_name>"
   ```
   Expected: "Migration ... marked as applied."

7. **Verify live DB.** Re-run `npx prisma migrate status`. Expected: "Database
   schema is up to date!". The diff in step 3 should now show only the
   intrinsic tsvector noise (or nothing if no tsvector columns exist).

8. **Validate fresh deploy on the shadow.** This is the proof-of-life:
   ```powershell
   "DROP DATABASE IF EXISTS resumsify_shadow; CREATE DATABASE resumsify_shadow;" `
     | npx prisma db execute --stdin --url $env:LIVE_URL
   $env:DATABASE_URL = $env:SHADOW_URL
   npx prisma migrate deploy
   npx prisma migrate status
   ```
   Expected: every migration applies, status reports "Database schema is up to
   date!". A fresh-clone teammate can now reproduce the live schema exactly.

9. **Clean up.**
   ```powershell
   Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
   'DROP DATABASE IF EXISTS resumsify_shadow;' | npx prisma db execute --stdin --url $env:LIVE_URL
   Remove-Item drift.sql -Force
   ```

10. **Commit.** Single commit. Subject:
    `chore(prisma): baseline-drift capture migration (<ADR refs>)`. Use
    `git -c gc.auto=0 commit` per the OneDrive gotcha note. **Do not push**
    unless asked.

## First-Attempt Failures

1. **Tried `prisma migrate dev` first.** It proposes a `migrate reset` —
   refused, would drop user data. The dev-loop migrate command is the wrong
   tool when history disagrees with schema.

2. **Tried to include the `ALTER COLUMN "search_vector" DROP DEFAULT` line
   in the baseline migration.** Fresh deploy failed on Postgres
   `cannot drop default on a generated column`. Removed the line, validated,
   green.

3. **Multi-line `run_in_terminal` blocks were silently eaten on Windows
   PowerShell.** Workaround: collapse to single-line semicolon-joined
   commands. Symptom is the terminal returning with cwd but no output and the
   command never actually executing.

4. **Tried to drop `resumsify_shadow` while connected.** Postgres refuses with
   "database is being accessed by other users". Make sure `$env:DATABASE_URL`
   is pointing at the LIVE DB before the drop, not the shadow.

## Gotchas

- `npx prisma db execute --stdin` does NOT print SELECT results — only
  "Script executed successfully." If you need to inspect data, use `psql`
  directly.
- `.env` `DATABASE_URL` parsing: PowerShell `Get-Content` returns the raw
  line including surrounding quotes. The strip pattern `-replace '^"', ''
  -replace '"$', ''` is required.
- `prisma migrate resolve --applied` does NOT re-execute the SQL — it only
  inserts a row into `_prisma_migrations`. Safe on a live DB that's already
  in the target state. NEVER safe on a fresh DB (would mark migrations
  applied without running them).
- Future schema changes: **never use `prisma db execute` for column/table
  changes**. Always author a real dated migration file via
  `prisma migrate dev --create-only`. If `migrate dev` itself can't run due
  to drift, fix the drift first using this recipe, then resume normal flow.

## Reference commit

`1f12fcc chore(prisma): baseline-drift capture migration (ADR-0012/0020)` —
first time this recipe was executed end-to-end on Resumsify.
