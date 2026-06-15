/**
 * One-time backfill: populate `WorkLog.linkedContactIds` from existing `@p:`
 * mentions already stored in `contentJson` (ADR-0028).
 *
 * Why: the migration `20260615170725_add_worklog_linked_contact_ids` only
 * adds the column with an empty default. Notes saved before the PUT-route
 * wiring (Unit 2) won't have their existing `@p:` chips reflected in the
 * denormalized array, so the new backlinks endpoint will return zero rows
 * for contacts that have already been mentioned. This script walks every
 * `WorkLog.contentJson` once and writes the extracted contact-id set.
 *
 * Idempotent: re-running is a no-op once converged (skip-if-equal-as-set
 * guard, identical to the PUT route's autosave behaviour).
 *
 * Run with:
 *   npx tsx scripts/migrations/2026-06-15-backfill-linked-contact-ids.ts
 *
 * Add `--dry-run` to print counts without writing.
 */

import { prisma } from "../../src/lib/prisma";
import { extractMentionEntityIds } from "../../src/lib/worklog/prosemirror-to-text";
import { arraysEqualAsSets } from "../../src/lib/array-set-equal";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[backfill-linked-contact-ids] starting${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  const allLogs = await prisma.workLog.findMany({
    select: { id: true, contentJson: true, linkedContactIds: true },
  });
  console.log(`  Scanning ${allLogs.length} WorkLog rows.`);

  let scanned = 0;
  let updated = 0;
  let totalContactsLinked = 0;

  for (const log of allLogs) {
    if (!log.contentJson) continue;
    scanned += 1;

    const extracted = extractMentionEntityIds(log.contentJson, "contact");
    if (arraysEqualAsSets(extracted, log.linkedContactIds)) continue;

    updated += 1;
    totalContactsLinked += extracted.length;
    if (!dryRun) {
      await prisma.workLog.update({
        where: { id: log.id },
        data: { linkedContactIds: extracted },
      });
    }
    console.log(
      `  ${dryRun ? "would update" : "updated"} ${log.id} — ${extracted.length} contact(s)`,
    );
  }

  console.log(
    `[backfill-linked-contact-ids] done. Scanned=${scanned} updated=${updated} contactsLinked=${totalContactsLinked}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
