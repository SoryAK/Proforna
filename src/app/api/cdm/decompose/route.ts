import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { aiGenerateJSON } from "@/lib/ai";
import socCodesData from "@/data/soc-codes.json";

const socCodes = socCodesData as { code: string; title: string; group: string }[];

/* ── Types for the LLM decomposition response ── */

interface LLMDomain {
  name: string;
  keySkills: string[];
  socCodes: string[];
}

interface LLMCombination {
  domains: string[];        // domain names
  roles: string[];          // job titles this combination unlocks
  socCodes: string[];
  level: string;            // entry | mid | senior | lead | executive
  salaryMin: number | null;
  salaryMax: number | null;
}

interface LLMDecomposition {
  domains: LLMDomain[];
  combinations: LLMCombination[];
}

/* ── SOC code lookup helper ── */

function findSOCCodes(query: string): { code: string; title: string }[] {
  const q = query.toLowerCase();
  return socCodes
    .filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.code.includes(q)
    )
    .slice(0, 5);
}

/* ── Route ── */

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { targetRole, pathId } = body as { targetRole?: string; pathId?: string };

  if (!targetRole || typeof targetRole !== "string" || targetRole.trim().length < 2) {
    return NextResponse.json({ error: "targetRole is required (min 2 chars)" }, { status: 400 });
  }

  const role = targetRole.trim();

  // Check for an existing tree for this user + role (cache hit)
  const existing = await prisma.decompositionTree.findFirst({
    where: { userId, targetRole: role },
    include: {
      combinations: {
        include: { domains: { include: { domain: true } } },
      },
    },
  });

  if (existing) {
    return NextResponse.json(formatTree(existing));
  }

  // Find closest SOC code for the target role
  const socMatches = findSOCCodes(role);
  const targetSocCode = socMatches[0]?.code ?? null;

  // Build the available SOC titles for the prompt so the LLM can reference real codes
  const socContext = socCodes
    .slice(0, 200)
    .map((s) => `${s.code}: ${s.title}`)
    .join("\n");

  // Generate decomposition via LLM
  const decomposition = await aiGenerateJSON<LLMDecomposition>([
    {
      role: "system",
      content: `You are a career intelligence expert. Decompose a target job role into its constituent skill domains and map all viable career positions at each domain combination level.

RULES:
- Identify 2-4 primary skill domains that define the target role
- For each possible subset of those domains (singles, pairs, triples, etc.), list the job titles that typically require exactly that combination
- Include entry, mid, senior levels where applicable
- Include approximate US salary ranges (annual, min/max) when possible
- Reference real SOC codes from the list below when they match

SOC CODE REFERENCE (partial):
${socContext}

Respond with ONLY valid JSON matching this structure:
{
  "domains": [
    { "name": "Domain Name", "keySkills": ["skill1", "skill2"], "socCodes": ["XX-XXXX"] }
  ],
  "combinations": [
    { "domains": ["Domain Name"], "roles": ["Job Title 1"], "socCodes": ["XX-XXXX"], "level": "entry", "salaryMin": 40000, "salaryMax": 60000 }
  ]
}`,
    },
    {
      role: "user",
      content: `Decompose the role: "${role}"`,
    },
  ]);

  // Validate the LLM response has required shape
  if (
    !decomposition?.domains?.length ||
    !decomposition?.combinations?.length
  ) {
    return NextResponse.json(
      { error: "AI decomposition failed — try again" },
      { status: 502 }
    );
  }

  // Persist: create the tree, domains, and combinations in a transaction
  const tree = await prisma.$transaction(async (tx) => {
    // 1. Create the tree root
    const treeRecord = await tx.decompositionTree.create({
      data: {
        targetRole: role,
        targetSocCode: targetSocCode,
        userId,
        pathId: pathId ?? null,
      },
    });

    // 2. Create skill domains
    const domainMap = new Map<string, string>(); // name → id
    for (const d of decomposition.domains) {
      const domain = await tx.skillDomain.create({
        data: {
          name: d.name,
          keySkills: JSON.stringify(d.keySkills),
          socCodes: JSON.stringify(d.socCodes),
        },
      });
      domainMap.set(d.name, domain.id);
    }

    // 3. Create combinations with domain links
    for (const c of decomposition.combinations) {
      const combo = await tx.domainCombination.create({
        data: {
          roles: JSON.stringify(c.roles),
          socCodes: JSON.stringify(c.socCodes),
          salaryMin: c.salaryMin,
          salaryMax: c.salaryMax,
          level: c.level || "mid",
          treeId: treeRecord.id,
        },
      });

      // Link domains
      for (const domainName of c.domains) {
        const domainId = domainMap.get(domainName);
        if (domainId) {
          await tx.domainCombinationDomain.create({
            data: { combinationId: combo.id, domainId },
          });
        }
      }
    }

    // 4. Re-fetch with relations
    return tx.decompositionTree.findUniqueOrThrow({
      where: { id: treeRecord.id },
      include: {
        combinations: {
          include: { domains: { include: { domain: true } } },
        },
      },
    });
  });

  return NextResponse.json(formatTree(tree), { status: 201 });
}

/* GET — Fetch existing trees for the user */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trees = await prisma.decompositionTree.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      combinations: {
        include: { domains: { include: { domain: true } } },
      },
    },
  });

  return NextResponse.json(trees.map(formatTree));
}

/* ── Formatting helper ── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTree(tree: any) {
  return {
    id: tree.id,
    targetRole: tree.targetRole,
    targetSocCode: tree.targetSocCode,
    pathId: tree.pathId,
    createdAt: tree.createdAt,
    updatedAt: tree.updatedAt,
    combinations: tree.combinations.map((c: any) => ({
      id: c.id,
      roles: safeJSONParse(c.roles, []),
      socCodes: safeJSONParse(c.socCodes, []),
      salaryMin: c.salaryMin,
      salaryMax: c.salaryMax,
      level: c.level,
      domains: c.domains.map((d: any) => ({
        id: d.domain.id,
        name: d.domain.name,
        keySkills: safeJSONParse(d.domain.keySkills, []),
        socCodes: safeJSONParse(d.domain.socCodes, []),
      })),
    })),
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
