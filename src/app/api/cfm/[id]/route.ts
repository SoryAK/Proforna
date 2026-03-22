import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// PATCH — update income year or wage tier
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
    const { type, ...data } = body;

    if (type === "tier") {
      const updated = await prisma.wageTier.update({
        where: { id },
        data: {
          ...(data.label !== undefined && { label: data.label }),
          ...(data.hourlyRate !== undefined && { hourlyRate: parseFloat(data.hourlyRate) }),
          ...(data.yearlyRate !== undefined && { yearlyRate: parseFloat(data.yearlyRate) }),
          ...(data.color !== undefined && { color: data.color }),
          ...(data.sortOrder !== undefined && { sortOrder: parseInt(data.sortOrder) }),
        },
      });
      return NextResponse.json(updated);
    }

    // Default: income year
    const updated = await prisma.careerIncomeYear.update({
      where: { id },
      data: {
        ...(data.year !== undefined && { year: parseInt(data.year) }),
        ...(data.grossIncome !== undefined && { grossIncome: parseFloat(data.grossIncome) }),
        ...(data.netIncome !== undefined && { netIncome: data.netIncome ? parseFloat(data.netIncome) : null }),
        ...(data.jobCount !== undefined && { jobCount: parseInt(data.jobCount) }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — delete income year or wage tier
export async function DELETE(
  request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const type = url.searchParams.get("type");

    if (type === "tier") {
      await prisma.wageTier.delete({ where: { id } });
    } else {
      await prisma.careerIncomeYear.delete({ where: { id } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
