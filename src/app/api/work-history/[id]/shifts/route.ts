import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { minutesFromTimeLabel } from "@/lib/worklog-shifts";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const wh = await prisma.workHistory.findFirst({ where: { id, userId }, select: { id: true } });
  if (!wh) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.workHistoryShift.findMany({
    where: { userId, workHistoryId: id, isActive: true },
    orderBy: [{ createdAt: "asc" }],
  });

  return NextResponse.json(rows);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const wh = await prisma.workHistory.findFirst({ where: { id, userId }, select: { id: true } });
  if (!wh) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const startMinute =
    typeof body.startMinute === "number"
      ? body.startMinute
      : minutesFromTimeLabel(String(body.startTime ?? ""));
  const endMinute =
    typeof body.endMinute === "number"
      ? body.endMinute
      : minutesFromTimeLabel(String(body.endTime ?? ""));

  if (!name || startMinute == null || endMinute == null) {
    return NextResponse.json({ error: "name, startTime, and endTime are required" }, { status: 400 });
  }

  const created = await prisma.workHistoryShift.create({
    data: {
      userId,
      workHistoryId: id,
      name: name.slice(0, 80),
      startMinute,
      endMinute,
      isActive: true,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
