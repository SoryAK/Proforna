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
 * GET /api/market-research/bls?occupation=Software+Developers&code=15-1252&region=national&level=all
 *
 * 1. Check SiteMarketData for a fresh cached row matching the query dimensions.
 * 2. If cache hit → return it immediately (zero API calls).
 * 3. If cache miss or stale → fetch from Tavily, parse numbers, upsert into SiteMarketData, return.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const occupation = sp.get("occupation");
  const code = sp.get("code") ?? "";
  const region = sp.get("region") ?? "national";
  const level = sp.get("level") ?? "all";

  if (!occupation) {
    return NextResponse.json({ error: "occupation parameter required" }, { status: 400 });
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
    // Cache hit — serve directly
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

  // ── 2. Cache miss / stale — fetch from Tavily ──
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Tavily API key not configured" }, { status: 500 });
  }

  try {
    const regionClause = region === "national" ? "United States" : region;
    const levelClause = level === "all" ? "" : `${level} level`;
    const query = `${occupation} (SOC ${code}) salary wages median annual pay ${regionClause} ${levelClause} 2025 2026`.trim();

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 8,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Tavily API returned ${res.status}`, detail: text },
        { status: 502 }
      );
    }

    const json = await res.json();
    const salaryData = parseSalaryFromAnswer(json.answer ?? "");
    const sources = (json.results ?? []).map((r: TavilyResult) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 300) ?? "",
      score: r.score,
    }));

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
        rawAnswer: json.answer ?? null,
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
        rawAnswer: json.answer ?? null,
        sourcesJson: JSON.stringify(sources),
        fetchedAt: now,
        staleAfter,
      },
    });

    return NextResponse.json({
      answer: json.answer ?? null,
      salaryData,
      sources,
      cached: false,
      fetchedAt: now.toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch wage data", detail: e instanceof Error ? e.message : "Unknown" },
      { status: 502 }
    );
  }
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/**
 * Try to extract salary figures from the Tavily answer text.
 * Looks for patterns like "$XX,XXX", "$XXk", "$XX per hour", salary ranges.
 */
function parseSalaryFromAnswer(answer: string): Record<string, number | null> {
  const result: Record<string, number | null> = {
    median: null,
    mean: null,
    low: null,
    high: null,
    p10: null,
    p25: null,
    p75: null,
    p90: null,
  };

  // Normalize text
  const text = answer.toLowerCase();

  // Match dollar amounts, capturing the number
  const dollarPattern = /\$\s?([\d,]+(?:\.\d+)?)\s*k?\b/g;
  const allAmounts: number[] = [];
  let m;
  while ((m = dollarPattern.exec(text)) !== null) {
    let val = parseFloat(m[1].replace(/,/g, ""));
    // If the match had "k", multiply
    if (m[0].toLowerCase().includes("k")) val *= 1000;
    // Likely hourly if < 200, convert to annual (2080 hrs)
    if (val < 200) val = Math.round(val * 2080);
    allAmounts.push(val);
  }

  // Try to find labeled values
  const medianMatch = text.match(/median[^$]*\$\s?([\d,]+(?:\.\d+)?)\s*k?/);
  const meanMatch = text.match(/(?:mean|average)[^$]*\$\s?([\d,]+(?:\.\d+)?)\s*k?/);
  const p10Match = text.match(/10th\s*percentile[^$]*\$\s?([\d,]+(?:\.\d+)?)\s*k?/);
  const p25Match = text.match(/25th\s*percentile[^$]*\$\s?([\d,]+(?:\.\d+)?)\s*k?/);
  const p75Match = text.match(/75th\s*percentile[^$]*\$\s?([\d,]+(?:\.\d+)?)\s*k?/);
  const p90Match = text.match(/90th\s*percentile[^$]*\$\s?([\d,]+(?:\.\d+)?)\s*k?/);

  function parseVal(match: RegExpMatchArray | null): number | null {
    if (!match) return null;
    let v = parseFloat(match[1].replace(/,/g, ""));
    if (match[0].toLowerCase().includes("k")) v *= 1000;
    if (v < 200) v = Math.round(v * 2080);
    return v;
  }

  result.median = parseVal(medianMatch);
  result.mean = parseVal(meanMatch);
  result.p10 = parseVal(p10Match);
  result.p25 = parseVal(p25Match);
  result.p75 = parseVal(p75Match);
  result.p90 = parseVal(p90Match);

  // If we found amounts but no labeled median, use the most common / middle value
  if (!result.median && allAmounts.length > 0) {
    const sorted = [...allAmounts].sort((a, b) => a - b);
    result.median = sorted[Math.floor(sorted.length / 2)];
  }

  // Try to infer low/high from range patterns
  if (allAmounts.length >= 2) {
    const sorted = [...allAmounts].sort((a, b) => a - b);
    result.low = result.low ?? sorted[0];
    result.high = result.high ?? sorted[sorted.length - 1];
  }

  return result;
}

