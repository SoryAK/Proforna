/**
 * `add-to-job-notes` action route — ADR-0046 Phase D.2.
 *
 * Appends a code-block payload to `WorkHistory.notes` for the target job.
 * Owner-scoped (cross-user → 404) per ADR-0028 pattern.
 */

import { NextResponse } from "next/server";

import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

interface RequestBody {
  content?: string;
  jobId?: string;
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
    select: { id: true, userId: true, notes: true },
  });
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextNotes =
    job.notes && job.notes.trim().length > 0
      ? `${job.notes}\n\n${content}`
      : content;

  const updated = await prisma.workHistory.update({
    where: { id: jobId },
    data: { notes: nextNotes },
    select: { id: true, notes: true },
  });

  return NextResponse.json({ id: updated.id, notes: updated.notes });
}
