import { NextResponse } from "next/server";

// DOL Form 5500 API — fetches employee benefit plan data by EIN
// Free, no API key required
// Docs: https://enforcedata.dol.gov/homePage/

async function searchDol(query: string): Promise<unknown[]> {
  const apiUrl = new URL("https://enforcedata.dol.gov/api/datacast/search");
  apiUrl.searchParams.set("match_type", "and");
  apiUrl.searchParams.set("query", query);
  apiUrl.searchParams.set("agency", "ebsa");
  apiUrl.searchParams.set("size", "5");
  apiUrl.searchParams.set("start", "0");

  const res = await fetch(apiUrl.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const raw = await res.json();
  return raw?.results ?? [];
}

export async function POST(request: Request) {
  try {
    const { ein, companyName } = await request.json();
    if (!ein && !companyName) {
      return NextResponse.json({ error: "EIN or company name required" }, { status: 400 });
    }

    const cleanEin = ein ? ein.replace(/\D/g, "") : null;

    // Try EIN first, then fallback to company name
    let results: unknown[] = [];
    if (cleanEin && cleanEin.length === 9) {
      results = await searchDol(cleanEin);
    }
    if (results.length === 0 && companyName) {
      results = await searchDol(companyName);
    }

    if (results.length === 0) {
      return NextResponse.json({ data: null, source: "dol", message: "No Form 5500 filings found" });
    }

    // Extract the most relevant filing data
    const filings = (results as Record<string, unknown>[]).map((r) => ({
      planName: r.plan_name ?? r.title ?? null,
      sponsorName: r.sponsor_name ?? null,
      planYear: r.plan_year ?? null,
      participantCount: r.total_participants ?? null,
      totalAssets: r.total_assets ?? null,
      planType: r.plan_type ?? null,
    }));

    // Aggregate useful info
    const latest = filings[0];
    const maxParticipants = Math.max(
      ...filings.map((f) => Number(f.participantCount) || 0)
    );

    return NextResponse.json({
      data: {
        filings,
        summary: {
          planCount: filings.length,
          latestPlanName: latest?.planName,
          sponsorName: latest?.sponsorName,
          estimatedEmployees: maxParticipants > 0 ? maxParticipants : null,
        },
      },
      source: "dol",
    });
  } catch (error) {
    return NextResponse.json({ data: null, source: "dol", error: String(error) });
  }
}
