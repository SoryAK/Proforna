/**
 * One-time migration: fix worklog mention chip labels (ADR-0016 follow-up)
 *
 * Why: the initial ADR-0016 implementation derived the chip `label` attr
 * from `proseMirrorDocToPlainText(contentJson)` first-line, which produced
 * wrong labels (e.g. "Alright, so the main issue we wer…" instead of the
 * actual `WorkLog.title` "Crusher #3 motor issue"). The bug-fix on
 * 2026-06-09 reroutes new chips through the shared label fallback chain
 * (title → first content line → ISO date). This script rewrites any chips
 * already persisted before that fix.
 *
 * Idempotent: re-running this script is a no-op once labels are correct
 * (the pure rewriter only mutates a chip when the looked-up label
 * differs).
 *
 * Run with:
 *   npx tsx scripts/migrations/2026-06-09-fix-worklog-mention-labels.ts
 *
 * Add `--dry-run` to print counts without writing.
 */

import { prisma } from "../../src/lib/prisma";
import { deriveWorklogLabel } from "../../src/lib/worklog/derive-worklog-label";
import { rewriteWorklogMentionLabels } from "../../src/lib/worklog/rewrite-worklog-mention-labels";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[fix-worklog-mention-labels] starting${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  // 1. Build canonical-label lookup map for every WorkLog row.
  const allLogs = await prisma.workLog.findMany({
    select: { id: true, title: true, contentJson: true, date: true },
  });
  const labelById = new Map<string, string>();
  for (const log of allLogs) {
    labelById.set(
      log.id,
      deriveWorklogLabel({
        title: log.title,
        contentJson: log.contentJson,
        date: log.date,
      }),
    );
  }
  console.log(`  Built label lookup for ${labelById.size} WorkLog rows.`);

  // 2. Walk every doc, rewrite stale chips, persist if changed.
  let docsScanned = 0;
  let docsUpdated = 0;
  let chipsRewritten = 0;
  for (const log of allLogs) {
    if (!log.contentJson) continue;
    docsScanned += 1;

    const result = rewriteWorklogMentionLabels(log.contentJson, (id) =>
      labelById.get(id) ?? null,
    );
    if (!result.changed) continue;

    chipsRewritten += result.rewriteCount;
    docsUpdated += 1;
    if (!dryRun) {
      await prisma.workLog.update({
        where: { id: log.id },
        data: { contentJson: result.doc as never },
      });
    }
    console.log(
      `  ${dryRun ? "would update" : "updated"} ${log.id} — ${result.rewriteCount} chip(s)`,
    );
  }

  console.log(
    `[fix-worklog-mention-labels] done. Scanned=${docsScanned} updated=${docsUpdated} chips=${chipsRewritten}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
