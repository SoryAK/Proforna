import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/** DELETE /api/work-history/:id/locations/:locId */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; locId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, locId } = await params;
  // Verify the parent belongs to this user
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const loc = await prisma.workHistoryLocation.findFirst({ where: { id: locId, workHistoryId: id } });
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  await prisma.workHistoryLocation.delete({ where: { id: locId } });
  return NextResponse.json({ ok: true });
}

/** PATCH /api/work-history/:id/locations/:locId — update skills or other fields */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, locId } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const loc = await prisma.workHistoryLocation.findFirst({ where: { id: locId, workHistoryId: id } });
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const body = await request.json();
  const update: Record<string, unknown> = {};

  if (body.skills !== undefined) {
    if (body.skills === null) {
      update.skills = null;
    } else if (Array.isArray(body.skills)) {
      update.skills = JSON.stringify(body.skills.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 50));
    }
  }
  if (body.label) update.label = String(body.label).slice(0, 200);
  if (body.type) update.type = String(body.type);
  if (body.startDate !== undefined) update.startDate = body.startDate ? String(body.startDate).slice(0, 7) : null;
  if (body.endDate !== undefined) update.endDate = body.endDate ? String(body.endDate).slice(0, 7) : null;
  if (body.includeInOutline !== undefined) update.includeInOutline = body.includeInOutline === true;
  if (body.closed !== undefined) update.closed = Boolean(body.closed);
  if (body.hoverNote !== undefined) update.hoverNote = body.hoverNote ? String(body.hoverNote).slice(0, 280) : null;
  if (body.outlineColor !== undefined) {
    const c = body.outlineColor ? String(body.outlineColor).trim() : null;
    update.outlineColor = c && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : null;
  }
  if (body.coverImage !== undefined) update.coverImage = body.coverImage ? String(body.coverImage) : null;
  if (body.coverImageY !== undefined) update.coverImageY = body.coverImageY != null ? Math.max(0, Math.min(100, Number(body.coverImageY))) : 50;

  const updated = await prisma.workHistoryLocation.update({ where: { id: locId }, data: update });
  return NextResponse.json(updated);
}
