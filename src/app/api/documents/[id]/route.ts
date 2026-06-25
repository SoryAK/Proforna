import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { readDocumentBytes } from "@/lib/documents/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  // Scope to user to prevent horizontal privilege escalation.
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await readDocumentBytes(doc);
  // Buffer is a Uint8Array at runtime and a valid BodyInit; TS infers
  // `Buffer<ArrayBufferLike>` which is wider than NextResponse's typings
  // require. Contained cast keeps the storage service signature clean.
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${doc.fileName}"`,
      "Content-Length": buffer.length.toString(),
    },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json();
  const { name, category, notes, entityType, entityId, folderId } = body as {
    name?: string;
    category?: string;
    notes?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    folderId?: string | null;
  };

  // Confirm the doc belongs to this user before letting them mutate it.
  const existing = await prisma.document.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If a folderId is being set, verify it belongs to this user.
  if (folderId) {
    const folder = await prisma.documentFolder.findFirst({
      where: { id: folderId, userId },
      select: { id: true },
    });
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const doc = await prisma.document.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(notes !== undefined && { notes }),
      ...(entityType !== undefined && { entityType }),
      ...(entityId !== undefined && { entityId }),
      ...(folderId !== undefined && { folderId }),
    },
  });

  await logActivity("document", doc.id, "updated", `Updated document: ${doc.name}`);
  return NextResponse.json(doc);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  // Scope to user to prevent cross-user deletes.
  const doc = await prisma.document.findFirst({
    where: { id, userId },
    select: { name: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.document.delete({ where: { id } });
  await logActivity("document", id, "deleted", `Deleted document: ${doc.name}`);
  return NextResponse.json({ success: true });
}
