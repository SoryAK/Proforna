import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function DELETE(
  _request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const entry = await prisma.timeOffEntry.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.timeOffEntry.delete({ where: { id } });

  // Recalculate usedDays
  const remaining = await prisma.timeOffEntry.findMany({
    where: { balanceId: entry.balanceId, status: { not: "cancelled" } },
  });
  const usedDays = remaining.reduce((sum, e) => sum + e.days, 0);
  await prisma.timeOffBalance.update({
    where: { id: entry.balanceId },
    data: { usedDays },
  });

  return NextResponse.json({ success: true });
}
