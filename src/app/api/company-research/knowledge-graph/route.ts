import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface KGEntity {
  name: string;
  description?: string;
  detailedDescription?: { articleBody?: string; url?: string };
  image?: { contentUrl?: string; url?: string };
  url?: string;
  entityTypes?: string[];
}

interface KGResult {
  name: string;
  description: string | null;
  detailedDescription: string | null;
  wikipediaUrl: string | null;
  imageUrl: string | null;
  officialUrl: string | null;
  entityTypes: string[];
}

/** Search Google Knowledge Graph for an organization by name */
async function searchKnowledgeGraph(
  companyName: string,
): Promise<KGResult | null> {
  if (!GOOGLE_KEY) return null;

  const url = new URL(
    "https://kgsearch.googleapis.com/v1/entities:search",
  );
  url.searchParams.set("query", companyName);
  url.searchParams.set("types", "Organization");
  url.searchParams.set("limit", "3");
  url.searchParams.set("languages", "en");
  url.searchParams.set("key", GOOGLE_KEY);

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

  const data = await res.json();
  const elements = data.itemListElement;
  if (!elements?.length) return null;

  // Pick best match: highest resultScore that contains the search name
  const needle = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  let best: { entity: KGEntity; score: number } | null = null;

  for (const item of elements) {
    const entity: KGEntity = item.result;
    const score: number = item.resultScore ?? 0;
    const entityNorm = (entity.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    // Prefer entities whose name overlaps with our query
    const overlap =
      entityNorm.includes(needle) || needle.includes(entityNorm);
    if (!best || (overlap && score > best.score)) {
      best = { entity, score };
    }
  }

  if (!best) {
    // Fall back to highest-scoring result
    best = {
      entity: elements[0].result,
      score: elements[0].resultScore ?? 0,
    };
  }

  const e = best.entity;
  return {
    name: e.name,
    description: e.description || null,
    detailedDescription: e.detailedDescription?.articleBody || null,
    wikipediaUrl: e.detailedDescription?.url || null,
    imageUrl: e.image?.contentUrl || e.image?.url || null,
    officialUrl: e.url || null,
    entityTypes: e.entityTypes || [],
  };
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { companyName } = await request.json();
    if (!companyName)
      return NextResponse.json(
        { error: "Company name required" },
        { status: 400 },
      );

    const result = await searchKnowledgeGraph(companyName);
    return NextResponse.json({ data: result, source: "knowledge_graph" });
  } catch (error) {
    return NextResponse.json({
      data: null,
      source: "knowledge_graph",
      error: String(error),
    });
  }
}
