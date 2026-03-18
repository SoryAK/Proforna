import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const feed = await prisma.researchFeed.delete({ where: { id } });
  await logActivity("research_feed", feed.id, "deleted", `Removed feed: ${feed.title}`);
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.category !== undefined) update.category = data.category;
  if (data.isActive !== undefined) update.isActive = data.isActive;

  const feed = await prisma.researchFeed.update({ where: { id }, data: update });
  return NextResponse.json(feed);
}
