import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

const USAJOBS_BASE = "https://data.usajobs.gov/api/search";

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface USAJobsPosition {
  PositionID: string;
  PositionTitle: string;
  PositionURI: string;
  PositionLocation: Array<{
    LocationName: string;
    Latitude: number;
    Longitude: number;
    CityName: string;
    CountrySubDivisionCode: string;
  }>;
  OrganizationName: string;
  DepartmentName: string;
  JobCategory: Array<{ Name: string; Code: string }>;
  PositionRemuneration: Array<{
    MinimumRange: string;
    MaximumRange: string;
    RateIntervalCode: string;
  }>;
  PositionStartDate: string;
  PositionEndDate: string;
  PublicationStartDate: string;
  QualificationSummary: string;
  PositionOfferingType: Array<{ Name: string; Code: string }>;
  PositionSchedule: Array<{ Name: string; Code: string }>;
  ApplyURI: string[];
}

interface USAJobsResult {
  MatchedObjectId: string;
  MatchedObjectDescriptor: USAJobsPosition;
}

/**
 * GET /api/usajobs?q=software+developer&location=New+York&page=1
 *
 * Proxy to USAJobs Search API with geocoded results.
 * Requires USAJOBS_API_KEY and USAJOBS_EMAIL env vars.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.USAJOBS_API_KEY;
  const email = process.env.USAJOBS_EMAIL;
  if (!apiKey || !email) {
    return NextResponse.json({ error: "USAJobs API credentials not configured" }, { status: 500 });
  }

  const sp = req.nextUrl.searchParams;
  const keyword = sp.get("q") ?? "";
  const location = sp.get("location") ?? "";
  const radius = sp.get("radius") ?? "";
  const page = sp.get("page") ?? "1";
  const resultsPerPage = "50";
  const centerLat = parseFloat(sp.get("lat") ?? "");
  const centerLng = parseFloat(sp.get("lng") ?? "");
  const maxMiles = Math.min(parseInt(radius, 10) || 50, 200);

  if (!keyword) {
    return NextResponse.json({ error: "q (keyword) parameter required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    Keyword: keyword,
    ResultsPerPage: resultsPerPage,
    Page: page,
  });
  if (location) {
    params.set("LocationName", location);
    params.set("Radius", String(maxMiles));
  }

  try {
    const res = await fetch(`${USAJOBS_BASE}?${params}`, {
      headers: {
        "Authorization-Key": apiKey,
        "User-Agent": email,
        Host: "data.usajobs.gov",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `USAJobs API returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const results: USAJobsResult[] =
      data?.SearchResult?.SearchResultItems ?? [];
    const totalCount: number =
      data?.SearchResult?.SearchResultCount ?? 0;

    const jobs = results.flatMap((item) => {
      const pos = item.MatchedObjectDescriptor;
      const validLocs = (pos.PositionLocation ?? []).filter(
        (loc) => loc.Latitude && loc.Longitude
      );
      if (validLocs.length === 0) return [];

      const remun = pos.PositionRemuneration?.[0];
      let salaryMin: number | null = null;
      let salaryMax: number | null = null;

      if (remun) {
        salaryMin = parseFloat(remun.MinimumRange) || null;
        salaryMax = parseFloat(remun.MaximumRange) || null;
        if (remun.RateIntervalCode === "PH" || remun.RateIntervalCode === "Per Hour") {
          if (salaryMin) salaryMin = Math.round(salaryMin * 2080);
          if (salaryMax) salaryMax = Math.round(salaryMax * 2080);
        }
      }

      const schedule = pos.PositionSchedule?.[0]?.Name ?? null;
      const offering = pos.PositionOfferingType?.[0]?.Name ?? null;

      // Pick the duty station closest to search center as the primary pin
      let primary = validLocs[0];
      if (hasCenter) {
        primary = validLocs.reduce((best, loc) => {
          const d = haversine(centerLat, centerLng, loc.Latitude, loc.Longitude);
          const bestD = haversine(centerLat, centerLng, best.Latitude, best.Longitude);
          return d < bestD ? loc : best;
        }, validLocs[0]);
      }

      // All other duty stations as metadata
      const otherStations = validLocs
        .filter((loc) => loc !== primary)
        .map((loc) => ({
          location: loc.LocationName,
          city: loc.CityName,
          state: loc.CountrySubDivisionCode,
          lat: loc.Latitude,
          lng: loc.Longitude,
        }));

      return [{
        id: `usajobs-${pos.PositionID}`,
        title: pos.PositionTitle,
        company: pos.OrganizationName || pos.DepartmentName,
        location: primary.LocationName,
        area: [primary.CityName, primary.CountrySubDivisionCode].filter(Boolean),
        lat: primary.Latitude,
        lng: primary.Longitude,
        url: pos.ApplyURI?.[0] ?? pos.PositionURI ?? "",
        salaryMin,
        salaryMax,
        salaryPredicted: false,
        contractTime: offering?.toLowerCase().includes("permanent")
          ? "permanent"
          : offering?.toLowerCase().includes("temp")
            ? "temporary"
            : null,
        contractType: null,
        created: pos.PublicationStartDate,
        category: pos.JobCategory?.[0]?.Name ?? "",
        description: pos.QualificationSummary ?? "",
        source: "usajobs" as const,
        scheduleType: schedule,
        dutyStations: otherStations.length > 0 ? otherStations : undefined,
      }];
    });

    // Post-fetch geo-filter: keep only duty stations within radius of search center
    const hasCenter = !isNaN(centerLat) && !isNaN(centerLng);
    const filtered = hasCenter
      ? jobs.filter((j) => haversine(centerLat, centerLng, j.lat, j.lng) <= maxMiles)
      : jobs;

    // Sort: jobs with search term in title come first
    const kw = keyword.toLowerCase().split(/\s+/).filter(Boolean);
    filtered.sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      const aMatch = kw.some((w) => aTitle.includes(w)) ? 0 : 1;
      const bMatch = kw.some((w) => bTitle.includes(w)) ? 0 : 1;
      return aMatch - bMatch;
    });

    return NextResponse.json({
      jobs: filtered,
      total: totalCount,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to fetch USAJobs data",
        detail: e instanceof Error ? e.message : "Unknown",
      },
      { status: 502 }
    );
  }
}
