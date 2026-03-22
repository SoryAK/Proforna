import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — list active (non-dismissed) reminders, optionally filter by due soon
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const showAll = req.nextUrl.searchParams.get("all") === "true";

  const where = showAll
    ? { userId }
    : { userId, isDismissed: false, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] };

  const reminders = await prisma.reminder.findMany({
    where,
    orderBy: { remindAt: "asc" },
    take: 50,
  });

  return NextResponse.json(reminders);
}

// POST — create a new reminder
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { entityType, entityId, title, remindAt } = body as {
    entityType: string;
    entityId: string;
    title: string;
    remindAt: string;
  };

  if (!entityType || !entityId || !title || !remindAt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const reminder = await prisma.reminder.create({
    data: { userId,
      entityType,
      entityId,
      title,
      remindAt: new Date(remindAt),
    },
  });

  return NextResponse.json(reminder, { status: 201 });
}
