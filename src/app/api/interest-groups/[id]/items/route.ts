import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  // Verify group belongs to user
  const group = await prisma.interestGroup.findFirst({ where: { id: groupId, userId } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const body = await req.json();
  if (!body.jobKey || !body.title || !body.company) {
    return NextResponse.json({ error: "jobKey, title, company are required" }, { status: 400 });
  }

  const item = await prisma.interestGroupItem.upsert({
    where: { groupId_jobKey: { groupId, jobKey: body.jobKey } },
    update: {},
    create: {
      groupId,
      userId,
      jobKey: body.jobKey,
      title: body.title,
      company: body.company,
      location: body.location ?? null,
      url: body.url ?? null,
      salaryMin: body.salaryMin ?? null,
      salaryMax: body.salaryMax ?? null,
      source: body.source ?? "adzuna",
      description: body.description ?? null,
      thumbnail: body.thumbnail ?? null,
      scheduleType: body.scheduleType ?? null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;
  const { itemId } = await req.json();
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  await prisma.interestGroupItem.deleteMany({
    where: { id: itemId, groupId, userId },
  });
  return NextResponse.json({ ok: true });
}
