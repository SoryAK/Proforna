import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/** GET — full skill graph (nodes + edges + evidence) for current user */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [nodes, edges, evidence, occupations, workHistories] = await Promise.all([
    prisma.skillNode.findMany({
      where: { userId },
      include: { evidence: true },
      orderBy: { name: "asc" },
    }),
    // Get all edges where at least one side belongs to this user
    prisma.skillEdge.findMany({
      where: { from: { userId } },
      orderBy: { weight: "desc" },
    }),
    prisma.skillEvidence.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.occupation.findMany({
      where: { userId },
      include: {
        requirements: {
          select: { skillNodeId: true, importance: true, level: true },
        },
        interests: { where: { userId }, take: 1 },
      },
      orderBy: { title: "asc" },
    }),
    prisma.workHistory.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        company: true,
        type: true,
        startDate: true,
        endDate: true,
        degree: true,
        major: true,
      },
      orderBy: { startDate: "desc" },
    }),
  ]);

  return NextResponse.json({ nodes, edges, evidence, occupations, workHistories });
}

/** POST — create a new skill node */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, type, source, metadata } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const node = await prisma.skillNode.create({
    data: {
      userId,
      name: name.trim(),
      type: type ?? "technical",
      source: source ?? "user",
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  await logActivity("skill_node", node.id, "created", `Added skill node: ${node.name}`);
  return NextResponse.json(node, { status: 201 });
}

/** DELETE — clear entire skill graph (nodes, edges, evidence, occupations, EDM) for current user */
export async function DELETE() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // DiffusionExposure must go first (references SkillNode)
  // Edges, evidence, occupation requirements cascade from their parents,
  // but deleting explicitly avoids ordering issues with cross-references.
  const [exposures, edges, evidence, requirements, interests, occupations, nodes] =
    await prisma.$transaction([
      prisma.diffusionExposure.deleteMany({ where: { userId } }),
      prisma.skillEdge.deleteMany({ where: { from: { userId } } }),
      prisma.skillEvidence.deleteMany({ where: { userId } }),
      prisma.occupationSkillRequirement.deleteMany({ where: { occupation: { userId } } }),
      prisma.userOccupationInterest.deleteMany({ where: { userId } }),
      prisma.occupation.deleteMany({ where: { userId } }),
      prisma.skillNode.deleteMany({ where: { userId } }),
    ]);

  await logActivity("skill_graph", userId, "cleared", "Cleared entire skill graph");

  return NextResponse.json({
    cleared: {
      nodes: nodes.count,
      edges: edges.count,
      evidence: evidence.count,
      occupations: occupations.count,
      requirements: requirements.count,
      interests: interests.count,
      exposures: exposures.count,
    },
  });
}
