import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// DELETE — remove a saved search
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.savedSearch.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.savedSearch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// PATCH — update a saved search (e.g. mark refreshed, update counts)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.savedSearch.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { lastRunAt, lastCount, newCount, isActive } = body;
  const data: Record<string, unknown> = {};
  if (lastRunAt !== undefined) data.lastRunAt = new Date(lastRunAt);
  if (lastCount !== undefined) data.lastCount = lastCount;
  if (newCount !== undefined) data.newCount = newCount;
  if (isActive !== undefined) data.isActive = isActive;

  const updated = await prisma.savedSearch.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}
