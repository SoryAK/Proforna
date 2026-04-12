import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import {
  listAllOccupations,
  getOccupationOverview,
  getOccupationSkills,
  getOccupationKnowledge,
  getOccupationAbilities,
  getClusterForSoc,
} from "@/lib/onet";

/**
 * POST /api/onet/ingest
 *
 * Bulk-ingest all O*NET occupations and their skills/knowledge/abilities
 * into the current user's skill graph.
 *
 * Body (optional): { clusters?: string[] }
 *   If clusters is provided, only ingest occupations whose SOC major group
 *   matches one of the given cluster names (e.g. "Computer and Mathematical").
 *   Otherwise, ingests ALL ~1016 occupations.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let filterClusters: string[] | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.clusters && Array.isArray(body.clusters)) {
      filterClusters = body.clusters;
    }
  } catch {
    // empty body is fine — ingest all
  }

  // 1) Fetch all occupations from O*NET
  const allOccupations = await listAllOccupations();

  let occupationsIngested = 0;
  let skillsIngested = 0;
  let knowledgeIngested = 0;
  let abilitiesIngested = 0;
  let skipped = 0;

  for (const occ of allOccupations) {
    const cluster = getClusterForSoc(occ.code);

    // Optionally filter by cluster
    if (filterClusters && !filterClusters.includes(cluster)) {
      skipped++;
      continue;
    }

    // 2) Fetch detailed info for each occupation
    let overview;
    try {
      overview = await getOccupationOverview(occ.code);
    } catch {
      // Some codes may lack detail pages — skip gracefully
      skipped++;
      continue;
    }

    // 3) Fetch skills, knowledge, abilities in parallel
    const [skills, knowledge, abilities] = await Promise.all([
      getOccupationSkills(occ.code).catch(() => []),
      getOccupationKnowledge(occ.code).catch(() => []),
      getOccupationAbilities(occ.code).catch(() => []),
    ]);

    // 4) Upsert Occupation
    const metadata = JSON.stringify({
      bright_outlook: occ.tags?.bright_outlook ?? false,
      sample_titles: overview.sample_of_reported_titles ?? [],
      zone: occ.zone,
    });

    const occupation = await prisma.occupation.upsert({
      where: { userId_socCode: { userId, socCode: occ.code } },
      update: {
        title: occ.title,
        description: overview.description ?? null,
        cluster,
        metadata,
      },
      create: {
        userId,
        socCode: occ.code,
        title: occ.title,
        description: overview.description ?? null,
        cluster,
        source: "onet",
        metadata,
      },
    });
    occupationsIngested++;

    // 5) Upsert SkillNodes + OccupationSkillRequirements
    const upsertRequirement = async (
      elements: { name: string; importance: number }[],
      nodeType: string,
    ) => {
      let count = 0;
      for (const el of elements) {
        const node = await prisma.skillNode.upsert({
          where: { userId_name: { userId, name: el.name } },
          update: {},
          create: {
            userId,
            name: el.name,
            type: nodeType,
            source: "onet",
          },
        });

        await prisma.occupationSkillRequirement.upsert({
          where: {
            occupationId_skillNodeId: {
              occupationId: occupation.id,
              skillNodeId: node.id,
            },
          },
          update: {
            importance: Math.min(100, Math.max(0, el.importance)),
            source: "onet",
          },
          create: {
            occupationId: occupation.id,
            skillNodeId: node.id,
            importance: Math.min(100, Math.max(0, el.importance)),
            source: "onet",
          },
        });
        count++;
      }
      return count;
    };

    skillsIngested += await upsertRequirement(skills, "soft");
    knowledgeIngested += await upsertRequirement(knowledge, "domain");
    abilitiesIngested += await upsertRequirement(abilities, "soft");
  }

  await logActivity(
    "onet",
    userId,
    "bulk_ingest",
    `Ingested ${occupationsIngested} occupations, ${skillsIngested} skills, ${knowledgeIngested} knowledge, ${abilitiesIngested} abilities (${skipped} skipped)`,
  );

  return NextResponse.json({
    ok: true,
    occupationsIngested,
    skillsIngested,
    knowledgeIngested,
    abilitiesIngested,
    skipped,
    total: allOccupations.length,
  });
}
