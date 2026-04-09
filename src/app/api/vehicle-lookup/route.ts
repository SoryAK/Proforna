import { NextRequest, NextResponse } from "next/server";

const BASE = "https://www.fueleconomy.gov/ws/rest";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");
  const year = searchParams.get("year");
  const make = searchParams.get("make");
  const model = searchParams.get("model");
  const id = searchParams.get("id");

  let url: string;

  switch (action) {
    case "years":
      url = `${BASE}/vehicle/menu/year`;
      break;
    case "makes":
      if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
      url = `${BASE}/vehicle/menu/make?year=${encodeURIComponent(year)}`;
      break;
    case "models":
      if (!year || !make) return NextResponse.json({ error: "year and make required" }, { status: 400 });
      url = `${BASE}/vehicle/menu/model?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}`;
      break;
    case "options":
      if (!year || !make || !model)
        return NextResponse.json({ error: "year, make, model required" }, { status: 400 });
      url = `${BASE}/vehicle/menu/options?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`;
      break;
    case "vehicle":
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      // Validate id is numeric
      if (!/^\d+$/.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
      url = `${BASE}/vehicle/${id}`;
      break;
    case "fuelprices":
      url = `${BASE}/fuelprices`;
      break;
    default:
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 }, // cache 24h
    });
    if (!res.ok) return NextResponse.json({ error: "upstream error" }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
