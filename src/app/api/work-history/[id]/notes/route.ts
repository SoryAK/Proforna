import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/** GET /api/work-history/:id/notes — list notes for a work history entry */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = await prisma.workHistoryNote.findMany({
    where: { workHistoryId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(notes);
}

/** POST /api/work-history/:id/notes — add a note */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const { content, imageUrl } = body;

  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const note = await prisma.workHistoryNote.create({
    data: {
      workHistoryId: id,
      content: content.trim().slice(0, 5000),
      imageUrl: imageUrl ? String(imageUrl).slice(0, 2000) : null,
    },
  });
  return NextResponse.json(note, { status: 201 });
}

/** DELETE /api/work-history/:id/notes — delete a note (noteId in body) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { noteId } = await request.json();
  if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

  await prisma.workHistoryNote.deleteMany({ where: { id: noteId, workHistoryId: id } });
  return NextResponse.json({ ok: true });
}
