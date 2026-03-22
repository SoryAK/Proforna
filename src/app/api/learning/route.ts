import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.learningItem.findMany({ where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const item = await prisma.learningItem.create({
    data: { userId,
      title: data.title,
      provider: data.provider || null,
      type: data.type || "course",
      status: data.status || "not_started",
      progress: data.progress ?? 0,
      url: data.url || null,
      hoursSpent: data.hoursSpent ?? 0,
      cost: data.cost ?? 0,
      completedAt: data.completedAt ? new Date(data.completedAt) : null,
      skills: data.skills ? JSON.stringify(data.skills) : null,
      notes: data.notes || null,
      tags: data.tags ? JSON.stringify(data.tags) : null,
    },
  });
  await logActivity("learning", item.id, "created", `Started learning: ${item.title}`);
  return NextResponse.json(item, { status: 201 });
}
