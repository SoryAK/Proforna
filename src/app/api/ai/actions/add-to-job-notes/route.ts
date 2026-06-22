/**
 * `add-to-job-notes` action route — ADR-0046 Phase D.2.
 *
 * Creates a `WorkHistoryNote` child row attached to the target job.
 * Owner-scoped (cross-user → 404) per ADR-0028 pattern.
 *
 * Schema-truth note (2026-06-22): `WorkHistory.notes` is the relation
 * `notes: WorkHistoryNote[]` — NOT a scalar column. The original v1
 * route tried `prisma.workHistory.update({ data: { notes } })` and threw
 * `Unknown field 'notes'` at runtime against the real database. Each
 * click creates one new timestamped child row (journal semantics).
 * Bullets dedupe; notes do not.
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
    select: { id: true, userId: true },
  });
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const note = await prisma.workHistoryNote.create({
    data: { workHistoryId: jobId, content },
    select: { id: true, workHistoryId: true, content: true },
  });

  return NextResponse.json({
    id: note.id,
    workHistoryId: note.workHistoryId,
    content: note.content,
  });
}
