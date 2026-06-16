/**
 * One-time backfill: wrap pre-ADR-0030 procedure work-logs into procedureDoc
 * shape (ADR-0030 Unit 5).
 *
 * Why: ADR-0029 introduced `WorkLog.kind = "procedure"` but stored the body
 * as a freeform notes-shape doc (`type: "doc"`). ADR-0030 locks a richer
 * shape (`procedureDoc` topNode with title / optional tools / step+) so the
 * editor can attach toolbar affordances and the read view can render
 * "Step N — Title" labels. Existing procedure rows must be migrated before
 * Unit 6 enables the toolbar.
 *
 * Selection: rows where `kind = "procedure"` AND the contentJson root is
 * NOT already `procedureDoc`. Idempotent on re-run via `wrapNoteAsProcedure`'s
 * own short-circuit.
 *
 * Per-row recipe:
 *   1. If `contentJson` is null but `content` plain text exists, hydrate
 *      it via `plainTextToProseMirrorDoc` first so user data is not lost.
 *   2. Run `wrapNoteAsProcedure(json, title)` — wraps the existing content
 *      array inside a single procedureStep titled "Body" (Unit 2).
 *   3. Re-derive `content` (plain text) from the new procedureDoc via
 *      `proseMirrorDocToPlainText` so the search index (ADR-0011) and the
 *      Notion-export plain-text stay consistent.
 *   4. Write both fields. linkedWorkLogIds is NOT touched — Unit 4 already
 *      taught extractMentionEntityIds about procedureDoc, so the projection
 *      is identical pre/post wrap.
 *
 * Run with:
 *   npx tsx scripts/migrations/2026-06-16-wrap-procedure-docs.ts
 *
 * Add `--dry-run` to print counts without writing.
 */

import { prisma } from "../../src/lib/prisma";
import {
  wrapNoteAsProcedure,
  isValidProcedureDoc,
} from "../../src/lib/worklog/procedure-schema";
import {
  plainTextToProseMirrorDoc,
  proseMirrorDocToPlainText,
} from "../../src/lib/worklog/prosemirror-to-text";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[wrap-procedure-docs] starting${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  const rows = await prisma.workLog.findMany({
    where: { kind: "procedure" },
    select: { id: true, title: true, content: true, contentJson: true },
  });
  console.log(`  Scanning ${rows.length} kind=procedure WorkLog rows.`);

  let scanned = 0;
  let alreadyMigrated = 0;
  let updated = 0;

  for (const row of rows) {
    scanned += 1;

    if (isValidProcedureDoc(row.contentJson)) {
      alreadyMigrated += 1;
      continue;
    }

    // Hydrate from plain text if the row has no contentJson but has content.
    const seedJson =
      row.contentJson ??
      (row.content && row.content.length > 0
        ? plainTextToProseMirrorDoc(row.content)
        : null);

    const wrapped = wrapNoteAsProcedure(seedJson, row.title ?? "");
    const wrappedText = proseMirrorDocToPlainText(wrapped);

    updated += 1;
    if (!dryRun) {
      await prisma.workLog.update({
        where: { id: row.id },
        data: {
          contentJson: wrapped,
          content: wrappedText.length > 0 ? wrappedText : null,
        },
      });
    }
    console.log(
      `  ${dryRun ? "would update" : "updated"} ${row.id} — title=${JSON.stringify(
        (row.title ?? "").slice(0, 40),
      )}`,
    );
  }

  console.log(
    `[wrap-procedure-docs] done. scanned=${scanned} alreadyMigrated=${alreadyMigrated} updated=${updated}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
