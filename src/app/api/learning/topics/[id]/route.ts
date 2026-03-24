import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/** GET — fetch a single topic with its full content and questions for study */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const topic = await prisma.learningTopic.findFirst({
    where: { id, userId },
    include: {
      questions: true,
      sessions: {
        where: { userId },
        orderBy: { completedAt: "desc" },
        select: { score: true, totalQs: true, completedAt: true },
      },
    },
  });

  if (!topic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...topic,
    questions: topic.questions.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      options: JSON.parse(q.optionsJson),
      answer: q.answer,
      explanation: q.explanation,
    })),
  });
}
