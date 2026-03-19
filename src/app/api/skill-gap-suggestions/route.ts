import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * GET /api/skill-gap-suggestions
 * Cross-references CDM skill gaps with existing learning items to
 * suggest what to learn next for each career path.
 */
export async function GET() {
  // Latest snapshot with scores + gaps
  const latestSnapshot = await prisma.careerSnapshot.findFirst({
    orderBy: { capturedAt: "desc" },
    include: {
      scores: {
        include: { path: { select: { id: true, title: true, requiredSkills: true } } },
      },
    },
  });

  if (!latestSnapshot) {
    return NextResponse.json([]);
  }

  // All learning items
  const learningItems = await prisma.learningItem.findMany();

  // Index learning items by skill (lowercase)
  const learningBySkill = new Map<string, typeof learningItems>();
  for (const item of learningItems) {
    const skills: string[] = item.skills ? JSON.parse(item.skills) : [];
    for (const sk of skills) {
      const key = sk.toLowerCase();
      if (!learningBySkill.has(key)) learningBySkill.set(key, []);
      learningBySkill.get(key)!.push(item);
    }
  }

  // Build suggestions per path
  const suggestions = latestSnapshot.scores
    .filter((score) => score.gaps)
    .map((score) => {
      const gaps: { type: string; name: string; detail: string }[] = JSON.parse(
        score.gaps!
      );
      const skillGaps = gaps.filter((g) => g.type === "skill");

      return {
        pathId: score.path.id,
        pathTitle: score.path.title,
        skillMatch: score.skillMatch,
        items: skillGaps.map((gap) => {
          const existing = learningBySkill.get(gap.name.toLowerCase()) ?? [];
          const inProgress = existing.filter((l) => l.status === "in_progress");
          const completed = existing.filter((l) => l.status === "completed");
          return {
            skill: gap.name,
            detail: gap.detail,
            hasLearning: existing.length > 0,
            inProgressCount: inProgress.length,
            completedCount: completed.length,
            existingItems: existing.map((l) => ({
              id: l.id,
              title: l.title,
              status: l.status,
              progress: l.progress,
              provider: l.provider,
            })),
          };
        }),
      };
    })
    .filter((s) => s.items.length > 0);

  return NextResponse.json(suggestions);
}
