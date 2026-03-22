import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// PUT — update a work log entry
export async function PUT(
  request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();

    const log = await prisma.workLog.update({
      where: { id },
      data: {
        date: body.date ? new Date(body.date) : undefined,
        title: body.title,
        content: body.content ?? null,
        category: body.category || "task",
        hours: body.hours ? parseFloat(body.hours) : null,
        tags: body.tags ?? null,
        accomplishment: body.accomplishment ?? false,
        impact: body.impact ?? null,
      },
    });

    return NextResponse.json(log);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove a work log entry
export async function DELETE(
  _request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    await prisma.workLog.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
