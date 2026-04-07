import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/gas-prices?state=PA
 *
 * Returns the latest retail regular-gasoline price for a US state
 * using the EIA (Energy Information Administration) API v2.
 *
 * The EIA /petroleum/pri/gnd/ endpoint has state-level prices for ~9 states
 * and PADD-region prices for the rest. We try the state first, then fall back
 * to the PADD region the state belongs to.
 *
 * Requires EIA_API_KEY in env. Free registration: https://www.eia.gov/opendata/register.php
 * Caches responses for 24 hours (prices update weekly).
 */

const EIA_KEY = process.env.EIA_API_KEY;

// In-memory cache: stateCode → { price, date, fetchedAt, region }
const cache = new Map<string, { price: number; state: string; date: string; region: string; fetchedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Map every state to its PADD region code used by EIA
// PADD 1A (New England): CT ME MA NH RI VT
// PADD 1B (Central Atlantic): DE DC MD NJ NY PA
// PADD 1C (Lower Atlantic): FL GA NC SC VA WV
// PADD 2 (Midwest): IL IN IA KS KY MI MN MO NE ND OH OK SD TN WI
// PADD 3 (Gulf Coast): AL AR LA MS NM TX
// PADD 4 (Rocky Mountain): CO ID MT UT WY
// PADD 5 (West Coast): AK AZ CA HI NV OR WA
const STATE_TO_PADD: Record<string, string> = {
  CT: "R1X", ME: "R1X", MA: "R1X", NH: "R1X", RI: "R1X", VT: "R1X",
  DE: "R1Y", DC: "R1Y", MD: "R1Y", NJ: "R1Y", NY: "R1Y", PA: "R1Y",
  FL: "R1Z", GA: "R1Z", NC: "R1Z", SC: "R1Z", VA: "R1Z", WV: "R1Z",
  IL: "R20", IN: "R20", IA: "R20", KS: "R20", KY: "R20", MI: "R20",
  MN: "R20", MO: "R20", NE: "R20", ND: "R20", OH: "R20", OK: "R20",
  SD: "R20", TN: "R20", WI: "R20",
  AL: "R30", AR: "R30", LA: "R30", MS: "R30", NM: "R30", TX: "R30",
  CO: "R40", ID: "R40", MT: "R40", UT: "R40", WY: "R40",
  AK: "R50", AZ: "R50", CA: "R50", HI: "R50", NV: "R50", OR: "R50", WA: "R50",
};

const PADD_LABELS: Record<string, string> = {
  R1X: "New England (PADD 1A)",
  R1Y: "Central Atlantic (PADD 1B)",
  R1Z: "Lower Atlantic (PADD 1C)",
  R20: "Midwest (PADD 2)",
  R30: "Gulf Coast (PADD 3)",
  R40: "Rocky Mountain (PADD 4)",
  R50: "West Coast (PADD 5)",
};

async function fetchEIA(duoarea: string): Promise<{ value: string; period: string } | null> {
  const url = new URL("https://api.eia.gov/v2/petroleum/pri/gnd/data/");
  url.searchParams.set("api_key", EIA_KEY!);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.set("data[]", "value");
  url.searchParams.set("facets[duoarea][]", duoarea);
  url.searchParams.set("facets[product][]", "EPMR");
  url.searchParams.set("facets[process][]", "PTE");
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("length", "1");

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const json = await res.json();
  const row = json?.response?.data?.[0];
  if (!row?.value) return null;
  return { value: row.value, period: row.period };
}

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state")?.toUpperCase();
  if (!state || !/^[A-Z]{2}$/.test(state)) {
    return NextResponse.json({ error: "Missing or invalid state param (e.g., ?state=PA)" }, { status: 400 });
  }

  if (!EIA_KEY) {
    return NextResponse.json({ error: "EIA_API_KEY not configured" }, { status: 503 });
  }

  // Check cache
  const cached = cache.get(state);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  }

  try {
    // Try state-level first (S + state code)
    let row = await fetchEIA(`S${state}`);
    let region = state;

    // Fall back to PADD region
    if (!row) {
      const padd = STATE_TO_PADD[state];
      if (padd) {
        row = await fetchEIA(padd);
        region = PADD_LABELS[padd] ?? padd;
      }
    }

    // Last resort: national average
    if (!row) {
      row = await fetchEIA("NUS");
      region = "U.S. Average";
    }

    if (!row) {
      return NextResponse.json({ error: "No price data available" }, { status: 404 });
    }

    const result = {
      state,
      price: parseFloat(row.value),
      date: row.period,
      region,
      fetchedAt: Date.now(),
    };

    cache.set(state, result);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch gas prices" }, { status: 500 });
  }
}
