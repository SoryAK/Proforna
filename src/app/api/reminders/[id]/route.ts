import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// PATCH — dismiss or snooze a reminder
export async function PATCH(
  req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { action, snoozeMinutes } = body as {
    action: "dismiss" | "snooze";
    snoozeMinutes?: number;
  };

  if (action === "dismiss") {
    const reminder = await prisma.reminder.update({
      where: { id  },
      data: { isDismissed: true },
    });
    return NextResponse.json(reminder);
  }

  if (action === "snooze") {
    const minutes = snoozeMinutes ?? 60;
    const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000);
    const reminder = await prisma.reminder.update({
      where: { id  },
      data: { snoozedUntil },
    });
    return NextResponse.json(reminder);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// DELETE — delete a reminder
export async function DELETE(
  _req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.reminder.delete({ where: { id  } });
  return NextResponse.json({ ok: true });
}
