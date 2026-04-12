import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import {
  getOccupationOverview,
  getOccupationSkills,
  getOccupationKnowledge,
  getOccupationAbilities,
  getOccupationWorkActivities,
  getOccupationTechnology,
  getClusterForSoc,
} from "@/lib/onet";

/**
 * GET /api/onet/occupation/[code]
 *
 * Fetch full O*NET details for a single occupation code.
 * Returns overview, skills, knowledge, abilities, work activities, and technology.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await params;

  if (!code || !/^\d{2}-\d{4}\.\d{2}$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid SOC code format. Expected XX-XXXX.XX" },
      { status: 400 },
    );
  }

  const [overview, skills, knowledge, abilities, workActivities, technology] =
    await Promise.all([
      getOccupationOverview(code),
      getOccupationSkills(code),
      getOccupationKnowledge(code),
      getOccupationAbilities(code),
      getOccupationWorkActivities(code),
      getOccupationTechnology(code),
    ]);

  return NextResponse.json({
    code: overview.code,
    title: overview.title,
    description: overview.description ?? null,
    cluster: getClusterForSoc(code),
    brightOutlook: overview.tags?.bright_outlook ?? false,
    sampleTitles: overview.sample_of_reported_titles ?? [],
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      importance: s.importance,
    })),
    knowledge: knowledge.map((k) => ({
      id: k.id,
      name: k.name,
      description: k.description,
      importance: k.importance,
    })),
    abilities: abilities.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      importance: a.importance,
    })),
    workActivities: workActivities.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      importance: w.importance,
    })),
    technology: technology.map((t) => ({
      name: t.name,
      hotTechnology: t.hot_technology ?? false,
    })),
  });
}
