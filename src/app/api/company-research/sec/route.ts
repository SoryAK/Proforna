import { NextResponse } from "next/server";

// SEC EDGAR Company Search — fetches public company data by EIN or name
// Free, no API key required (rate-limited to 10 req/s)
// Must include User-Agent header per SEC policy

const SEC_USER_AGENT = "Resumsify/1.0 (personal career tracker)";

export async function POST(request: Request) {
  try {
    const { ein, companyName } = await request.json();
    if (!ein && !companyName) {
      return NextResponse.json({ error: "EIN or company name required" }, { status: 400 });
    }

    // SEC EDGAR full-text company search
    const query = ein ? ein.replace(/\D/g, "") : companyName;
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(query)}%22&dateRange=custom&category=form-type`;

    // Use the EDGAR company search API
    const searchUrl = new URL("https://efts.sec.gov/LATEST/search-index");
    searchUrl.searchParams.set("q", `"${query}"`);
    searchUrl.searchParams.set("dateRange", "custom");
    searchUrl.searchParams.set("startdt", "2020-01-01");

    // Try company tickers JSON first (more reliable for EIN lookup)
    const tickerRes = await fetch(
      "https://www.sec.gov/files/company_tickers.json",
      {
        headers: {
          "User-Agent": SEC_USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    let secData: {
      cik: string | null;
      ticker: string | null;
      companyName: string | null;
      filings: Array<Record<string, unknown>>;
      isPublic: boolean;
    } = {
      cik: null,
      ticker: null,
      companyName: null,
      filings: [],
      isPublic: false,
    };

    if (tickerRes.ok) {
      const tickers = await tickerRes.json();
      // Search by company name match if we have it
      if (companyName) {
        const needle = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const key of Object.keys(tickers)) {
          const entry = tickers[key];
          const name = String(entry.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (name.includes(needle) || needle.includes(name)) {
            secData = {
              cik: String(entry.cik_str).padStart(10, "0"),
              ticker: entry.ticker || null,
              companyName: entry.title || null,
              filings: [],
              isPublic: true,
            };
            break;
          }
        }
      }
    }

    // If we found a CIK, fetch recent filings
    if (secData.cik) {
      try {
        const filingsRes = await fetch(
          `https://data.sec.gov/submissions/CIK${secData.cik}.json`,
          {
            headers: {
              "User-Agent": SEC_USER_AGENT,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (filingsRes.ok) {
          const filingsData = await filingsRes.json();
          const recent = filingsData?.filings?.recent;
          if (recent) {
            const count = Math.min(recent.form?.length ?? 0, 5);
            for (let i = 0; i < count; i++) {
              secData.filings.push({
                form: recent.form[i],
                filingDate: recent.filingDate[i],
                primaryDocument: recent.primaryDocument[i],
              });
            }
          }
          // Enrich with additional company info
          if (filingsData.addresses?.business) {
            const biz = filingsData.addresses.business;
            secData = {
              ...secData,
              companyName: filingsData.name || secData.companyName,
            };
            (secData as Record<string, unknown>).address = [biz.street1, biz.street2, `${biz.city}, ${biz.stateOrCountry} ${biz.zipCode}`]
              .filter(Boolean)
              .join(", ");
            (secData as Record<string, unknown>).sic = filingsData.sic;
            (secData as Record<string, unknown>).sicDescription = filingsData.sicDescription;
            (secData as Record<string, unknown>).stateOfIncorporation = filingsData.stateOfIncorporation;
          }
        }
      } catch {
        // filings fetch failed, continue with basic data
      }
    }

    return NextResponse.json({
      data: secData.cik ? secData : null,
      source: "sec",
      message: secData.cik ? undefined : "Not found in SEC EDGAR — may be a private company",
    });
  } catch (error) {
    return NextResponse.json({ data: null, source: "sec", error: String(error) });
  }
}
