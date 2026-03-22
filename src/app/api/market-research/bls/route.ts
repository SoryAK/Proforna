import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/market-research/bls?series=OEUN000000000000015-1252&startyear=2022&endyear=2025
 * Proxy to the BLS public API. Parses and returns clean data.
 *
 * BLS series formats for OEWS wages:
 * OEUM{areaCode}{occCode}{dataType}
 *   areaCode: 0000000 for national, FIPS for state/metro
 *   occCode: SOC code without hyphen (e.g. 151252 for 15-1252)
 *   dataType: 01=employment, 04=mean wage, 13=median wage, 07=10th pct, 08=25th pct, 11=75th pct, 12=90th pct
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const seriesIds = sp.get("series");
  const startYear = sp.get("startyear") || "2020";
  const endYear = sp.get("endyear") || "2025";

  if (!seriesIds) {
    return NextResponse.json({ error: "series parameter required" }, { status: 400 });
  }

  const series = seriesIds.split(",").slice(0, 10); // BLS allows max ~25 series

  try {
    const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seriesid: series,
        startyear: startYear,
        endyear: endYear,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `BLS API returned ${res.status}` }, { status: 502 });
    }

    const json = await res.json();

    if (json.status !== "REQUEST_SUCCEEDED") {
      return NextResponse.json(
        { error: "BLS request failed", message: json.message },
        { status: 502 }
      );
    }

    // Clean up the response
    const results = json.Results.series.map((s: BLSSeries) => ({
      seriesId: s.seriesID,
      data: s.data.map((d: BLSDataPoint) => ({
        year: d.year,
        period: d.period,
        periodName: d.periodName,
        value: d.value === "-" ? null : parseFloat(d.value),
      })),
    }));

    return NextResponse.json({ series: results });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch BLS data", detail: e instanceof Error ? e.message : "Unknown" },
      { status: 502 }
    );
  }
}

interface BLSDataPoint {
  year: string;
  period: string;
  periodName: string;
  value: string;
}

interface BLSSeries {
  seriesID: string;
  data: BLSDataPoint[];
}
