import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/** POST — create an edge between two skill nodes */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { fromId, toId, type, weight, source, metadata } = body;

  if (!fromId || !toId) {
    return NextResponse.json({ error: "fromId and toId are required" }, { status: 400 });
  }

  // Verify both nodes belong to user
  const [from, to] = await Promise.all([
    prisma.skillNode.findFirst({ where: { id: fromId, userId } }),
    prisma.skillNode.findFirst({ where: { id: toId, userId } }),
  ]);

  if (!from || !to) {
    return NextResponse.json({ error: "One or both skill nodes not found" }, { status: 404 });
  }

  const edge = await prisma.skillEdge.create({
    data: {
      fromId,
      toId,
      type: type ?? "peer",
      weight: weight ?? 1.0,
      source: source ?? "user",
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  await logActivity("skill_edge", edge.id, "created", `Connected: ${from.name} → ${to.name} (${edge.type})`);
  return NextResponse.json(edge, { status: 201 });
}

/** DELETE — remove an edge by id (passed as query param) */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const edgeId = req.nextUrl.searchParams.get("id");
  if (!edgeId) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  // Verify edge belongs to user's node
  const edge = await prisma.skillEdge.findFirst({
    where: { id: edgeId, from: { userId } },
    include: { from: true, to: true },
  });

  if (!edge) return NextResponse.json({ error: "Edge not found" }, { status: 404 });

  await prisma.skillEdge.delete({ where: { id: edgeId } });
  await logActivity("skill_edge", edgeId, "deleted", `Disconnected: ${edge.from.name} → ${edge.to.name}`);
  return NextResponse.json({ success: true });
}
