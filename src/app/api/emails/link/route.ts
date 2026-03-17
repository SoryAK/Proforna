import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — auto-link unlinked emails to applications by matching company names
// in sender addresses and email subjects
export async function POST() {
  const applications = await prisma.jobApplication.findMany({
    select: { id: true, company: true },
  });

  if (!applications.length) {
    return NextResponse.json({ linked: 0 });
  }

  // Build a map of normalised company name → application id
  const companyMap = new Map<string, string>();
  for (const app of applications) {
    // Normalise: lowercase, strip common suffixes
    const key = app.company
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|corp|co|company|group|technologies|tech)\b\.?/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();
    if (key) companyMap.set(key, app.id);
  }

  // Fetch all unlinked emails
  const unlinked = await prisma.email.findMany({
    where: { applicationId: null },
    select: { id: true, sender: true, subject: true },
  });

  let linked = 0;
  const updates: { id: string; applicationId: string }[] = [];

  for (const email of unlinked) {
    const haystack = `${email.sender ?? ""} ${email.subject ?? ""}`.toLowerCase();

    for (const [key, appId] of companyMap) {
      // Match the normalised key within the sender/subject
      // Also check original company name (case insensitive)
      const app = applications.find((a) => a.id === appId)!;
      if (
        haystack.includes(key) ||
        haystack.includes(app.company.toLowerCase())
      ) {
        updates.push({ id: email.id, applicationId: appId });
        linked++;
        break; // first match wins
      }
    }
  }

  // Batch update — SQLite doesn't support updateMany with varying data,
  // so do individual updates (still fast for typical volumes)
  for (const u of updates) {
    await prisma.email.update({
      where: { id: u.id },
      data: { applicationId: u.applicationId },
    });
  }

  return NextResponse.json({ linked });
}
