import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { aiGenerateJSON } from "@/lib/ai";
import socCodesData from "@/data/soc-codes.json";

const socCodes = socCodesData as { code: string; title: string; group: string }[];

/* ── Types ── */

interface LLMSynonymResult {
  canonicalTitle: string;
  synonyms: {
    title: string;
    frequency: "common" | "moderate" | "rare";
    regionBias: string | null;
  }[];
  socCodes: string[];
  skillOverlap: number; // 0-100
}

/* ── Route ── */

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title } = body as { title?: string };

  if (!title || typeof title !== "string" || title.trim().length < 2) {
    return NextResponse.json({ error: "title is required (min 2 chars)" }, { status: 400 });
  }

  const role = title.trim();

  // Check for existing cluster (case-insensitive)
  const existing = await prisma.titleSynonymCluster.findFirst({
    where: {
      userId,
      canonicalTitle: { equals: role, mode: "insensitive" },
    },
  });

  if (existing) {
    return NextResponse.json(formatCluster(existing));
  }

  // Find SOC codes that match this title
  const q = role.toLowerCase();
  const matchingSoc = socCodes
    .filter((s) => s.title.toLowerCase().includes(q))
    .map((s) => s.code)
    .slice(0, 5);

  // Gather titles from the same SOC codes as seed synonyms
  const socSiblings = matchingSoc.length
    ? socCodes
        .filter((s) => matchingSoc.includes(s.code))
        .map((s) => s.title)
    : [];

  const result = await aiGenerateJSON<LLMSynonymResult>([
    {
      role: "system",
      content: `You are a job title intelligence expert. Given a job title, identify all common synonymous titles — roles that require substantially the same skills and day-to-day work, even if the words are completely different.

This is SEMANTIC role matching, not fuzzy string matching.

RULES:
- Include at least 5 synonyms if they exist for the role
- Include titles used across different industries and company sizes
- "frequency" should be "common", "moderate", or "rare"
- "regionBias" is a region where that title is preferred (e.g. "UK", "Midwest US"), or null
- "skillOverlap" is the average % of overlapping skills across all the synonyms (0-100)
- Include relevant SOC codes from: ${matchingSoc.join(", ") || "none found"}
${socSiblings.length ? `- Known SOC siblings for reference: ${socSiblings.join(", ")}` : ""}

Respond with ONLY valid JSON:
{
  "canonicalTitle": "The primary/standard title",
  "synonyms": [
    { "title": "Alternative Title", "frequency": "common", "regionBias": null }
  ],
  "socCodes": ["XX-XXXX"],
  "skillOverlap": 85
}`,
    },
    {
      role: "user",
      content: `Find all synonymous job titles for: "${role}"`,
    },
  ]);

  if (!result?.canonicalTitle || !result?.synonyms?.length) {
    return NextResponse.json(
      { error: "AI synonym generation failed — try again" },
      { status: 502 }
    );
  }

  // Persist
  const cluster = await prisma.titleSynonymCluster.create({
    data: {
      canonicalTitle: result.canonicalTitle,
      synonyms: JSON.stringify(result.synonyms),
      socCodes: JSON.stringify(result.socCodes ?? []),
      skillOverlap: result.skillOverlap ?? 0,
      userId,
    },
  });

  return NextResponse.json(formatCluster(cluster), { status: 201 });
}

/* GET — Fetch all synonym clusters for the user */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clusters = await prisma.titleSynonymCluster.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(clusters.map(formatCluster));
}

/* ── Formatting ── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatCluster(c: any) {
  return {
    id: c.id,
    canonicalTitle: c.canonicalTitle,
    synonyms: safeJSONParse(c.synonyms, []),
    socCodes: safeJSONParse(c.socCodes, []),
    skillOverlap: c.skillOverlap,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function safeJSONParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
