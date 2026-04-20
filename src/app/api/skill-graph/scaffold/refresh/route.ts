import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { callGemini, geminiErrorMessage } from "@/lib/gemini";

/**
 * POST /api/skill-graph/scaffold/refresh
 *
 * Uses Gemini to generate a fresh skill cluster for a given industry/occupation,
 * then upserts nodes + edges into the user's graph (source="onet").
 *
 * Body: { occupation: "Software Developer", cluster: "Computer and Mathematical" }
 *
 * This enables "living scaffolds" that evolve with market trends.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { occupation, cluster: clusterName } = body;

  if (!occupation || typeof occupation !== "string") {
    return NextResponse.json({ error: "occupation is required" }, { status: 400 });
  }
  if (!clusterName || typeof clusterName !== "string") {
    return NextResponse.json({ error: "cluster name is required" }, { status: 400 });
  }

  // Get existing nodes so AI can augment rather than replace
  const existingNodes = await prisma.skillNode.findMany({
    where: { userId },
    select: { name: true, type: true, source: true },
  });

  const existingNames = existingNodes.map((n) => n.name);

  const prompt = `You are a labor market intelligence engine. Generate a comprehensive skill graph for the occupation "${occupation}" in the "${clusterName}" industry sector.

EXISTING SKILLS in the user's graph (do NOT duplicate, but you MAY create edges TO these):
${existingNames.length > 0 ? existingNames.join(", ") : "(none)"}

Generate:
1. 15-25 technical/domain/tool skills that are currently in-demand for this occupation
2. Connections between the skills (and to existing skills when relevant)

For each connection, classify as one of:
- "prerequisite": Skill A must be learned before Skill B
- "peer": Skills are commonly used together at the same level
- "bridge": Skill connects two otherwise separate domains
- "child": Skill is a sub-skill or specialization of another
- "enables": Having Skill A makes learning Skill B significantly easier

RULES:
- Only TECHNICAL, DOMAIN, and TOOL skills. No soft skills.
- Use standardized industry names (e.g., "Kubernetes" not "K8s", "PostgreSQL" not "Postgres")
- Weight connections 1-10 based on how strongly they co-occur in current job postings
- Include both foundational and emerging/trending skills for 2024-2025
- Reflect CURRENT market reality, not outdated trends

Respond ONLY with valid JSON:
{
  "nodes": [
    { "name": "Skill Name", "type": "technical" | "domain" | "tool" }
  ],
  "edges": [
    { "from": "Skill A", "to": "Skill B", "type": "peer", "weight": 7 }
  ]
}`;

  const { res: geminiRes, model } = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  if (!geminiRes.ok) {
    const { message } = await geminiErrorMessage(geminiRes);
    console.error(`[scaffold/refresh] ${model} error:`, message);
    return NextResponse.json({ error: message }, { status: geminiRes.status });
  }

  const geminiData = await geminiRes.json();
  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let generated: {
    nodes: { name: string; type: string }[];
    edges: { from: string; to: string; type: string; weight: number }[];
  };

  try {
    generated = JSON.parse(rawText);
  } catch {
    console.error("[scaffold/refresh] Failed to parse Gemini JSON:", rawText.slice(0, 500));
    return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 502 });
  }

  if (!generated.nodes || !Array.isArray(generated.nodes)) {
    return NextResponse.json({ error: "AI returned no nodes" }, { status: 502 });
  }

  // Upsert nodes
  const nodeMap = new Map<string, string>();
  let nodesCreated = 0;

  for (const n of generated.nodes) {
    const name = n.name?.trim();
    if (!name) continue;

    const node = await prisma.skillNode.upsert({
      where: { userId_name: { userId, name } },
      update: {}, // don't overwrite existing node data
      create: {
        userId,
        name,
        type: n.type ?? "technical",
        source: "onet",
        metadata: JSON.stringify({
          scaffoldCluster: clusterName,
          aiRefreshed: true,
          refreshedAt: new Date().toISOString(),
        }),
      },
    });

    nodeMap.set(name, node.id);
    nodesCreated++;
  }

  // Also map existing nodes so edges can reference them
  for (const existing of existingNodes) {
    if (!nodeMap.has(existing.name)) {
      const found = await prisma.skillNode.findUnique({
        where: { userId_name: { userId, name: existing.name } },
        select: { id: true },
      });
      if (found) nodeMap.set(existing.name, found.id);
    }
  }

  // Upsert edges
  let edgesCreated = 0;

  for (const e of generated.edges ?? []) {
    const fromId = nodeMap.get(e.from?.trim());
    const toId = nodeMap.get(e.to?.trim());
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
        metadata: JSON.stringify({ scaffoldCluster: clusterName, aiGenerated: true }),
      },
    });
    edgesCreated++;
  }

  // Update scaffold meta
  await prisma.scaffoldMeta.upsert({
    where: { userId_cluster: { userId, cluster: clusterName } },
    update: {
      version: `ai-${new Date().toISOString().slice(0, 10)}`,
      nodesSeeded: nodesCreated,
      edgesSeeded: edgesCreated,
      refreshedAt: new Date(),
    },
    create: {
      userId,
      cluster: clusterName,
      version: `ai-${new Date().toISOString().slice(0, 10)}`,
      nodesSeeded: nodesCreated,
      edgesSeeded: edgesCreated,
    },
  });

  await logActivity(
    "skill_graph",
    userId,
    "scaffold_refreshed",
    `AI-refreshed "${clusterName}" scaffold for "${occupation}": ${nodesCreated} nodes, ${edgesCreated} edges`
  );

  return NextResponse.json({
    cluster: clusterName,
    occupation,
    nodesCreated,
    edgesCreated,
    source: "ai-refresh",
  });
}
