import { NextResponse } from "next/server";

// Lightweight SEC EDGAR check — determines if company is publicly traded
// Uses EDGAR company search (~5-20KB) instead of downloading 7MB company_tickers.json
// Returns: isPublic, ticker, CIK, basic company info

const SEC_USER_AGENT = "Resumsify/1.0 (personal career tracker)";

async function checkPublicStatus(companyName: string) {
  // Search SEC EDGAR for companies filing 10-K (annual report = publicly traded)
  const url = new URL("https://www.sec.gov/cgi-bin/browse-edgar");
  url.searchParams.set("company", companyName);
  url.searchParams.set("CIK", "");
  url.searchParams.set("type", "10-K");
  url.searchParams.set("dateb", "");
  url.searchParams.set("owner", "include");
  url.searchParams.set("count", "5");
  url.searchParams.set("search_text", "");
  url.searchParams.set("action", "getcompany");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": SEC_USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return null;

  const html = (await res.text()).slice(0, 50_000);

  // No results
  if (html.toLowerCase().includes("no matching")) return null;

  // Extract CIK from the results page
  const cikMatch = html.match(/CIK=(\d+)/);
  if (!cikMatch) return null;

  const cik = cikMatch[1].padStart(10, "0");

  // Fetch company details from CIK submissions endpoint (~50-200KB)
  try {
    const detailRes = await fetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      {
        headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!detailRes.ok) {
      return { cik, isPublic: true, ticker: null, companyName: null, sicDescription: null, stateOfIncorporation: null };
    }

    const detail = await detailRes.json();

    // Verify the match is for our company (EDGAR search can be fuzzy)
    const secName = (detail.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const needle = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (secName && needle && !secName.includes(needle) && !needle.includes(secName)) {
      return null; // Name mismatch — probably wrong company
    }

    return {
      cik,
      isPublic: true,
      ticker: detail.tickers?.[0] || null,
      companyName: detail.name || null,
      sicDescription: detail.sicDescription || null,
      stateOfIncorporation: detail.stateOfIncorporation || null,
    };
  } catch {
    return { cik, isPublic: true, ticker: null, companyName: null, sicDescription: null, stateOfIncorporation: null };
  }
}

export async function POST(request: Request) {
  try {
    const { companyName } = await request.json();
    if (!companyName) {
      return NextResponse.json({ error: "Company name required" }, { status: 400 });
    }

    const result = await checkPublicStatus(companyName);

    return NextResponse.json({
      data: result || { isPublic: false, ticker: null, cik: null, companyName: null, sicDescription: null, stateOfIncorporation: null },
      source: "sec",
    });
  } catch (error) {
    return NextResponse.json({
      data: { isPublic: false, ticker: null, cik: null, companyName: null, sicDescription: null, stateOfIncorporation: null },
      source: "sec",
      error: String(error),
    });
  }
}
