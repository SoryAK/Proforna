import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");
  if (!positionId) {
    return NextResponse.json({ error: "positionId required" }, { status: 400 });
  }

  const benefits = await prisma.benefit.findMany({
    where: { positionId },
    orderBy: { category: "asc" },
  });
  return NextResponse.json(benefits);
}

export async function POST(request: Request) {
  const body = await request.json();
  const benefit = await prisma.benefit.create({
    data: {
      positionId: body.positionId,
      category: body.category,
      name: body.name,
      provider: body.provider || null,
      coverage: body.coverage || null,
      employerCost: body.employerCost ?? null,
      employeeCost: body.employeeCost ?? null,
      notes: body.notes || null,
      enrolledAt: body.enrolledAt ? new Date(body.enrolledAt) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });

  await prisma.activityLog.create({
    data: {
      entityType: "benefit",
      entityId: benefit.id,
      action: "created",
      description: `Added benefit: ${body.name} (${body.category})`,
    },
  });

  return NextResponse.json(benefit, { status: 201 });
}
