import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — fetch paycheck records for a position (or all active positions)
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const positionId = searchParams.get("positionId");

    if (positionId) {
      const records = await prisma.paycheckRecord.findMany({
        where: { positionId },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      return NextResponse.json(records);
    }

    // All records for active positions
    const activePositions = await prisma.workHistory.findMany({
      where: { isActive: true },
      include: {
        paychecks: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return NextResponse.json(activePositions);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST — save a paycheck record from parsed data
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { positionId, paycheck, ytd, percentages } = body;

    if (!positionId) {
      return NextResponse.json({ error: "positionId is required" }, { status: 400 });
    }

    // Validate position exists
    const position = await prisma.workHistory.findFirst({ where: { id: positionId } });
    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    const record = await prisma.paycheckRecord.create({
      data: {
        positionId,
        payPeriodStart: paycheck?.payPeriodStart ? new Date(paycheck.payPeriodStart) : null,
        payPeriodEnd: paycheck?.payPeriodEnd ? new Date(paycheck.payPeriodEnd) : null,
        grossPay: paycheck?.grossPay ?? null,
        netPay: paycheck?.netPay ?? null,
        payRate: paycheck?.payRate ?? null,
        regularHours: paycheck?.regularHours ?? null,
        overtimeHours: paycheck?.overtimeHours ?? null,
        ytdGross: ytd?.grossPay ?? null,
        ytdNet: ytd?.netPay ?? null,
        ytdFederalTax: ytd?.federalTax ?? null,
        ytdStateTax: ytd?.stateTax ?? null,
        ytdSocialSec: ytd?.socialSecurity ?? null,
        ytdMedicare: ytd?.medicare ?? null,
        ytdRetirement: ytd?.retirement ?? null,
        ytdHealthIns: ytd?.healthInsurance ?? null,
        ytdTotalDed: ytd?.totalDeductions ?? null,
        taxPercentages: percentages ? JSON.stringify(percentages) : null,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
