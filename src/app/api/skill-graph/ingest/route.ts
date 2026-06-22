import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { ai, AIProviderError } from "@/lib/ai";
import { toAIEnvelope } from "@/lib/ai/envelope";
import type { AIResponse } from "@/lib/ai/types";

/**
 * POST /api/skill-graph/ingest
 *
 * Accepts either:
 *   { source: "job_postings" }  — scans user's saved job postings for skill extraction
 *   { source: "text", text: "..." }  — extracts skills from arbitrary text (resume, job desc)
 *   { source: "resume" }  — scans user's latest resume for skill extraction
 *
 * Uses Gemini to extract skill nodes + typed edges, upserts into the graph.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { source } = body;

  let textToAnalyze = "";

  if (source === "job_postings") {
    // Pull user's saved job postings (last 50)
    const postings = await prisma.jobPosting.findMany({
      where: { userId },
      select: { role: true, description: true, requirements: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (postings.length === 0) {
      return NextResponse.json({ error: "No job postings found to analyze" }, { status: 400 });
    }

    textToAnalyze = postings
      .map((p) => `Role: ${p.role}\nRequirements: ${p.requirements ?? ""}\nDescription: ${p.description ?? ""}`)
      .join("\n---\n");
  } else if (source === "text" && body.text) {
    textToAnalyze = body.text;
  } else if (source === "resume") {
    const resume = await prisma.resumeVersion.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { notes: true },
    });

    if (!resume?.notes) {
      return NextResponse.json({ error: "No resume found" }, { status: 400 });
    }

    textToAnalyze = resume.notes;
  } else {
    return NextResponse.json(
      { error: "source must be 'job_postings', 'resume', or 'text' (with text field)" },
      { status: 400 }
    );
  }

  // Truncate to ~30k chars to stay within Gemini context
  if (textToAnalyze.length > 30000) {
    textToAnalyze = textToAnalyze.slice(0, 30000);
  }

  // Call Gemini to extract skills + connections
  const prompt = `You are a skill-graph extraction engine for career intelligence.

Analyze the following text and extract:
1. Technical skills (specific technologies, tools, methodologies)
2. Domain skills (broad knowledge areas like "Electrical Engineering", "Data Analytics")
3. Connections between skills with relationship types

For each connection, classify as one of:
- "prerequisite": Skill A must be learned before Skill B
- "peer": Skills are commonly used together at the same level
- "bridge": Skill connects two otherwise separate domains
- "child": Skill is a sub-skill or specialization of another
- "enables": Having Skill A makes learning Skill B significantly easier

IMPORTANT FILTERS:
- Only extract TECHNICAL and DOMAIN skills. Ignore generic soft skills like "Teamwork", "Communication", "Microsoft Office"
- Skill names should be specific and standardized (e.g., "PLC Programming" not "programming PLCs")
- Weight connections by frequency: if skills appear together multiple times, increase weight (1-10 scale)

Respond ONLY with valid JSON in this exact format:
{
  "nodes": [
    { "name": "Skill Name", "type": "technical" | "domain" | "tool" }
  ],
  "edges": [
    { "from": "Skill Name A", "to": "Skill Name B", "type": "peer", "weight": 5, "reasoning": "Both appear in 80% of automation job listings" }
  ]
}

Text to analyze:
${textToAnalyze}`;

  let extracted: { nodes: { name: string; type: string }[]; edges: { from: string; to: string; type: string; weight: number; reasoning?: string }[] };
  let aiResult: AIResponse<typeof extracted> | null = null;
  let aiDurationMs = 0;

  try {
    const t0 = Date.now();
    const result = await ai.generate<typeof extracted>({
      task: "extract",
      messages: [{ role: "user", content: prompt }],
      userId,
    });
    aiDurationMs = Date.now() - t0;
    aiResult = result;
    extracted = result.json ?? { nodes: [], edges: [] };
    console.log(`[skill-graph/ingest] used model: ${result.model}`);
  } catch (error) {
    if (error instanceof AIProviderError) {
      console.error(`[skill-graph/ingest] ${error.providerId} error:`, error.message);
      return NextResponse.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: error.status ?? 500 },
      );
    }
    console.error("[skill-graph/ingest] Error:", error);
    return NextResponse.json({ error: "AI extraction failed" }, { status: 500 });
  }

  if (!extracted.nodes || !Array.isArray(extracted.nodes)) {
    return NextResponse.json({ error: "AI returned no nodes" }, { status: 502 });
  }

  // Upsert nodes
  const nodeMap = new Map<string, string>(); // name → id

  for (const n of extracted.nodes) {
    const name = n.name?.trim();
    if (!name) continue;

    const node = await prisma.skillNode.upsert({
      where: { userId_name: { userId, name } },
      update: { type: n.type ?? "technical" },
      create: {
        userId,
        name,
        type: n.type ?? "technical",
        source: source === "job_postings" ? "market" : "ai",
      },
    });

    nodeMap.set(name, node.id);
  }

  // Upsert edges
  let edgesCreated = 0;
  for (const e of extracted.edges ?? []) {
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
        metadata: e.reasoning ? JSON.stringify({ reasoning: e.reasoning }) : null,
      },
      create: {
        fromId,
        toId,
        type: edgeType,
        weight: Math.min(10, Math.max(0, e.weight ?? 1)),
        source: source === "job_postings" ? "job_posting" : "ai",
        metadata: e.reasoning ? JSON.stringify({ reasoning: e.reasoning }) : null,
      },
    });
    edgesCreated++;
  }

  await logActivity(
    "skill_graph",
    userId,
    "ingest",
    `Ingested ${nodeMap.size} nodes and ${edgesCreated} edges from ${source}`
  );

  const responseBody = {
    nodesCreated: nodeMap.size,
    edgesCreated,
    source,
  };
  return NextResponse.json(
    aiResult ? toAIEnvelope(responseBody, aiResult, aiDurationMs) : responseBody,
  );
}
