import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/** GET /api/work-history/:id/rating — get workplace rating */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rating = await prisma.workplaceRating.findUnique({ where: { workHistoryId: id } });
  return NextResponse.json(rating);
}

/** PUT /api/work-history/:id/rating — create or update workplace rating */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const clamp = (v: unknown) => Math.max(0, Math.min(5, Number(v) || 0));

  const data = {
    culture: clamp(body.culture),
    growth: clamp(body.growth),
    compensation: clamp(body.compensation),
    workLifeBalance: clamp(body.workLifeBalance),
    management: clamp(body.management),
    overall: clamp(body.overall),
    notes: body.notes ? String(body.notes).trim().slice(0, 2000) : null,
  };

  const rating = await prisma.workplaceRating.upsert({
    where: { workHistoryId: id },
    create: { workHistoryId: id, ...data },
    update: data,
  });
  return NextResponse.json(rating);
}
