import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// Master Company Research API
// Orchestrates DOL, SEC, and OSHA lookups in parallel
// Caches results to CompanyProfile for future instant access

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { ein, companyName, legalName, location, forceRefresh } = await request.json();
    if (!ein && !companyName) {
      return NextResponse.json({ error: "EIN or company name required" }, { status: 400 });
    }

    const cleanEin = ein ? ein.replace(/\D/g, "") : null;

    // Check cache first (if EIN provided)
    if (cleanEin && !forceRefresh) {
      const cached = await prisma.companyProfile.findFirst({
        where: { userId, ein: cleanEin },
      });
      if (cached) {
        // Return cached if fetched within last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (cached.lastFetchedAt && cached.lastFetchedAt > thirtyDaysAgo) {
          return NextResponse.json({
            ...cached,
            form5500Data: cached.form5500Data ? JSON.parse(cached.form5500Data) : null,
            secData: cached.secData ? JSON.parse(cached.secData) : null,
            oshaData: cached.oshaData ? JSON.parse(cached.oshaData) : null,
            sosData: cached.sosData ? JSON.parse(cached.sosData) : null,
            kgData: cached.kgData ? JSON.parse(cached.kgData) : null,
            researchNotes: cached.researchNotes || null,
            _cached: true,
          });
        }
      }
    }

    // Build the base URL from the request
    const reqUrl = new URL(request.url);
    const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;

    // Prefer legalName (W-2/SEC filing name) for DOL/OSHA, fall back to companyName
    const searchName = legalName || companyName;

    // Fetch all sources in parallel
    const [dolResult, secResult, oshaResult, ocResult, kgResult] = await Promise.allSettled([
      fetch(`${baseUrl}/api/company-research/dol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ein: cleanEin, companyName: searchName }),
      }).then((r) => r.json()),
      fetch(`${baseUrl}/api/company-research/sec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      }).then((r) => r.json()),
      fetch(`${baseUrl}/api/company-research/osha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ein: cleanEin, companyName: searchName }),
      }).then((r) => r.json()),
      fetch(`${baseUrl}/api/company-research/opencorporates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: searchName || companyName, jurisdiction: location }),
      }).then((r) => r.json()),
      fetch(`${baseUrl}/api/company-research/knowledge-graph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      }).then((r) => r.json()),
    ]);

    const dol = dolResult.status === "fulfilled" ? dolResult.value : null;
    const sec = secResult.status === "fulfilled" ? secResult.value : null;
    const osha = oshaResult.status === "fulfilled" ? oshaResult.value : null;
    const oc = ocResult.status === "fulfilled" ? ocResult.value : null;
    const kg = kgResult.status === "fulfilled" ? kgResult.value : null;

    // Merge data into a unified profile
    const profile = {
      ein: cleanEin,
      name: sec?.data?.companyName || dol?.data?.summary?.sponsorName || companyName || null,
      address: oc?.data?.registeredAddress || null,
      industry: sec?.data?.sicDescription || null,
      naicsCode: null as string | null,
      website: kg?.data?.officialUrl || null,
      isPublic: sec?.data?.isPublic ?? false,
      secCIK: sec?.data?.cik || null,
      employeeCount: dol?.data?.summary?.estimatedEmployees || null,
      form5500Data: dol?.data ? JSON.stringify(dol.data) : null,
      secData: sec?.data ? JSON.stringify(sec.data) : null,
      oshaData: osha?.data ? JSON.stringify(osha.data) : null,
      sosData: oc?.data ? JSON.stringify(oc.data) : null,
      kgData: kg?.data ? JSON.stringify(kg.data) : null,
      lastFetchedAt: new Date(),
    };

    // Cache to CompanyProfile if we have an EIN
    if (cleanEin) {
      const existing = await prisma.companyProfile.findFirst({ where: { userId, ein: cleanEin } });
      await prisma.companyProfile.upsert({
        where: { userId_ein: { userId, ein: cleanEin } },
        create: { userId, ...profile, ein: cleanEin },
        update: {
          ...profile,
          // Don't overwrite name/address if we already have them and new data is null
          name: profile.name || undefined,
          address: profile.address || undefined,
          industry: profile.industry || undefined,
          // Never overwrite user's research notes during auto-refresh
          researchNotes: undefined,
        },
      });

      // Include existing notes in fresh response
      if (existing?.researchNotes) {
        return NextResponse.json({
          ...profile,
          form5500Data: dol?.data || null,
          secData: sec?.data || null,
          oshaData: osha?.data || null,
          sosData: oc?.data || null,
          kgData: kg?.data || null,
          researchNotes: existing.researchNotes,
          _cached: false,
          _sources: {
            dol: dol?.data ? "found" : dol?.error ? "error" : "not_found",
            sec: sec?.data ? "found" : sec?.error ? "error" : "not_found",
            osha: osha?.data ? "found" : osha?.error ? "error" : "not_found",
            opencorporates: oc?.data ? "found" : oc?.error ? "error" : "not_found",
            knowledge_graph: kg?.data ? "found" : kg?.error ? "error" : "not_found",
          },
        });
      }
    }

    return NextResponse.json({
      ...profile,
      form5500Data: dol?.data || null,
      secData: sec?.data || null,
      oshaData: osha?.data || null,
      sosData: oc?.data || null,
      kgData: kg?.data || null,
      researchNotes: null,
      _cached: false,
      _sources: {
        dol: dol?.data ? "found" : dol?.error ? "error" : "not_found",
        sec: sec?.data ? "found" : sec?.error ? "error" : "not_found",
        osha: osha?.data ? "found" : osha?.error ? "error" : "not_found",
        opencorporates: oc?.data ? "found" : oc?.error ? "error" : "not_found",
        knowledge_graph: kg?.data ? "found" : kg?.error ? "error" : "not_found",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH — Save research notes for a company profile
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { ein, researchNotes } = await request.json();
    if (!ein) {
      return NextResponse.json({ error: "EIN required" }, { status: 400 });
    }

    const cleanEin = ein.replace(/\D/g, "");

    const updated = await prisma.companyProfile.upsert({
      where: { userId_ein: { userId, ein: cleanEin } },
      create: { userId, ein: cleanEin, researchNotes },
      update: { researchNotes },
    });

    return NextResponse.json({ success: true, researchNotes: updated.researchNotes });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
