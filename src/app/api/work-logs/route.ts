import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — list work logs for a position, optionally filtered
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");
  const accomplishments = searchParams.get("accomplishments");

  if (!positionId) {
    return NextResponse.json({ error: "positionId required" }, { status: 400 });
  }

  const where: Record<string, unknown> = { positionId };

  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }
  if (category && category !== "all") {
    where.category = category;
  }
  if (accomplishments === "true") {
    where.accomplishment = true;
  }

  const logs = await prisma.workLog.findMany({
    where,
    orderBy: { date: "desc" },
  });

  return NextResponse.json(logs);
}

// POST — create a work log entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { positionId, date, title, content, category, hours, tags, accomplishment, impact } = body;

    if (!positionId || !date || !title) {
      return NextResponse.json({ error: "positionId, date, and title are required" }, { status: 400 });
    }

    const log = await prisma.workLog.create({
      data: {
        positionId,
        date: new Date(date),
        title,
        content: content || null,
        category: category || "task",
        hours: hours ? parseFloat(hours) : null,
        tags: tags || null,
        accomplishment: accomplishment ?? false,
        impact: impact || null,
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
