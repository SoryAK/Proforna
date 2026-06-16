/**
 * One-shot smoke harness for `2026-06-16-wrap-procedure-docs.ts`.
 *
 * Seeds a synthetic legacy procedure (kind=procedure with notes-shape doc),
 * runs the migration's per-row logic against it, asserts the post-shape,
 * then deletes the synthetic row. No external dependencies — keeps the
 * dev DB clean.
 *
 * Run: npx tsx scripts/migrations/2026-06-16-smoke-wrap-procedure-docs.ts
 */

import { prisma } from "../../src/lib/prisma";
import {
  isValidProcedureDoc,
  wrapNoteAsProcedure,
} from "../../src/lib/worklog/procedure-schema";
import { proseMirrorDocToPlainText } from "../../src/lib/worklog/prosemirror-to-text";

const SMOKE_TITLE = "[smoke] legacy procedure";

async function main() {
  console.log("[smoke-wrap] seeding synthetic legacy procedure …");
  const seeded = await prisma.workLog.create({
    data: {
      title: SMOKE_TITLE,
      kind: "procedure",
      date: new Date(),
      content: "Open the panel.\nDisconnect power.",
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Open the panel." }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Disconnect power." }],
          },
        ],
      },
      // Required FK on Resumsify schema — borrow the first User row.
      user: { connect: { id: (await prisma.user.findFirstOrThrow()).id } },
    },
    select: { id: true, contentJson: true },
  });

  const seedRoot = (seeded.contentJson as { type?: string } | null)?.type;
  console.log(`  seeded id=${seeded.id} root=${seedRoot}`);
  if (seedRoot !== "doc") throw new Error("seed precondition failed");

  console.log("[smoke-wrap] running migration logic against the seeded row …");
  const before = await prisma.workLog.findUniqueOrThrow({
    where: { id: seeded.id },
    select: { title: true, contentJson: true },
  });
  const wrapped = wrapNoteAsProcedure(before.contentJson, before.title ?? "");
  const wrappedText = proseMirrorDocToPlainText(wrapped);
  await prisma.workLog.update({
    where: { id: seeded.id },
    data: { contentJson: wrapped, content: wrappedText },
  });

  console.log("[smoke-wrap] verifying post-shape …");
  const after = await prisma.workLog.findUniqueOrThrow({
    where: { id: seeded.id },
    select: { contentJson: true, content: true },
  });
  const ok = isValidProcedureDoc(after.contentJson);
  console.log(`  contentJson valid procedureDoc = ${ok}`);
  console.log(`  content (plain text) =\n${after.content}`);
  if (!ok) throw new Error("post-condition failed: contentJson not procedureDoc");

  console.log("[smoke-wrap] cleaning up synthetic row …");
  await prisma.workLog.delete({ where: { id: seeded.id } });
  console.log("[smoke-wrap] done. ✓");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
