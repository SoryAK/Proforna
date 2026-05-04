import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET /api/submissions/[id]/vcard
// Returns a downloadable vCard (.vcf) for a recruiter submission so the
// candidate can save the recruiter to their phone contacts.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sub = await prisma.recruiterSubmission.findUnique({ where: { id } });
  if (!sub || sub.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const escape = (v: string) =>
    v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

  const fullName = sub.recruiterName.trim();
  const parts = fullName.split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ");
  const noteLines = [
    `Reached out via Resumsify`,
    sub.jobTitle ? `Role: ${sub.jobTitle}` : null,
    sub.location ? `Location: ${sub.location}` : null,
    sub.salaryMin || sub.salaryMax
      ? `Comp: ${sub.salaryMin ?? "?"}–${sub.salaryMax ?? "?"}`
      : null,
    sub.message ? `Message: ${sub.message}` : null,
  ].filter(Boolean) as string[];

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escape(last)};${escape(first)};;;`,
    `FN:${escape(fullName)}`,
  ];
  if (sub.company) lines.push(`ORG:${escape(sub.company)}`);
  if (sub.jobTitle) lines.push(`TITLE:${escape(sub.jobTitle)} (Recruiter)`);
  if (sub.recruiterEmail) lines.push(`EMAIL;TYPE=WORK:${escape(sub.recruiterEmail)}`);
  if (sub.recruiterPhone) lines.push(`TEL;TYPE=WORK,VOICE:${escape(sub.recruiterPhone)}`);
  if (sub.linkedinUrl) lines.push(`URL:${escape(sub.linkedinUrl)}`);
  if (noteLines.length) lines.push(`NOTE:${escape(noteLines.join("\n"))}`);
  lines.push("END:VCARD");

  const vcf = lines.join("\r\n");
  const safeName = fullName.replace(/[^a-z0-9_-]+/gi, "_") || "contact";

  return new NextResponse(vcf, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.vcf"`,
      "Cache-Control": "no-store",
    },
  });
}
