import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = Buffer.from(doc.data, "base64");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${doc.fileName}"`,
      "Content-Length": buffer.length.toString(),
    },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { name, category, notes, entityType, entityId } = body;

  const doc = await prisma.document.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(notes !== undefined && { notes }),
      ...(entityType !== undefined && { entityType }),
      ...(entityId !== undefined && { entityId }),
    },
  });

  await logActivity("document", doc.id, "updated", `Updated document: ${doc.name}`);
  return NextResponse.json(doc);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const doc = await prisma.document.findUnique({ where: { id }, select: { name: true } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.document.delete({ where: { id } });
  await logActivity("document", id, "deleted", `Deleted document: ${doc.name}`);
  return NextResponse.json({ success: true });
}
