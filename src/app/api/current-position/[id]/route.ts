import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET - fetch a single position with related data
export async function GET(
  _request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const position = await prisma.currentPosition.findFirst({
      where: { id , userId },
      include: {
        compensation: { orderBy: { effectiveDate: "desc" } },
        benefits: true,
        timeOff: true,
      },
    });
    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }
    return NextResponse.json(position);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH - update a position
export async function PATCH(
  request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.startDate) body.startDate = new Date(body.startDate);
    if (body.hoursPerWeek != null) body.hoursPerWeek = parseFloat(body.hoursPerWeek);
    if (body.scheduleBHours != null) body.scheduleBHours = parseFloat(body.scheduleBHours);
    if (body.otHoursA != null) body.otHoursA = parseFloat(body.otHoursA);
    if (body.otHoursB != null) body.otHoursB = parseFloat(body.otHoursB);
    if (body.otRate != null) body.otRate = parseFloat(body.otRate);
    if (body.annualRaiseMin != null) body.annualRaiseMin = parseFloat(body.annualRaiseMin);
    if (body.annualRaiseMax != null) body.annualRaiseMax = parseFloat(body.annualRaiseMax);

    const updated = await prisma.currentPosition.update({
      where: { id  },
      data: body,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE - remove a position
export async function DELETE(
  _request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    await prisma.currentPosition.delete({ where: { id  } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
