import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/skill-graph/occupations/fit
 *
 * Returns a career fit analysis for all user occupations.
 * For each occupation, calculates a weighted fit score based on
 * required skills vs. user's evidence strength.
 *
 * fitScore = Σ(evidence_strength × importance) / Σ(100 × importance)
 *
 * Also returns skill gaps (required skills with weak or no evidence).
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch occupations with requirements, and all user evidence in parallel
  const [occupations, evidence] = await Promise.all([
    prisma.occupation.findMany({
      where: { userId },
      include: {
        requirements: {
          include: {
            skillNode: { select: { id: true, name: true, type: true } },
          },
        },
        interests: { where: { userId }, take: 1 },
      },
      orderBy: { title: "asc" },
    }),
    prisma.skillEvidence.findMany({
      where: { userId },
      select: { skillNodeId: true, strength: true },
    }),
  ]);

  if (occupations.length === 0) {
    return NextResponse.json({ fits: [], message: "No occupations in your graph. Seed a scaffold first." });
  }

  // Build a map: skillNodeId → best evidence strength (take max if multiple evidence items)
  const evidenceMap = new Map<string, number>();
  for (const ev of evidence) {
    const existing = evidenceMap.get(ev.skillNodeId) ?? 0;
    if (ev.strength > existing) {
      evidenceMap.set(ev.skillNodeId, ev.strength);
    }
  }

  const fits = occupations.map((occ) => {
    const interest = occ.interests[0] ?? null;

    if (occ.requirements.length === 0) {
      return {
        id: occ.id,
        socCode: occ.socCode,
        title: occ.title,
        cluster: occ.cluster,
        status: interest?.status ?? null,
        fitScore: 0,
        totalRequirements: 0,
        coveredSkills: 0,
        gaps: [],
        strengths: [],
      };
    }

    let weightedSum = 0;
    let maxPossible = 0;
    const gaps: Array<{
      skillName: string;
      skillType: string;
      skillNodeId: string;
      importance: number;
      level: number;
      currentStrength: number;
      gap: number;
    }> = [];
    const strengths: Array<{
      skillName: string;
      skillType: string;
      importance: number;
      strength: number;
    }> = [];

    let coveredSkills = 0;

    for (const req of occ.requirements) {
      const importance = req.importance;
      const evidenceStrength = evidenceMap.get(req.skillNodeId) ?? 0;

      weightedSum += evidenceStrength * importance;
      maxPossible += 100 * importance;

      if (evidenceStrength >= 50) {
        coveredSkills++;
        strengths.push({
          skillName: req.skillNode.name,
          skillType: req.skillNode.type,
          importance: req.importance,
          strength: evidenceStrength,
        });
      } else {
        gaps.push({
          skillName: req.skillNode.name,
          skillType: req.skillNode.type,
          skillNodeId: req.skillNodeId,
          importance: req.importance,
          level: req.level,
          currentStrength: evidenceStrength,
          gap: 100 - evidenceStrength,
        });
      }
    }

    const fitScore = maxPossible > 0 ? Math.round((weightedSum / maxPossible) * 100) : 0;

    // Sort: gaps by importance desc, strengths by strength desc
    gaps.sort((a, b) => b.importance - a.importance);
    strengths.sort((a, b) => b.strength - a.strength);

    return {
      id: occ.id,
      socCode: occ.socCode,
      title: occ.title,
      cluster: occ.cluster,
      status: interest?.status ?? null,
      fitScore,
      totalRequirements: occ.requirements.length,
      coveredSkills,
      gaps,
      strengths,
    };
  });

  // Sort by fit score descending
  fits.sort((a, b) => b.fitScore - a.fitScore);

  // Update fit scores in the database for tracked occupations
  for (const fit of fits) {
    if (fit.fitScore > 0) {
      await prisma.userOccupationInterest.updateMany({
        where: { userId, occupationId: fit.id },
        data: { fitScore: fit.fitScore },
      });
    }
  }

  return NextResponse.json({ fits });
}
