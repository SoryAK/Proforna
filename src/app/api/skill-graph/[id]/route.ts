import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/** GET — single node with edges + evidence */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const node = await prisma.skillNode.findFirst({
    where: { id, userId },
    include: {
      evidence: true,
      edgesFrom: { include: { to: true } },
      edgesTo: { include: { from: true } },
    },
  });

  if (!node) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(node);
}

/** PATCH — update a skill node */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const existing = await prisma.skillNode.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, type, source, metadata } = body;

  const node = await prisma.skillNode.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type }),
      ...(source !== undefined && { source }),
      ...(metadata !== undefined && { metadata: metadata ? JSON.stringify(metadata) : null }),
    },
  });

  await logActivity("skill_node", node.id, "updated", `Updated skill node: ${node.name}`);
  return NextResponse.json(node);
}

/** DELETE — remove a skill node (cascades edges + evidence) */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const existing = await prisma.skillNode.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.skillNode.delete({ where: { id } });
  await logActivity("skill_node", id, "deleted", `Removed skill node: ${existing.name}`);
  return NextResponse.json({ success: true });
}
