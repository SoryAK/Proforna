import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const action = searchParams.get("action");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const cursor = searchParams.get("cursor"); // for pagination

  const where: Record<string, unknown> = {};
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;

  const items = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1, // fetch one extra for "hasMore"
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}
