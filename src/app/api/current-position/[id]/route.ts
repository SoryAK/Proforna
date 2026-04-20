import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/* ── field mapping helpers ──────────────────────────────────── */

function mapToPosition(wh: Record<string, unknown>) {
  const { title, salaryAmount, salaryCurrency, workMode, benefitRecords, ...rest } = wh as Record<string, unknown>;
  return { ...rest, role: title, salary: salaryAmount, currency: salaryCurrency, type: workMode, benefits: benefitRecords ?? (wh as Record<string, unknown>).benefits };
}

const RENAME: Record<string, string> = { role: "title", salary: "salaryAmount", currency: "salaryCurrency", type: "workMode" };

function mapFromBody(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    data[RENAME[k] ?? k] = v;
  }
  if (data.startDate) {
    const d = new Date(data.startDate as string);
    if (!isNaN(d.getTime())) data.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (data.endDate) {
    const d = new Date(data.endDate as string);
    if (!isNaN(d.getTime())) data.endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (data.hoursPerWeek != null) data.hoursPerWeek = parseFloat(String(data.hoursPerWeek));
  if (data.scheduleBHours != null) data.scheduleBHours = parseFloat(String(data.scheduleBHours));
  if (data.otHoursA != null) data.otHoursA = parseFloat(String(data.otHoursA));
  if (data.otHoursB != null) data.otHoursB = parseFloat(String(data.otHoursB));
  if (data.otRate != null) data.otRate = parseFloat(String(data.otRate));
  if (data.annualRaiseMin != null) data.annualRaiseMin = parseFloat(String(data.annualRaiseMin));
  if (data.annualRaiseMax != null) data.annualRaiseMax = parseFloat(String(data.annualRaiseMax));
  return data;
}

// GET - fetch a single position with related data
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const position = await prisma.workHistory.findFirst({
      where: { id, userId },
      include: {
        compensation: { orderBy: { effectiveDate: "desc" } },
        benefitRecords: true,
        timeOff: true,
        equipment: true,
        attachments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }
    return NextResponse.json(mapToPosition(position as unknown as Record<string, unknown>));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH - update a position
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const data = mapFromBody(body);

    const updated = await prisma.workHistory.update({
      where: { id },
      data,
    });

    return NextResponse.json(mapToPosition(updated as unknown as Record<string, unknown>));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE - remove a position
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    await prisma.workHistory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
