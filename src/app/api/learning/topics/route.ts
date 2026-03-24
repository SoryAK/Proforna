import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const topics = await prisma.learningTopic.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { order: "asc" }],
    include: {
      questions: { select: { id: true } },
      sessions: {
        where: { userId },
        orderBy: { completedAt: "desc" },
        take: 1,
        select: { score: true, totalQs: true, completedAt: true },
      },
    },
  });

  const result = topics.map((t) => ({
    id: t.id,
    documentId: t.documentId,
    title: t.title,
    summary: t.summary,
    order: t.order,
    questionCount: t.questions.length,
    lastSession: t.sessions[0] ?? null,
    createdAt: t.createdAt,
  }));

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const topicId = searchParams.get("id");

  if (!topicId) {
    return NextResponse.json({ error: "Topic ID required" }, { status: 400 });
  }

  // Verify ownership
  const topic = await prisma.learningTopic.findFirst({
    where: { id: topicId, userId },
  });
  if (!topic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.learningTopic.delete({ where: { id: topicId } });
  return NextResponse.json({ success: true });
}
