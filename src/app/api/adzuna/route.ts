import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { cached, TTL } from "@/lib/cache";

const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;
const BASE = "https://api.adzuna.com/v1/api/jobs/us/search";

interface AdzunaResult {
  id: string;
  title: string;
  description: string;
  company: { display_name: string };
  location: { display_name: string; area: string[] };
  latitude: number;
  longitude: number;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  contract_time?: string;
  contract_type?: string;
  created: string;
  category: { label: string; tag: string };
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!APP_ID || !APP_KEY)
    return NextResponse.json(
      { error: "Adzuna credentials not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to .env" },
      { status: 503 }
    );

  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q") || "";
  const where = searchParams.get("where") || "";
  const page = searchParams.get("page") || "1";
  const distance = searchParams.get("distance") || "30"; // miles

  if (!query.trim() && !where.trim())
    return NextResponse.json(
      { error: "Provide a search query (q) or location (where)" },
      { status: 400 }
    );

  const cacheKey = `adzuna:${query}:${where}:${page}:${distance}`;

  try {
    const result = await cached(cacheKey, TTL.ADZUNA, async () => {
      const url = new URL(`${BASE}/${page}`);
      url.searchParams.set("app_id", APP_ID);
      url.searchParams.set("app_key", APP_KEY);
      url.searchParams.set("results_per_page", "50");
      if (query.trim()) url.searchParams.set("what", query.trim());
      if (where.trim()) url.searchParams.set("where", where.trim());
      url.searchParams.set("distance", distance);
      url.searchParams.set("content-type", "application/json");

      const res = await fetch(url.toString());
      if (!res.ok) {
        const text = await res.text();
        throw { status: res.status, error: "Adzuna request failed", details: text };
      }

      const data = await res.json();

      const jobs = ((data.results ?? []) as AdzunaResult[]).map((r) => ({
        id: String(r.id),
        title: r.title,
        company: r.company?.display_name ?? "Unknown",
        location: r.location?.display_name ?? "",
        area: r.location?.area ?? [],
        lat: r.latitude,
        lng: r.longitude,
        url: r.redirect_url,
        salaryMin: r.salary_min ?? null,
        salaryMax: r.salary_max ?? null,
        salaryPredicted: r.salary_is_predicted === "1",
        contractTime: r.contract_time ?? null,
        contractType: r.contract_type ?? null,
        created: r.created,
        category: r.category?.label ?? "",
        description: r.description ?? "",
      }));

      return {
        jobs,
        total: data.count ?? 0,
        mean: data.mean ?? null,
        page: Number(page),
        hasMore: jobs.length === 50,
      };
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; error?: string; details?: string };
    return NextResponse.json(
      { error: e.error ?? "Adzuna request failed", details: e.details },
      { status: e.status ?? 500 }
    );
  }
}
