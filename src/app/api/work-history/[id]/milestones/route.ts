import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const VALID_TYPES = ["promotion", "project", "certification", "award", "achievement", "other"];

/** GET /api/work-history/:id/milestones — list milestones */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const milestones = await prisma.workHistoryMilestone.findMany({
    where: { workHistoryId: id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(milestones);
}

/** POST /api/work-history/:id/milestones — add a milestone */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const { title, description, type, date } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!date || typeof date !== "string") {
    return NextResponse.json({ error: "date is required (YYYY-MM)" }, { status: 400 });
  }

  const milestone = await prisma.workHistoryMilestone.create({
    data: {
      workHistoryId: id,
      title: title.trim().slice(0, 200),
      description: description ? String(description).trim().slice(0, 2000) : null,
      type: VALID_TYPES.includes(type) ? type : "achievement",
      date: date.slice(0, 7),
    },
  });
  return NextResponse.json(milestone, { status: 201 });
}

/** DELETE /api/work-history/:id/milestones — delete a milestone (milestoneId in body) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { milestoneId } = await request.json();
  if (!milestoneId) return NextResponse.json({ error: "milestoneId required" }, { status: 400 });

  await prisma.workHistoryMilestone.deleteMany({ where: { id: milestoneId, workHistoryId: id } });
  return NextResponse.json({ ok: true });
}
