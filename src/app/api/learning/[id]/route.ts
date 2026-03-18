import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.learningItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();

  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.provider !== undefined) update.provider = data.provider || null;
  if (data.type !== undefined) update.type = data.type;
  if (data.status !== undefined) update.status = data.status;
  if (data.progress !== undefined) update.progress = data.progress;
  if (data.url !== undefined) update.url = data.url || null;
  if (data.hoursSpent !== undefined) update.hoursSpent = data.hoursSpent;
  if (data.cost !== undefined) update.cost = data.cost;
  if (data.completedAt !== undefined) update.completedAt = data.completedAt ? new Date(data.completedAt) : null;
  if (data.skills !== undefined) update.skills = data.skills ? JSON.stringify(data.skills) : null;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.tags !== undefined) update.tags = data.tags ? JSON.stringify(data.tags) : null;

  // Auto-set completedAt when status changes to completed
  if (data.status === "completed" && !data.completedAt) {
    update.completedAt = new Date();
    update.progress = 100;
  }

  const item = await prisma.learningItem.update({ where: { id }, data: update });
  await logActivity("learning", item.id, "updated", `Updated learning: ${item.title}`);
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.learningItem.delete({ where: { id } });
  await logActivity("learning", item.id, "deleted", `Removed learning: ${item.title}`);
  return NextResponse.json({ success: true });
}
