import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/detect-duplicates
 *   { jobs: [ { id, title, company, location, description? }, ... ] }
 *   → { groups: [ { canonical: "id1", duplicates: ["id2","id3"], reason: "Same role, same location" }, ... ] }
 *
 * Detects duplicate postings: same role posted by recruiter AND directly by employer.
 * Uses title similarity + location proximity + description overlap.
 */

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Simple token overlap similarity (Jaccard) */
function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(normalize(b).split(" ").filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const w of ta) if (tb.has(w)) intersection++;
  return intersection / Math.max(ta.size, tb.size);
}

/** Extract city from "City, ST" patterns */
function extractCity(location: string): string {
  const m = location.match(/^([^,]+)/);
  return m ? m[1].trim().toLowerCase() : location.toLowerCase().trim();
}

interface JobInput {
  id: string;
  title: string;
  company: string;
  location: string;
  description?: string;
}

interface DuplicateGroup {
  canonical: string;  // the "best" posting (direct employer preferred)
  duplicates: string[];
  reason: string;
}

export async function POST(req: NextRequest) {
  const { jobs } = (await req.json()) as { jobs: JobInput[] };
  if (!jobs || jobs.length < 2) return NextResponse.json({ groups: [] });

  // Limit to prevent abuse
  const capped = jobs.slice(0, 500);

  const groups: DuplicateGroup[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < capped.length; i++) {
    if (assigned.has(capped[i].id)) continue;

    const cluster: string[] = [];
    for (let j = i + 1; j < capped.length; j++) {
      if (assigned.has(capped[j].id)) continue;

      const titleSim = tokenSimilarity(capped[i].title, capped[j].title);
      if (titleSim < 0.6) continue;

      const cityA = extractCity(capped[i].location);
      const cityB = extractCity(capped[j].location);
      const sameCity = cityA === cityB || cityA.includes(cityB) || cityB.includes(cityA);
      if (!sameCity) continue;

      // Optional: check description overlap if available
      let descSim = 0;
      if (capped[i].description && capped[j].description) {
        descSim = tokenSimilarity(
          capped[i].description!.slice(0, 500),
          capped[j].description!.slice(0, 500)
        );
      }

      if (titleSim >= 0.7 || (titleSim >= 0.6 && descSim >= 0.5)) {
        cluster.push(capped[j].id);
        assigned.add(capped[j].id);
      }
    }

    if (cluster.length > 0) {
      assigned.add(capped[i].id);
      groups.push({
        canonical: capped[i].id,
        duplicates: cluster,
        reason: `Similar title in ${extractCity(capped[i].location)}`,
      });
    }
  }

  return NextResponse.json({ groups });
}
