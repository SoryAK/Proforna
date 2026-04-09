import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/** Current quarter label, e.g. "2026-Q1" */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`;
}

/** Default staleness window: 30 days */
const STALE_DAYS = 30;

/**
 * Build BLS OES series IDs for a given SOC code (national level).
 * Format: OE + U + N + 0000000 + 000000 + <soc6> + <dataType>
 *   dataType 04 = annual mean, 12 = annual p10, 13 = p25,
 *            14 = median, 15 = p75, 16 = p90
 */
function buildSeriesIds(socCode: string) {
  const soc6 = socCode.replace("-", "");
  const prefix = `OEUN0000000000000${soc6}`;
  return {
    mean: `${prefix}04`,
    p10: `${prefix}12`,
    p25: `${prefix}13`,
    median: `${prefix}14`,
    p75: `${prefix}15`,
    p90: `${prefix}16`,
  };
}

/**
 * GET /api/market-research/bls?occupation=Software+Developers&code=15-1252&region=national&level=all
 *
 * Fetches real OES wage percentiles from the BLS Public Data API v2.
 * Caches in SiteMarketData so subsequent hits are instant.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const occupation = sp.get("occupation");
  const code = sp.get("code") ?? "";
  const region = sp.get("region") ?? "national";
  const level = sp.get("level") ?? "all";

  if (!occupation || !code) {
    return NextResponse.json({ error: "occupation and code parameters required" }, { status: 400 });
  }

  const periodLabel = currentPeriod();

  // ── 1. Check site-level cache ──
  const cached = await prisma.siteMarketData.findUnique({
    where: {
      socCode_region_experienceLevel_periodLabel: {
        socCode: code,
        region,
        experienceLevel: level,
        periodLabel,
      },
    },
  });

  if (cached && cached.staleAfter > new Date()) {
    return NextResponse.json({
      answer: cached.rawAnswer,
      salaryData: {
        median: cached.median,
        mean: cached.mean,
        low: cached.low,
        high: cached.high,
        p10: cached.p10,
        p25: cached.p25,
        p75: cached.p75,
        p90: cached.p90,
      },
      sources: cached.sourcesJson ? JSON.parse(cached.sourcesJson) : [],
      cached: true,
      fetchedAt: cached.fetchedAt.toISOString(),
    });
  }

  // ── 2. Fetch from BLS Public Data API v2 ──
  try {
    const seriesMap = buildSeriesIds(code);
    const seriesIds = Object.values(seriesMap);
    const currentYear = new Date().getFullYear();

    const body: Record<string, unknown> = {
      seriesid: seriesIds,
      startyear: String(currentYear - 2),
      endyear: String(currentYear),
    };
    // Optional registration key for higher rate limits
    const blsKey = process.env.BLS_API_KEY;
    if (blsKey) body.registrationkey = blsKey;

    const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `BLS API returned ${res.status}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    if (json.status !== "REQUEST_SUCCEEDED") {
      return NextResponse.json(
        { error: "BLS API request failed", detail: json.message ?? JSON.stringify(json.message) },
        { status: 502 }
      );
    }

    // Extract latest annual values from each series
    const seriesResults: Record<string, number | null> = {};
    const seriesEntries = Object.entries(seriesMap);

    for (const series of json.Results?.series ?? []) {
      const sid: string = series.seriesID;
      const entry = seriesEntries.find(([, id]) => id === sid);
      if (!entry) continue;
      const [field] = entry;
      // Data sorted newest first; take the first period with annual value
      const latest = (series.data ?? []).find(
        (d: { period: string; value: string }) => d.period === "A01" && d.value !== "-"
      );
      seriesResults[field] = latest ? parseFloat(latest.value) : null;
    }

    const salaryData = {
      median: seriesResults.median ?? null,
      mean: seriesResults.mean ?? null,
      low: seriesResults.p10 ?? null,
      high: seriesResults.p90 ?? null,
      p10: seriesResults.p10 ?? null,
      p25: seriesResults.p25 ?? null,
      p75: seriesResults.p75 ?? null,
      p90: seriesResults.p90 ?? null,
    };

    const answer = salaryData.median
      ? `BLS OES data for ${occupation} (${code}): Median annual wage $${Math.round(salaryData.median).toLocaleString()}. ` +
        `Range: $${salaryData.p10 ? Math.round(salaryData.p10).toLocaleString() : "N/A"} (10th) – ` +
        `$${salaryData.p90 ? Math.round(salaryData.p90).toLocaleString() : "N/A"} (90th percentile). ` +
        `Mean: $${salaryData.mean ? Math.round(salaryData.mean).toLocaleString() : "N/A"}.`
      : `No BLS OES wage data found for ${occupation} (${code}).`;

    const sources = [
      {
        title: "Bureau of Labor Statistics — Occupational Employment and Wage Statistics",
        url: `https://www.bls.gov/oes/current/oes${code.replace("-", "")}.htm`,
        snippet: `Official BLS OES data for SOC ${code}.`,
        score: 1,
      },
    ];

    // ── 3. Upsert into SiteMarketData ──
    const now = new Date();
    const staleAfter = new Date(now.getTime() + STALE_DAYS * 24 * 60 * 60 * 1000);

    await prisma.siteMarketData.upsert({
      where: {
        socCode_region_experienceLevel_periodLabel: {
          socCode: code,
          region,
          experienceLevel: level,
          periodLabel,
        },
      },
      update: {
        occupation,
        median: salaryData.median,
        mean: salaryData.mean,
        low: salaryData.low,
        high: salaryData.high,
        p10: salaryData.p10,
        p25: salaryData.p25,
        p75: salaryData.p75,
        p90: salaryData.p90,
        rawAnswer: answer,
        sourcesJson: JSON.stringify(sources),
        fetchedAt: now,
        staleAfter,
      },
      create: {
        occupation,
        socCode: code,
        region,
        experienceLevel: level,
        periodLabel,
        median: salaryData.median,
        mean: salaryData.mean,
        low: salaryData.low,
        high: salaryData.high,
        p10: salaryData.p10,
        p25: salaryData.p25,
        p75: salaryData.p75,
        p90: salaryData.p90,
        rawAnswer: answer,
        sourcesJson: JSON.stringify(sources),
        fetchedAt: now,
        staleAfter,
      },
    });

    return NextResponse.json({
      answer,
      salaryData,
      sources,
      cached: false,
      fetchedAt: now.toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch BLS wage data", detail: e instanceof Error ? e.message : "Unknown" },
      { status: 502 }
    );
  }
}

