import { NextResponse } from "next/server";

// OpenCorporates Company Search — aggregates Secretary of State data from all 50 US states
// Free tier: 500 req/month, no API key needed for basic searches
// Returns: legal name, status, incorporation date, officers, registered agent, jurisdiction

const OC_BASE = "https://api.opencorporates.com/v0.4";

interface OcCompany {
  name: string;
  company_number: string;
  jurisdiction_code: string;
  incorporation_date: string | null;
  dissolution_date: string | null;
  company_type: string | null;
  registry_url: string | null;
  current_status: string | null;
  registered_address_in_full: string | null;
  officers?: Array<{
    name: string;
    position: string;
    start_date: string | null;
    end_date: string | null;
    officer?: {
      name: string;
      position: string;
      start_date: string | null;
      end_date: string | null;
    };
  }>;
  corporate_groupings?: Array<{
    corporate_grouping: {
      name: string;
      opencorporates_url?: string | null;
    };
  }>;
  home_company?: {
    name: string;
    jurisdiction_code: string;
    company_number: string;
  } | null;
  source?: { url: string | null };
}

async function searchCompanies(companyName: string, jurisdiction?: string): Promise<OcCompany | null> {
  const url = new URL(`${OC_BASE}/companies/search`);
  url.searchParams.set("q", companyName);
  url.searchParams.set("country_code", "us");
  if (jurisdiction) {
    url.searchParams.set("jurisdiction_code", `us_${jurisdiction.toLowerCase()}`);
  }
  url.searchParams.set("per_page", "5");
  url.searchParams.set("order", "score");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const companies = data?.results?.companies;
  if (!companies || companies.length === 0) return null;

  // Return the top match
  return companies[0].company as OcCompany;
}

async function getCompanyDetails(jurisdictionCode: string, companyNumber: string): Promise<OcCompany | null> {
  const url = `${OC_BASE}/companies/${jurisdictionCode}/${companyNumber}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data?.results?.company as OcCompany ?? null;
}

export async function POST(request: Request) {
  try {
    const { companyName, jurisdiction } = await request.json();
    if (!companyName) {
      return NextResponse.json({ error: "Company name required" }, { status: 400 });
    }

    // Search for the company
    const match = await searchCompanies(companyName, jurisdiction);
    if (!match) {
      return NextResponse.json({
        data: null,
        source: "opencorporates",
        message: "No matching company found in state registrations",
      });
    }

    // Fetch full details (includes officers on the detail endpoint)
    const details = await getCompanyDetails(match.jurisdiction_code, match.company_number);
    const company = details || match;

    // Extract officers list (OC may wrap each entry in an "officer" key)
    const officers = (company.officers || []).map((raw) => {
      const o = raw.officer || raw;
      return {
        name: o.name,
        position: o.position,
        startDate: o.start_date,
        endDate: o.end_date,
      };
    });

    // Extract parent company from corporate groupings or home company
    const parentCompany =
      company.corporate_groupings?.[0]?.corporate_grouping?.name ||
      company.home_company?.name ||
      null;

    // Parse jurisdiction for display
    const jurisdictionParts = company.jurisdiction_code.split("_");
    const stateCode = jurisdictionParts.length > 1 ? jurisdictionParts[1].toUpperCase() : company.jurisdiction_code;

    const result = {
      legalName: company.name,
      companyNumber: company.company_number,
      jurisdiction: stateCode,
      jurisdictionCode: company.jurisdiction_code,
      status: company.current_status,
      incorporationDate: company.incorporation_date,
      dissolutionDate: company.dissolution_date,
      companyType: company.company_type,
      registeredAddress: company.registered_address_in_full,
      registryUrl: company.registry_url || company.source?.url || null,
      parentCompany,
      officers,
    };

    return NextResponse.json({ data: result, source: "opencorporates" });
  } catch (error) {
    return NextResponse.json({ data: null, source: "opencorporates", error: String(error) });
  }
}
