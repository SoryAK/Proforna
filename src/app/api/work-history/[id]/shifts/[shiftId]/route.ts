import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { minutesFromTimeLabel } from "@/lib/worklog-shifts";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; shiftId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, shiftId } = await params;
  const existing = await prisma.workHistoryShift.findFirst({
    where: { id: shiftId, userId, workHistoryId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) data.name = String(body.name || "").trim().slice(0, 80);

  if (body.startMinute !== undefined || body.startTime !== undefined) {
    const startMinute =
      typeof body.startMinute === "number"
        ? body.startMinute
        : minutesFromTimeLabel(String(body.startTime ?? ""));
    if (startMinute == null) {
      return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
    }
    data.startMinute = startMinute;
  }

  if (body.endMinute !== undefined || body.endTime !== undefined) {
    const endMinute =
      typeof body.endMinute === "number"
        ? body.endMinute
        : minutesFromTimeLabel(String(body.endTime ?? ""));
    if (endMinute == null) {
      return NextResponse.json({ error: "Invalid end time" }, { status: 400 });
    }
    data.endMinute = endMinute;
  }

  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const updated = await prisma.workHistoryShift.update({
    where: { id: shiftId },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; shiftId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, shiftId } = await params;
  const existing = await prisma.workHistoryShift.findFirst({
    where: { id: shiftId, userId, workHistoryId: id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.workHistoryShift.delete({ where: { id: shiftId } });
  return NextResponse.json({ ok: true });
}
