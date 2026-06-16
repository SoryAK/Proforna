/**
 * One-time backfill: widen `WorkLog.linkedWorkLogIds` (renamed from
 * `linkedNoteIds` by migration 20260615222114_rename_linked_note_ids_to_linked_worklog_ids)
 * to also project `@r:` (procedure) mentions, not just `@n:` (note) mentions
 * (ADR-0029 P0-#1).
 *
 * Why: the rename migration was a pure column rename — existing rows still
 * only have @n: ids. Notes that mentioned a procedure via @r: before this
 * change won't have the procedure id in their projection, so the backlinks
 * endpoint will return zero rows for procedures that have already been
 * referenced. This script walks every `WorkLog.contentJson` once and writes
 * the unioned (worklog + procedure) extracted set, with the same self-loop
 * guard the PUT route uses.
 *
 * Idempotent: re-running is a no-op once converged (skip-if-equal-as-set
 * guard, identical to the PUT route's autosave behaviour).
 *
 * Run with:
 *   npx tsx scripts/migrations/2026-06-15-backfill-linked-worklog-ids.ts
 *
 * Add `--dry-run` to print counts without writing.
 */

import { prisma } from "../../src/lib/prisma";
import { extractMentionEntityIds } from "../../src/lib/worklog/prosemirror-to-text";
import { arraysEqualAsSets } from "../../src/lib/array-set-equal";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[backfill-linked-worklog-ids] starting${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  const allLogs = await prisma.workLog.findMany({
    select: { id: true, contentJson: true, linkedWorkLogIds: true },
  });
  console.log(`  Scanning ${allLogs.length} WorkLog rows.`);

  let scanned = 0;
  let updated = 0;
  let totalLinksWritten = 0;

  for (const log of allLogs) {
    if (!log.contentJson) continue;
    scanned += 1;

    // Mirror the PUT route: union @n: + @r: chip ids, drop self-loops.
    const extracted = Array.from(
      new Set([
        ...extractMentionEntityIds(log.contentJson, "worklog"),
        ...extractMentionEntityIds(log.contentJson, "procedure"),
      ]),
    ).filter((entityId) => entityId !== log.id);

    if (arraysEqualAsSets(extracted, log.linkedWorkLogIds)) continue;

    updated += 1;
    totalLinksWritten += extracted.length;
    if (!dryRun) {
      await prisma.workLog.update({
        where: { id: log.id },
        data: { linkedWorkLogIds: extracted },
      });
    }
    console.log(
      `  ${dryRun ? "would update" : "updated"} ${log.id} — ${extracted.length} link(s)`,
    );
  }

  console.log(
    `[backfill-linked-worklog-ids] done. scanned=${scanned} updated=${updated} totalLinksWritten=${totalLinksWritten}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
