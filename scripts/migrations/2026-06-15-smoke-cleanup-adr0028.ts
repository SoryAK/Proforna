/**
 * Cleanup ADR-0028 smoke seed records (counterpart to
 * 2026-06-15-smoke-seed-adr0028.ts). Idempotent — deleteMany over the fixed
 * smoke ids no-ops on second run.
 */
import { prisma } from "../../src/lib/prisma";

const CONTACT_ID = "smoke-contact-adr0028";
const WORKLOG_ID = "smoke-worklog-adr0028";

async function main() {
  const wl = await prisma.workLog.deleteMany({ where: { id: WORKLOG_ID } });
  const ct = await prisma.contact.deleteMany({ where: { id: CONTACT_ID } });
  console.log("[smoke-cleanup] worklog deleted:", wl.count, "contact deleted:", ct.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
