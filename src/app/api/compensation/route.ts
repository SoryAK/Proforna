import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");
  if (!positionId) {
    return NextResponse.json({ error: "positionId required" }, { status: 400 });
  }

  const events = await prisma.compensationEvent.findMany({
    where: { positionId },
    orderBy: { effectiveDate: "desc" },
  });
  return NextResponse.json(events);
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const event = await prisma.compensationEvent.create({
    data: {
      positionId: body.positionId,
      type: body.type,
      title: body.title,
      amount: body.amount,
      currency: body.currency || "USD",
      effectiveDate: new Date(body.effectiveDate),
      recurring: body.recurring ?? false,
      notes: body.notes || null,
    },
  });

  await prisma.activityLog.create({
    data: { userId,
      entityType: "compensation",
      entityId: event.id,
      action: "created",
      description: `Added compensation: ${body.title} (${body.currency || "USD"} ${body.amount.toLocaleString()})`,
    },
  });

  return NextResponse.json(event, { status: 201 });
}
