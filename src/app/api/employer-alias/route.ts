import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { normEmployer as norm } from "@/lib/employer-alias";

/* ── Fuzzy helpers ── */

/** Simple bigram similarity (Dice coefficient) — returns 0..1 */
function bigrams(s: string): Set<string> {
  const b = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2));
  return b;
}

function diceCoefficient(a: string, b: string): number {
  const ba = bigrams(norm(a));
  const bb = bigrams(norm(b));
  if (ba.size === 0 && bb.size === 0) return 1;
  if (ba.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  for (const bg of ba) if (bb.has(bg)) intersection++;
  return (2 * intersection) / (ba.size + bb.size);
}

/** Check if one normalised string contains the other */
function containsMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  return na.includes(nb) || nb.includes(na);
}

/* ── GET — list all aliases + suggest fuzzy matches ── */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = req.nextUrl.searchParams.get("mode"); // "suggestions" | undefined

  if (mode === "suggestions") {
    // Gather all distinct employer names from entries + W2s + WorkHistory
    const [entries, w2s, workHistory, existingAliases] = await Promise.all([
      prisma.careerIncomeEntry.findMany({
        where: { incomeYear: { userId } },
        select: { employer: true },
        distinct: ["employer"],
      }),
      prisma.w2Record.findMany({
        where: { incomeYear: { userId } },
        select: { employerName: true },
        distinct: ["employerName"],
      }),
      prisma.workHistory.findMany({
        where: { userId },
        select: { company: true },
        distinct: ["company"],
      }),
      prisma.employerAlias.findMany({
        where: { userId },
      }),
    ]);

    const allNames = new Set<string>();
    entries.forEach((e) => allNames.add(e.employer));
    w2s.forEach((e) => { if (e.employerName) allNames.add(e.employerName); });
    workHistory.forEach((e) => allNames.add(e.company));

    // Build alias lookup: variant → canonical
    const aliasMap = new Map<string, string>();
    existingAliases.forEach((a) => aliasMap.set(norm(a.variantName), a.canonicalName));

    // Group names: already-aliased go into their canonical group; others get fuzzy-matched
    const groups = new Map<string, Set<string>>(); // canonical → variants
    const unmatched: string[] = [];

    for (const name of allNames) {
      const n = norm(name);
      const canonical = aliasMap.get(n);
      if (canonical) {
        if (!groups.has(canonical)) groups.set(canonical, new Set());
        groups.get(canonical)!.add(name);
      } else {
        unmatched.push(name);
      }
    }

    // Fuzzy-match unmatched names to find clusters
    const suggestions: { names: string[]; similarity: number }[] = [];
    const matched = new Set<string>();

    for (let i = 0; i < unmatched.length; i++) {
      if (matched.has(unmatched[i])) continue;
      const cluster = [unmatched[i]];
      for (let j = i + 1; j < unmatched.length; j++) {
        if (matched.has(unmatched[j])) continue;
        const sim = diceCoefficient(unmatched[i], unmatched[j]);
        const contains = containsMatch(unmatched[i], unmatched[j]);
        if (sim >= 0.45 || contains) {
          cluster.push(unmatched[j]);
          matched.add(unmatched[j]);
        }
      }
      if (cluster.length > 1) {
        const avgSim = cluster.length > 1
          ? cluster.slice(1).reduce((s, c) => s + diceCoefficient(cluster[0], c), 0) / (cluster.length - 1)
          : 1;
        suggestions.push({ names: cluster, similarity: Math.round(avgSim * 100) / 100 });
      }
      matched.add(unmatched[i]);
    }

    return NextResponse.json({
      allNames: Array.from(allNames).sort(),
      existingGroups: Object.fromEntries(
        Array.from(groups.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      suggestions,
    });
  }

  // Default: list all aliases
  const aliases = await prisma.employerAlias.findMany({
    where: { userId },
    orderBy: { canonicalName: "asc" },
  });

  return NextResponse.json(aliases);
}

/* ── POST — merge employer names (set canonical + variants) ── */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { canonicalName, variants } = body as { canonicalName: string; variants: string[] };

  if (!canonicalName?.trim() || !Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json({ error: "canonicalName and variants[] required" }, { status: 400 });
  }

  const canonical = canonicalName.trim();

  // Upsert each variant as an alias
  const results = await Promise.all(
    variants
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((variantName) =>
        prisma.employerAlias.upsert({
          where: { userId_variantName: { userId, variantName: norm(variantName) } },
          create: { userId, canonicalName: canonical, variantName: norm(variantName) },
          update: { canonicalName: canonical },
        })
      )
  );

  // Also add canonical itself as a variant (so lookups always work)
  await prisma.employerAlias.upsert({
    where: { userId_variantName: { userId, variantName: norm(canonical) } },
    create: { userId, canonicalName: canonical, variantName: norm(canonical) },
    update: { canonicalName: canonical },
  });

  return NextResponse.json({ merged: results.length + 1, canonicalName: canonical });
}

/* ── DELETE — remove an alias ── */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  const canonical = req.nextUrl.searchParams.get("canonical");

  if (!id && !canonical) return NextResponse.json({ error: "id or canonical required" }, { status: 400 });

  if (canonical) {
    // Delete entire alias group by canonical name
    await prisma.employerAlias.deleteMany({ where: { userId, canonicalName: canonical } });
  } else {
    await prisma.employerAlias.deleteMany({ where: { id: id!, userId } });
  }

  return NextResponse.json({ deleted: true });
}
