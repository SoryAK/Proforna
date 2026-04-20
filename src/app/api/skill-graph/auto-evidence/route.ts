import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { callGemini, geminiErrorMessage } from "@/lib/gemini";

/**
 * POST /api/skill-graph/auto-evidence
 *
 * Scans the user's WorkHistory, Certifications, LearningItems, and CurrentPosition,
 * then uses Gemini to match them against existing skill nodes and auto-create evidence links.
 */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch user's skill nodes and existing data in parallel
  const [skillNodes, workHistory, certifications, learningItems, activePositions, existingEvidence] =
    await Promise.all([
      prisma.skillNode.findMany({
        where: { userId },
        select: { id: true, name: true, type: true },
      }),
      prisma.workHistory.findMany({
        where: { userId },
        select: { id: true, company: true, title: true, startDate: true, endDate: true },
      }),
      prisma.certification.findMany({
        where: { userId },
        select: { id: true, name: true, issuer: true },
      }),
      prisma.learningItem.findMany({
        where: { userId },
        select: { id: true, title: true, provider: true, skills: true, status: true, progress: true },
      }),
      prisma.workHistory.findMany({
        where: { userId },
        select: { id: true, company: true, title: true, techStack: true, responsibilities: true },
      }),
      prisma.skillEvidence.findMany({
        where: { userId },
        select: { skillNodeId: true, artifactType: true, artifactId: true },
      }),
    ]);

  if (skillNodes.length === 0) {
    return NextResponse.json(
      { error: "No skill nodes in your graph. Seed a scaffold or add skills first." },
      { status: 400 }
    );
  }

  const totalArtifacts =
    workHistory.length + certifications.length + learningItems.length + activePositions.length;

  if (totalArtifacts === 0) {
    return NextResponse.json(
      { error: "No work history, certifications, learning items, or positions found to link." },
      { status: 400 }
    );
  }

  // Build existing evidence set for dedup
  const existingSet = new Set(
    existingEvidence.map((e) => `${e.skillNodeId}:${e.artifactType}:${e.artifactId ?? ""}`)
  );

  // Build the artifacts text for Gemini
  const artifactDescriptions: string[] = [];

  for (const wh of workHistory) {
    artifactDescriptions.push(
      `[WORK_HISTORY id="${wh.id}"] ${wh.title ?? "Unknown Role"} at ${wh.company} (${wh.startDate ?? "?"} – ${wh.endDate ?? "present"})`
    );
  }

  for (const cert of certifications) {
    artifactDescriptions.push(
      `[CERTIFICATION id="${cert.id}"] ${cert.name} by ${cert.issuer}`
    );
  }

  for (const li of learningItems) {
    const skillsStr = li.skills ? ` | Skills: ${li.skills}` : "";
    artifactDescriptions.push(
      `[LEARNING_ITEM id="${li.id}"] ${li.title} (${li.provider ?? "self-study"}, ${li.status}, ${li.progress}% complete)${skillsStr}`
    );
  }

  for (const cp of activePositions) {
    const techStr = cp.techStack ? ` | Tech: ${cp.techStack}` : "";
    const respStr = cp.responsibilities ? ` | Resp: ${cp.responsibilities.slice(0, 200)}` : "";
    artifactDescriptions.push(
      `[CURRENT_POSITION id="${cp.id}"] ${cp.title} at ${cp.company}${techStr}${respStr}`
    );
  }

  const skillList = skillNodes.map((s) => `"${s.name}" (${s.type})`).join(", ");

  const prompt = `You are a skill-evidence matching engine.

Given these SKILL NODES in the user's graph:
${skillList}

And these CAREER ARTIFACTS:
${artifactDescriptions.join("\n")}

For each artifact, determine which skills it provides evidence for.
Assign a strength score (0-100):
- 80-100: Deep, hands-on, daily use or formal certification
- 50-79: Regular use, partial coverage, or supplementary
- 20-49: Exposure, theoretical knowledge, or tangential

RULES:
- Only match skills that ACTUALLY appear in the skill nodes list above
- Use the EXACT skill name from the list (case-sensitive)
- Be conservative — don't match unless there's a real connection
- For certifications, assume 70-90 strength
- For work history, infer from job title + company domain
- For learning items, scale by progress (20% complete = lower strength)
- For current positions, techStack items are high strength

Respond ONLY with valid JSON:
{
  "matches": [
    {
      "skillName": "Exact Skill Name",
      "artifactType": "work_history" | "certification" | "learning_item" | "current_position",
      "artifactId": "the-id-from-brackets",
      "strength": 75,
      "reasoning": "Brief reason"
    }
  ]
}`;

  const { res: geminiRes, model } = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  if (!geminiRes.ok) {
    const { message } = await geminiErrorMessage(geminiRes);
    console.error(`[auto-evidence] ${model} error:`, message);
    return NextResponse.json({ error: message }, { status: geminiRes.status });
  }

  const geminiData = await geminiRes.json();
  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let result: {
    matches: {
      skillName: string;
      artifactType: string;
      artifactId: string;
      strength: number;
      reasoning?: string;
    }[];
  };

  try {
    result = JSON.parse(rawText);
  } catch {
    console.error("[auto-evidence] Failed to parse Gemini JSON:", rawText.slice(0, 500));
    return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 502 });
  }

  if (!result.matches || !Array.isArray(result.matches)) {
    return NextResponse.json({ error: "AI returned no matches" }, { status: 502 });
  }

  // Build name→id map for skill nodes
  const nameToId = new Map(skillNodes.map((s) => [s.name, s.id]));

  // Validate artifact type mapping
  const validTypes = new Set(["work_history", "certification", "learning_item", "current_position"]);

  let created = 0;
  let skipped = 0;

  for (const match of result.matches) {
    const skillNodeId = nameToId.get(match.skillName);
    if (!skillNodeId) {
      skipped++;
      continue;
    }

    if (!validTypes.has(match.artifactType)) {
      skipped++;
      continue;
    }

    // Clamp strength
    const strength = Math.min(100, Math.max(0, match.strength ?? 50));

    // Check for existing evidence (dedup)
    const key = `${skillNodeId}:${match.artifactType}:${match.artifactId}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    try {
      await prisma.skillEvidence.create({
        data: {
          userId,
          skillNodeId,
          artifactType: match.artifactType,
          artifactId: match.artifactId,
          strength,
          notes: match.reasoning ?? null,
        },
      });
      existingSet.add(key);
      created++;
    } catch {
      // Unique constraint violation or other error — skip
      skipped++;
    }
  }

  await logActivity(
    "skill_graph",
    userId,
    "auto_evidence",
    `Auto-linked ${created} evidence items from ${totalArtifacts} artifacts (${skipped} skipped)`
  );

  return NextResponse.json({
    evidenceCreated: created,
    skipped,
    artifactsScanned: totalArtifacts,
    skillNodesMatched: new Set(result.matches.map((m) => m.skillName).filter((n) => nameToId.has(n))).size,
  });
}
