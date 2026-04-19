import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

const PROFICIENCY_SCORE: Record<string, number> = {
  beginner: 25,
  intermediate: 50,
  advanced: 75,
  expert: 100,
};

interface RequiredSkill {
  name: string;
  proficiency: string;
}

// GET: list all snapshots with scores
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snapshots = await prisma.careerSnapshot.findMany({ where: { userId },
    orderBy: { capturedAt: "desc" },
    include: {
      scores: {
        include: { path: { select: { id: true, title: true } } },
      },
    },
    take: 50,
  });
  return NextResponse.json(snapshots);
}

// POST: capture a new snapshot from live data + compute scores
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Gather live data ──
  const [skills, certs, goals, activePos, applications, interviews, incomeYears] =
    await Promise.all([
      prisma.skill.findMany(),
      prisma.certification.findMany(),
      prisma.careerGoal.findMany(),
      prisma.workHistory.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.jobApplication.findMany({
        where: { status: { notIn: ["rejected", "withdrawn", "accepted"] } },
      }),
      prisma.interview.findMany({
        where: { status: "completed" },
      }),
      prisma.careerIncomeYear.findMany({
        orderBy: { year: "desc" },
        take: 1,
      }),
    ]);

  const totalSkills = skills.length;
  const avgProficiency =
    totalSkills > 0
      ? skills.reduce((s, sk) => s + (PROFICIENCY_SCORE[sk.proficiency] || 0), 0) / totalSkills
      : 0;

  const latestIncome = incomeYears[0];
  const activeGoals = goals.filter((g) => g.status === "in_progress").length;
  const completedGoals = goals.filter((g) => g.status === "completed").length;

  // Create snapshot
  const snapshot = await prisma.careerSnapshot.create({
    data: { userId,
      totalSkills,
      avgProficiency,
      incomeGross: latestIncome?.grossIncome ?? (activePos?.salaryAmount ? Number(activePos.salaryAmount) : null),
      incomeNet: latestIncome?.netIncome ?? null,
      activeGoals,
      completedGoals,
      certCount: certs.length,
      applicationsOpen: applications.length,
      interviewsCount: interviews.length,
      currentRole: activePos?.title ?? null,
      currentCompany: activePos?.company ?? null,
    },
  });

  // ── Score each active career path ──
  const paths = await prisma.careerPath.findMany({
    where: { isActive: true },
    include: { milestones: true },
  });

  const skillMap = new Map(skills.map((s) => [s.name.toLowerCase(), s.proficiency]));

  for (const path of paths) {
    // Skill match
    let skillMatch = 0;
    const gaps: { type: string; name: string; detail: string }[] = [];

    const requiredSkills: RequiredSkill[] = path.requiredSkills
      ? JSON.parse(path.requiredSkills)
      : [];

    if (requiredSkills.length > 0) {
      let matchedPoints = 0;
      const maxPoints = requiredSkills.length * 100;

      for (const rs of requiredSkills) {
        const userProf = skillMap.get(rs.name.toLowerCase());
        if (userProf) {
          const userScore = PROFICIENCY_SCORE[userProf] || 0;
          const reqScore = PROFICIENCY_SCORE[rs.proficiency] || 50;
          matchedPoints += Math.min(100, (userScore / reqScore) * 100);
          if (userScore < reqScore) {
            gaps.push({
              type: "skill",
              name: rs.name,
              detail: `Have ${userProf}, need ${rs.proficiency}`,
            });
          }
        } else {
          gaps.push({
            type: "skill",
            name: rs.name,
            detail: `Missing — need ${rs.proficiency}`,
          });
        }
      }
      skillMatch = maxPoints > 0 ? (matchedPoints / maxPoints) * 100 : 0;
    } else {
      // No required skills defined = 50% neutral
      skillMatch = 50;
    }

    // Income alignment
    let incomeAlignment = 50; // neutral default
    const currentIncome = snapshot.incomeGross;
    if (currentIncome && path.targetSalaryMin) {
      const target = path.targetSalaryMax
        ? (path.targetSalaryMin + path.targetSalaryMax) / 2
        : path.targetSalaryMin;
      incomeAlignment = Math.min(100, (currentIncome / target) * 100);
      if (currentIncome < path.targetSalaryMin) {
        gaps.push({
          type: "income",
          name: "Salary",
          detail: `Current $${Math.round(currentIncome).toLocaleString()} vs target $${path.targetSalaryMin.toLocaleString()}+`,
        });
      }
    }

    // Goal alignment — check milestone overlap with user goals
    let goalAlignment = 50;
    if (path.milestones.length > 0) {
      const goalTitles = new Set(goals.map((g) => g.title.toLowerCase()));
      const completedTitles = new Set(
        goals.filter((g) => g.status === "completed").map((g) => g.title.toLowerCase())
      );
      let milestoneScore = 0;
      for (const ms of path.milestones) {
        const key = ms.title.toLowerCase();
        if (completedTitles.has(key)) {
          milestoneScore += 100;
        } else if (goalTitles.has(key)) {
          milestoneScore += 50;
        } else if (ms.isRequired) {
          gaps.push({
            type: "milestone",
            name: ms.title,
            detail: "Required milestone — no matching goal",
          });
        }
      }
      goalAlignment = (milestoneScore / (path.milestones.length * 100)) * 100;
    }

    // Weighted composite
    const overallScore =
      skillMatch * 0.45 + incomeAlignment * 0.30 + goalAlignment * 0.25;

    await prisma.directionScore.create({
      data: {
        snapshotId: snapshot.id,
        pathId: path.id,
        skillMatch: Math.round(skillMatch * 10) / 10,
        incomeAlignment: Math.round(incomeAlignment * 10) / 10,
        goalAlignment: Math.round(goalAlignment * 10) / 10,
        overallScore: Math.round(overallScore * 10) / 10,
        gaps: gaps.length > 0 ? JSON.stringify(gaps) : null,
      },
    });
  }

  // Compute overall snapshot score as average of path scores
  const scores = await prisma.directionScore.findMany({
    where: { snapshotId: snapshot.id },
  });
  const overallScore =
    scores.length > 0
      ? scores.reduce((s, sc) => s + sc.overallScore, 0) / scores.length
      : null;

  const updated = await prisma.careerSnapshot.update({
    where: { id: snapshot.id },
    data: { overallScore },
    include: {
      scores: {
        include: { path: { select: { id: true, title: true } } },
      },
    },
  });

  await logActivity("career-snapshot", snapshot.id, "created", "Captured career snapshot");
  return NextResponse.json(updated, { status: 201 });
}
