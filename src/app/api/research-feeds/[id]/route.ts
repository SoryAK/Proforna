import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function DELETE(_req: NextRequest, {
 params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Only delete if the feed belongs to the current user
  const feed = await prisma.researchFeed.findFirst({ where: { id, userId } });
  if (!feed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.researchFeed.delete({ where: { id } });
  await logActivity("research_feed", feed.id, "deleted", `Removed feed: ${feed.title}`);
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, {
 params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Only update if the feed belongs to the current user
  const existing = await prisma.researchFeed.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.category !== undefined) update.category = data.category;
  if (data.isActive !== undefined) update.isActive = data.isActive;

  const feed = await prisma.researchFeed.update({ where: { id }, data: update });
  return NextResponse.json(feed);
}
