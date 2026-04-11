import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

/** GET /api/reverse-geocode?lat=39.86&lng=-75.32 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!GOOGLE_KEY)
    return NextResponse.json({ error: "Google Maps API key not configured" }, { status: 503 });

  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");

  if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng)))
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  const address = data.results?.[0]?.formatted_address ?? null;
  return NextResponse.json({ address });
}
