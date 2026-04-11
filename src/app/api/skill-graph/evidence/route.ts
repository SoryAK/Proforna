import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/** POST — attach evidence to a skill node */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { skillNodeId, artifactType, artifactId, strength, notes } = body;

  if (!skillNodeId || !artifactType) {
    return NextResponse.json({ error: "skillNodeId and artifactType are required" }, { status: 400 });
  }

  // Verify node belongs to user
  const node = await prisma.skillNode.findFirst({ where: { id: skillNodeId, userId } });
  if (!node) return NextResponse.json({ error: "Skill node not found" }, { status: 404 });

  // Clamp strength to 0-100
  const clampedStrength = Math.min(100, Math.max(0, Number(strength) || 50));

  const evidence = await prisma.skillEvidence.create({
    data: {
      userId,
      skillNodeId,
      artifactType,
      ...(artifactId ? { artifactId } : {}), // omit to let @default(cuid()) generate unique ID
      strength: clampedStrength,
      notes: notes ?? null,
    },
  });

  await logActivity("skill_evidence", evidence.id, "created", `Added ${artifactType} evidence to: ${node.name}`);
  return NextResponse.json(evidence, { status: 201 });
}

/** DELETE — remove evidence by id (query param) */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const evidenceId = req.nextUrl.searchParams.get("id");
  if (!evidenceId) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  const evidence = await prisma.skillEvidence.findFirst({
    where: { id: evidenceId, userId },
    include: { skillNode: true },
  });

  if (!evidence) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });

  await prisma.skillEvidence.delete({ where: { id: evidenceId } });
  await logActivity("skill_evidence", evidenceId, "deleted", `Removed evidence from: ${evidence.skillNode.name}`);
  return NextResponse.json({ success: true });
}
