import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

// OSHA Establishment Search — fetches workplace safety inspection data
// Free, no API key required
// Docs: https://enforcedata.dol.gov/homePage/

async function searchOsha(query: string): Promise<unknown[]> {
  const apiUrl = new URL("https://enforcedata.dol.gov/api/datacast/search");
  apiUrl.searchParams.set("match_type", "and");
  apiUrl.searchParams.set("query", query);
  apiUrl.searchParams.set("agency", "osha");
  apiUrl.searchParams.set("size", "10");
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
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { ein, companyName } = await request.json();
    if (!ein && !companyName) {
      return NextResponse.json({ error: "EIN or company name required" }, { status: 400 });
    }

    const cleanEin = ein ? ein.replace(/\D/g, "") : null;

    // Try EIN first, then fallback to company name
    let results: unknown[] = [];
    if (cleanEin) {
      results = await searchOsha(cleanEin);
    }
    if (results.length === 0 && companyName) {
      results = await searchOsha(companyName);
    }

    if (results.length === 0) {
      return NextResponse.json({ data: null, source: "osha", message: "No OSHA inspections found" });
    }

    const inspections = (results as Record<string, unknown>[]).map((r) => ({
      activityNumber: r.activity_nr ?? null,
      establishmentName: r.estab_name ?? r.title ?? null,
      site: r.site_address ?? null,
      city: r.site_city ?? null,
      state: r.site_state ?? null,
      openDate: r.open_date ?? null,
      closeDate: r.close_case_date ?? null,
      inspectionType: r.insp_type ?? null,
      violations: r.total_violations ?? null,
      totalPenalty: r.total_penalty ?? null,
    }));

    const totalViolations = inspections.reduce(
      (sum, i) => sum + (Number(i.violations) || 0),
      0
    );
    const totalPenalties = inspections.reduce(
      (sum, i) => sum + (Number(i.totalPenalty) || 0),
      0
    );

    return NextResponse.json({
      data: {
        inspections,
        summary: {
          inspectionCount: inspections.length,
          totalViolations,
          totalPenalties,
          latestInspection: inspections[0]?.openDate ?? null,
        },
      },
      source: "osha",
    });
  } catch (error) {
    return NextResponse.json({ data: null, source: "osha", error: String(error) });
  }
}
