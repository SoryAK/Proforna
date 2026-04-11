import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/skill-graph/occupations
 *
 * Returns all occupations for the user with their skill requirements and interest status.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const occupations = await prisma.occupation.findMany({
    where: { userId },
    include: {
      requirements: {
        include: {
          skillNode: { select: { id: true, name: true, type: true } },
        },
        orderBy: { importance: "desc" },
      },
      interests: {
        where: { userId },
        take: 1,
      },
    },
    orderBy: { title: "asc" },
  });

  const result = occupations.map((occ) => ({
    id: occ.id,
    socCode: occ.socCode,
    title: occ.title,
    description: occ.description,
    cluster: occ.cluster,
    source: occ.source,
    metadata: occ.metadata,
    interest: occ.interests[0] ?? null,
    requirements: occ.requirements.map((r) => ({
      id: r.id,
      skillNodeId: r.skillNodeId,
      skillName: r.skillNode.name,
      skillType: r.skillNode.type,
      importance: r.importance,
      level: r.level,
      source: r.source,
    })),
  }));

  return NextResponse.json(result);
}

/**
 * POST /api/skill-graph/occupations
 *
 * Create a custom occupation (user-defined, not from scaffold).
 * Body: { socCode, title, description?, cluster? }
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { socCode, title, description, cluster } = body;

  if (!socCode || !title) {
    return NextResponse.json({ error: "socCode and title are required" }, { status: 400 });
  }

  if (typeof socCode !== "string" || socCode.length > 20) {
    return NextResponse.json({ error: "Invalid SOC code" }, { status: 400 });
  }

  if (typeof title !== "string" || title.length > 200) {
    return NextResponse.json({ error: "Title must be under 200 characters" }, { status: 400 });
  }

  const occupation = await prisma.occupation.upsert({
    where: { userId_socCode: { userId, socCode } },
    update: { title, description: description ?? null, cluster: cluster ?? "Custom" },
    create: {
      userId,
      socCode,
      title,
      description: description ?? null,
      cluster: cluster ?? "Custom",
      source: "user",
    },
  });

  await logActivity("skill_graph", userId, "occupation_added", `Added occupation: ${title} (${socCode})`);

  return NextResponse.json(occupation);
}
