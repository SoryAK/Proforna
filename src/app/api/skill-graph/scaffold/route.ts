import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import scaffoldData from "@/data/onet-skill-scaffold.json";

type ScaffoldNode = { name: string; type: string };
type ScaffoldEdge = { from: string; to: string; type: string; weight: number };
type ScaffoldOccSkill = { name: string; importance: number; level: number };
type ScaffoldOccupation = {
  socCode: string;
  title: string;
  description?: string;
  skills: ScaffoldOccSkill[];
};
type ScaffoldCluster = {
  socPrefix: string;
  nodes: ScaffoldNode[];
  edges: ScaffoldEdge[];
  occupations?: ScaffoldOccupation[];
};

const clusters = scaffoldData.clusters as Record<string, ScaffoldCluster>;

/**
 * GET /api/skill-graph/scaffold
 *
 * Returns available scaffold clusters and their seeding status for the current user.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's existing scaffold records
  const existing = await prisma.scaffoldMeta.findMany({
    where: { userId },
  });

  const seededMap = new Map(existing.map((s) => [s.cluster, s]));

  const available = Object.entries(clusters).map(([name, cluster]) => {
    const meta = seededMap.get(name);
    return {
      name,
      socPrefix: cluster.socPrefix,
      nodeCount: cluster.nodes.length,
      edgeCount: cluster.edges.length,
      occupationCount: cluster.occupations?.length ?? 0,
      seeded: !!meta,
      seededAt: meta?.seededAt ?? null,
      version: meta?.version ?? null,
      currentVersion: scaffoldData.version,
      needsRefresh: meta ? meta.version !== scaffoldData.version : false,
    };
  });

  return NextResponse.json({ clusters: available, version: scaffoldData.version });
}

/**
 * POST /api/skill-graph/scaffold
 *
 * Seeds (or refreshes) skill nodes + edges for a specific industry cluster.
 * Body: { cluster: "Computer and Mathematical" }
 *
 * Upserts all nodes/edges — safe to call multiple times (idempotent).
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { cluster: clusterName } = body;

  if (!clusterName || typeof clusterName !== "string") {
    return NextResponse.json({ error: "cluster name is required" }, { status: 400 });
  }

  const cluster = clusters[clusterName];
  if (!cluster) {
    return NextResponse.json(
      { error: `Unknown cluster: ${clusterName}`, available: Object.keys(clusters) },
      { status: 400 }
    );
  }

  // Upsert all nodes for this cluster
  const nodeMap = new Map<string, string>(); // name → id
  let nodesCreated = 0;

  for (const n of cluster.nodes) {
    const node = await prisma.skillNode.upsert({
      where: { userId_name: { userId, name: n.name } },
      update: {
        // Only update type if this is an onet-sourced node (don't overwrite user customizations)
        type: undefined,
      },
      create: {
        userId,
        name: n.name,
        type: n.type,
        source: "onet",
        metadata: JSON.stringify({
          scaffoldCluster: clusterName,
          socPrefix: cluster.socPrefix,
        }),
      },
    });
    nodeMap.set(n.name, node.id);

    // Count newly created (source=onet means we created it, not found existing)
    if (node.source === "onet") nodesCreated++;
  }

  // Upsert all edges for this cluster
  let edgesCreated = 0;

  for (const e of cluster.edges) {
    const fromId = nodeMap.get(e.from);
    const toId = nodeMap.get(e.to);
    if (!fromId || !toId || fromId === toId) continue;

    const edgeType = ["prerequisite", "peer", "bridge", "child", "enables"].includes(e.type)
      ? e.type
      : "peer";

    await prisma.skillEdge.upsert({
      where: { fromId_toId_type: { fromId, toId, type: edgeType } },
      update: {
        weight: Math.min(10, Math.max(0, e.weight ?? 1)),
        source: "onet",
      },
      create: {
        fromId,
        toId,
        type: edgeType,
        weight: Math.min(10, Math.max(0, e.weight ?? 1)),
        source: "onet",
        metadata: JSON.stringify({ scaffoldCluster: clusterName }),
      },
    });
    edgesCreated++;
  }

  // Upsert occupations and their skill requirements
  let occupationsSeeded = 0;
  let requirementsSeeded = 0;

  if (cluster.occupations) {
    for (const occ of cluster.occupations) {
      const occupation = await prisma.occupation.upsert({
        where: { userId_socCode: { userId, socCode: occ.socCode } },
        update: {
          title: occ.title,
          description: occ.description ?? null,
          cluster: clusterName,
        },
        create: {
          userId,
          socCode: occ.socCode,
          title: occ.title,
          description: occ.description ?? null,
          cluster: clusterName,
          source: "onet",
        },
      });
      occupationsSeeded++;

      // Link occupation → skill requirements
      for (const skill of occ.skills) {
        const skillNodeId = nodeMap.get(skill.name);
        if (!skillNodeId) continue;

        await prisma.occupationSkillRequirement.upsert({
          where: {
            occupationId_skillNodeId: {
              occupationId: occupation.id,
              skillNodeId,
            },
          },
          update: {
            importance: Math.min(100, Math.max(0, skill.importance ?? 50)),
            level: Math.min(7, Math.max(0, skill.level ?? 3.5)),
            source: "onet",
          },
          create: {
            occupationId: occupation.id,
            skillNodeId,
            importance: Math.min(100, Math.max(0, skill.importance ?? 50)),
            level: Math.min(7, Math.max(0, skill.level ?? 3.5)),
            source: "onet",
          },
        });
        requirementsSeeded++;
      }
    }
  }

  // Upsert scaffold metadata
  await prisma.scaffoldMeta.upsert({
    where: { userId_cluster: { userId, cluster: clusterName } },
    update: {
      version: scaffoldData.version,
      nodesSeeded: cluster.nodes.length,
      edgesSeeded: edgesCreated,
      refreshedAt: new Date(),
    },
    create: {
      userId,
      cluster: clusterName,
      version: scaffoldData.version,
      nodesSeeded: cluster.nodes.length,
      edgesSeeded: edgesCreated,
    },
  });

  await logActivity(
    "skill_graph",
    userId,
    "scaffold_seeded",
    `Seeded ${cluster.nodes.length} nodes + ${edgesCreated} edges + ${occupationsSeeded} occupations from "${clusterName}" scaffold (v${scaffoldData.version})`
  );

  return NextResponse.json({
    cluster: clusterName,
    nodesSeeded: cluster.nodes.length,
    edgesSeeded: edgesCreated,
    occupationsSeeded,
    requirementsSeeded,
    version: scaffoldData.version,
  });
}

/**
 * DELETE /api/skill-graph/scaffold
 *
 * Removes all scaffold-sourced nodes for a specific cluster.
 * Query: ?cluster=Computer+and+Mathematical
 *
 * Only removes nodes with source="onet" and matching cluster metadata.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const clusterName = url.searchParams.get("cluster");

  if (!clusterName) {
    return NextResponse.json({ error: "cluster query param is required" }, { status: 400 });
  }

  // Delete scaffold nodes for this cluster (edges cascade automatically)
  // Find nodes whose parsed metadata.scaffoldCluster matches exactly
  const candidateNodes = await prisma.skillNode.findMany({
    where: { userId, source: "onet" },
    select: { id: true, metadata: true },
  });

  const idsToDelete = candidateNodes
    .filter((n) => {
      if (!n.metadata) return false;
      try {
        const meta = JSON.parse(n.metadata);
        return meta.scaffoldCluster === clusterName;
      } catch {
        return false;
      }
    })
    .map((n) => n.id);

  const deleted = await prisma.skillNode.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  // Remove occupations for this cluster (requirements cascade)
  const deletedOccupations = await prisma.occupation.deleteMany({
    where: { userId, cluster: clusterName, source: "onet" },
  });

  // Remove the scaffold meta record
  await prisma.scaffoldMeta.deleteMany({
    where: { userId, cluster: clusterName },
  });

  await logActivity(
    "skill_graph",
    userId,
    "scaffold_removed",
    `Removed ${deleted.count} scaffold nodes + ${deletedOccupations.count} occupations from "${clusterName}"`
  );

  return NextResponse.json({ removed: deleted.count, occupationsRemoved: deletedOccupations.count, cluster: clusterName });
}
