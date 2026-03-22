import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const entry = await prisma.timeOffEntry.create({
    data: {
      balanceId: body.balanceId,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      days: body.days,
      status: body.status || "approved",
      reason: body.reason || null,
    },
  });

  // Auto-update usedDays on the balance
  const allEntries = await prisma.timeOffEntry.findMany({
    where: { balanceId: body.balanceId, status: { not: "cancelled" } },
  });
  const usedDays = allEntries.reduce((sum, e) => sum + e.days, 0);
  await prisma.timeOffBalance.update({
    where: { id: body.balanceId },
    data: { usedDays },
  });

  return NextResponse.json(entry, { status: 201 });
}
