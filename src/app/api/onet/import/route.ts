import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { getUserId } from "@/lib/auth-utils";
import {
  getOccupationOverview,
  getOccupationSkills,
  getClusterForSoc,
} from "@/lib/onet";

/**
 * POST /api/onet/import
 *
 * Import an O*NET occupation and its associated skills into the user's skill graph.
 * Body: { code: string }  — SOC code like "15-1252.00"
 *
 * Creates:
 * - Occupation record (upserted by userId + socCode)
 * - SkillNode records for each skill (upserted by userId + name)
 * - OccupationSkillRequirement links between them
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { code } = body;

  if (!code || typeof code !== "string" || !/^\d{2}-\d{4}\.\d{2}$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid SOC code format. Expected XX-XXXX.XX" },
      { status: 400 },
    );
  }

  // Fetch from O*NET API
  const [overview, skills] = await Promise.all([
    getOccupationOverview(code),
    getOccupationSkills(code),
  ]);

  const cluster = getClusterForSoc(code);

  // Upsert occupation
  const occupation = await prisma.occupation.upsert({
    where: { userId_socCode: { userId, socCode: code } },
    update: {
      title: overview.title,
      description: overview.description ?? null,
      cluster,
      metadata: JSON.stringify({
        bright_outlook: overview.tags?.bright_outlook ?? false,
        sample_titles: overview.sample_of_reported_titles ?? [],
      }),
    },
    create: {
      userId,
      socCode: code,
      title: overview.title,
      description: overview.description ?? null,
      cluster,
      source: "onet",
      metadata: JSON.stringify({
        bright_outlook: overview.tags?.bright_outlook ?? false,
        sample_titles: overview.sample_of_reported_titles ?? [],
      }),
    },
  });

  // Upsert skill nodes and link to occupation
  let skillsCreated = 0;
  let requirementsLinked = 0;

  for (const skill of skills) {
    // Determine skill type heuristic
    const type = inferSkillType(skill.name);

    const node = await prisma.skillNode.upsert({
      where: { userId_name: { userId, name: skill.name } },
      update: {},
      create: {
        userId,
        name: skill.name,
        type,
        source: "onet",
        metadata: JSON.stringify({
          onetId: skill.id,
          description: skill.description,
        }),
      },
    });

    // Check if freshly created (createdAt within last 2 seconds)
    const isNew = Date.now() - new Date(node.createdAt).getTime() < 2000;
    if (isNew) skillsCreated++;

    // Upsert requirement link
    await prisma.occupationSkillRequirement.upsert({
      where: {
        occupationId_skillNodeId: {
          occupationId: occupation.id,
          skillNodeId: node.id,
        },
      },
      update: {
        importance: skill.importance,
        level: Math.round((skill.importance / 100) * 7 * 10) / 10,
      },
      create: {
        occupationId: occupation.id,
        skillNodeId: node.id,
        importance: skill.importance,
        level: Math.round((skill.importance / 100) * 7 * 10) / 10,
        source: "onet",
      },
    });
    requirementsLinked++;
  }

  await logActivity(
    "skill_graph",
    userId,
    "onet_import",
    `Imported O*NET occupation: ${overview.title} (${code}) with ${requirementsLinked} skills`,
  );

  return NextResponse.json({
    occupation: {
      id: occupation.id,
      socCode: code,
      title: overview.title,
      cluster,
    },
    skillsCreated,
    requirementsLinked,
    totalSkills: skills.length,
  });
}

/** Simple heuristic to categorize O*NET skills */
function inferSkillType(name: string): string {
  const lower = name.toLowerCase();
  const softSkills = [
    "critical thinking", "active listening", "speaking", "writing",
    "social perceptiveness", "coordination", "persuasion", "negotiation",
    "instructing", "service orientation", "complex problem solving",
    "judgment", "decision making", "time management", "management of personnel",
    "active learning", "learning strategies", "monitoring",
  ];
  if (softSkills.some((s) => lower.includes(s))) return "soft";

  const domainSkills = [
    "mathematics", "science", "systems analysis", "systems evaluation",
    "management of financial", "management of material", "quality control",
  ];
  if (domainSkills.some((s) => lower.includes(s))) return "domain";

  const toolSkills = [
    "programming", "technology design", "equipment", "installation",
    "operation and control", "troubleshooting", "repairing", "maintenance",
  ];
  if (toolSkills.some((s) => lower.includes(s))) return "tool";

  return "technical";
}
