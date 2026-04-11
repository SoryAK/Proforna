import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

/** Reverse-geocode lat/lng to get a Google Place ID */
async function reverseGeocodeForPlaceId(lat: number, lng: number): Promise<string | null> {
  if (!GOOGLE_KEY) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", GOOGLE_KEY);

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.place_id ?? null;
  } catch {
    return null;
  }
}

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stats = { lifeAnchors: 0, workHistory: 0, workHistoryLocations: 0, errors: 0 };

  // 1. Life anchors with null placeId
  const anchors = await prisma.lifeAnchor.findMany({
    where: { userId, placeId: null },
    select: { id: true, lat: true, lng: true },
  });

  for (const a of anchors) {
    const placeId = await reverseGeocodeForPlaceId(a.lat, a.lng);
    if (placeId) {
      await prisma.lifeAnchor.update({ where: { id: a.id }, data: { placeId } });
      stats.lifeAnchors++;
    } else {
      stats.errors++;
    }
  }

  // 2. Work history entries with null placeId
  const entries = await prisma.workHistory.findMany({
    where: { userId, placeId: null },
    select: { id: true, lat: true, lng: true },
  });

  for (const e of entries) {
    const placeId = await reverseGeocodeForPlaceId(e.lat, e.lng);
    if (placeId) {
      await prisma.workHistory.update({ where: { id: e.id }, data: { placeId } });
      stats.workHistory++;
    } else {
      stats.errors++;
    }
  }

  // 3. Work history sub-locations with null placeId
  const locations = await prisma.workHistoryLocation.findMany({
    where: { workHistory: { userId }, placeId: null },
    select: { id: true, lat: true, lng: true },
  });

  for (const loc of locations) {
    const placeId = await reverseGeocodeForPlaceId(loc.lat, loc.lng);
    if (placeId) {
      await prisma.workHistoryLocation.update({ where: { id: loc.id }, data: { placeId } });
      stats.workHistoryLocations++;
    } else {
      stats.errors++;
    }
  }

  return NextResponse.json({
    message: "Backfill complete",
    updated: stats,
    total: stats.lifeAnchors + stats.workHistory + stats.workHistoryLocations,
  });
}
