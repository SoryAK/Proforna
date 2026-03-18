import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const search = await prisma.marketSearch.delete({ where: { id } });
  await logActivity("market_search", search.id, "deleted", `Removed search: ${search.title}`);
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const update: Record<string, unknown> = {};
  if (data.lastData !== undefined) {
    update.lastData = JSON.stringify(data.lastData);
    update.lastFetchedAt = new Date();
  }
  if (data.title !== undefined) update.title = data.title;

  const search = await prisma.marketSearch.update({ where: { id }, data: update });
  return NextResponse.json(search);
}
