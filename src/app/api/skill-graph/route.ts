import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/** GET — full skill graph (nodes + edges + evidence) for current user */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [nodes, edges, evidence, occupations] = await Promise.all([
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
  ]);

  return NextResponse.json({ nodes, edges, evidence, occupations });
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
