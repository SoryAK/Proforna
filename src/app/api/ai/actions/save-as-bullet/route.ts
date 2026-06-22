/**
 * `save-as-bullet` action route — ADR-0046 Phase D.2.
 *
 * Appends a string to `WorkHistory.accomplishments` — a JSON-array string
 * the schema already provisions for resume-bullet-style entries. The
 * existing column has no enforced shape, so this route is defensive:
 *   - null / blank → new array `[content]`
 *   - valid JSON array → push (skipping exact duplicates)
 *   - any other string → wrap `[oldValue, content]`
 *
 * Owner-scoped per ADR-0028.
 */

import { NextResponse } from "next/server";

import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

interface RequestBody {
  content?: string;
  jobId?: string;
}

/**
 * Normalize whatever is currently in `WorkHistory.accomplishments` into an
 * array of strings. Legacy freeform values get wrapped; nulls become empty.
 */
function parseExisting(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    if (typeof parsed === "string") {
      return [parsed];
    }
  } catch {
    // fall through — not JSON
  }
  return [raw];
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const job = await prisma.workHistory.findUnique({
    where: { id: jobId },
    select: { id: true, userId: true, accomplishments: true },
  });
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = parseExisting(job.accomplishments);
  if (existing.includes(content)) {
    // No-op for exact duplicates so re-clicking the button doesn't bloat
    // the resume bullet list.
    return NextResponse.json({
      id: job.id,
      accomplishments: JSON.stringify(existing),
    });
  }

  const next = [...existing, content];
  const updated = await prisma.workHistory.update({
    where: { id: jobId },
    data: { accomplishments: JSON.stringify(next) },
    select: { id: true, accomplishments: true },
  });

  return NextResponse.json({
    id: updated.id,
    accomplishments: updated.accomplishments,
  });
}
