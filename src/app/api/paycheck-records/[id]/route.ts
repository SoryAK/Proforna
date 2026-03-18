import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT — update a paycheck record
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.paycheckRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Paycheck record not found" }, { status: 404 });
    }

    const record = await prisma.paycheckRecord.update({
      where: { id },
      data: {
        grossPay: body.grossPay ?? existing.grossPay,
        netPay: body.netPay ?? existing.netPay,
        payRate: body.payRate ?? existing.payRate,
        regularHours: body.regularHours ?? existing.regularHours,
        overtimeHours: body.overtimeHours ?? existing.overtimeHours,
        ytdGross: body.ytdGross ?? existing.ytdGross,
        ytdNet: body.ytdNet ?? existing.ytdNet,
        ytdFederalTax: body.ytdFederalTax ?? existing.ytdFederalTax,
        ytdStateTax: body.ytdStateTax ?? existing.ytdStateTax,
        ytdSocialSec: body.ytdSocialSec ?? existing.ytdSocialSec,
        ytdMedicare: body.ytdMedicare ?? existing.ytdMedicare,
        ytdRetirement: body.ytdRetirement ?? existing.ytdRetirement,
        ytdHealthIns: body.ytdHealthIns ?? existing.ytdHealthIns,
        ytdTotalDed: body.ytdTotalDed ?? existing.ytdTotalDed,
        taxPercentages: body.taxPercentages !== undefined ? body.taxPercentages : existing.taxPercentages,
      },
    });

    return NextResponse.json(record);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove a paycheck record
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const existing = await prisma.paycheckRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Paycheck record not found" }, { status: 404 });
    }

    await prisma.paycheckRecord.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
