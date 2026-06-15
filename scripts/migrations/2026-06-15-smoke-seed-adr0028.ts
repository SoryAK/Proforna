/**
 * Smoke seed for ADR-0028 Unit 4 verification.
 * Creates: 1 contact + 1 worklog note that mentions them via @p: chip.
 * Idempotent — uses fixed string ids so re-runs upsert.
 */
import { prisma } from "../../src/lib/prisma";

const USER_EMAIL_HINT = "jameslewise";
const CONTACT_ID = "smoke-contact-adr0028";
const WORKLOG_ID = "smoke-worklog-adr0028";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { contains: USER_EMAIL_HINT, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error("[smoke-seed] no user matching hint:", USER_EMAIL_HINT);
    process.exit(1);
  }
  console.log("[smoke-seed] user:", user);

  await prisma.contact.upsert({
    where: { id: CONTACT_ID },
    create: {
      id: CONTACT_ID,
      userId: user.id,
      name: "Smoke Test Contact",
      email: "smoke@example.com",
      relationship: "professional",
    },
    update: { name: "Smoke Test Contact", userId: user.id },
  });

  // Build a ProseMirror doc with one @p: contact mention chip.
  const contentJson = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Met with " },
          {
            type: "mention",
            attrs: {
              entityType: "contact",
              entityId: CONTACT_ID,
              label: "Smoke Test Contact",
            },
          },
          { type: "text", text: " about the new role." },
        ],
      },
    ],
  };

  await prisma.workLog.upsert({
    where: { id: WORKLOG_ID },
    create: {
      id: WORKLOG_ID,
      userId: user.id,
      title: "ADR-0028 Smoke Test Note",
      content: "Met with Smoke Test Contact about the new role.",
      contentJson,
      date: new Date(),
      linkedContactIds: [CONTACT_ID],
    },
    update: {
      title: "ADR-0028 Smoke Test Note",
      content: "Met with Smoke Test Contact about the new role.",
      contentJson,
      linkedContactIds: [CONTACT_ID],
    },
  });

  console.log("[smoke-seed] OK — contact:", CONTACT_ID, "worklog:", WORKLOG_ID);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
