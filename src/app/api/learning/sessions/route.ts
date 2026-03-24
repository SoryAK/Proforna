import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/** POST — record a completed quiz session */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { topicId, score, totalQs } = body as {
    topicId?: string;
    score?: number;
    totalQs?: number;
  };

  if (!topicId || score == null || totalQs == null) {
    return NextResponse.json(
      { error: "topicId, score, and totalQs are required" },
      { status: 400 },
    );
  }

  // Verify topic ownership
  const topic = await prisma.learningTopic.findFirst({
    where: { id: topicId, userId },
    select: { id: true },
  });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const session = await prisma.studySession.create({
    data: { userId, topicId, score, totalQs },
  });

  return NextResponse.json(session, { status: 201 });
}

/** GET — learning stats for the user */
export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [topicCount, sessions, recentSessions] = await Promise.all([
    prisma.learningTopic.count({ where: { userId } }),
    prisma.studySession.findMany({
      where: { userId },
      select: { score: true, totalQs: true, completedAt: true },
      orderBy: { completedAt: "desc" },
    }),
    prisma.studySession.findMany({
      where: { userId },
      select: { completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 100,
    }),
  ]);

  const totalSessions = sessions.length;
  const totalCorrect = sessions.reduce((s, r) => s + r.score, 0);
  const totalQuestions = sessions.reduce((s, r) => s + r.totalQs, 0);
  const avgScore =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  // Calculate streak (consecutive days with at least one session)
  let streak = 0;
  if (recentSessions.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const uniqueDays = new Set(
      recentSessions.map((s) => {
        const d = new Date(s.completedAt);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }),
    );
    const sortedDays = [...uniqueDays].sort((a, b) => b - a);

    // Check if today or yesterday started the streak
    const diff = (today.getTime() - sortedDays[0]) / 86400000;
    if (diff <= 1) {
      streak = 1;
      for (let i = 1; i < sortedDays.length; i++) {
        const gap = (sortedDays[i - 1] - sortedDays[i]) / 86400000;
        if (gap === 1) streak++;
        else break;
      }
    }
  }

  return NextResponse.json({
    topicCount,
    totalSessions,
    avgScore,
    streak,
  });
}
