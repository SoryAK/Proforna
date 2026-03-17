import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");
  if (!positionId) {
    return NextResponse.json({ error: "positionId required" }, { status: 400 });
  }

  const balances = await prisma.timeOffBalance.findMany({
    where: { positionId },
    include: { entries: { orderBy: { startDate: "desc" } } },
    orderBy: { category: "asc" },
  });
  return NextResponse.json(balances);
}

export async function POST(request: Request) {
  const body = await request.json();
  const balance = await prisma.timeOffBalance.create({
    data: {
      positionId: body.positionId,
      category: body.category,
      totalDays: body.totalDays,
      usedDays: body.usedDays ?? 0,
      year: body.year,
      accrual: body.accrual || "annual",
      carryOver: body.carryOver ?? 0,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(balance, { status: 201 });
}
