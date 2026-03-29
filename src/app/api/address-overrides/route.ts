import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/address-overrides?jobKeys=abc,def
 *   → { overrides: { "abc": { address, lat, lng, landmarkName, source }, ... } }
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ overrides: {} });

  const raw = new URL(req.url).searchParams.get("jobKeys") ?? "";
  const keys = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (keys.length === 0) return NextResponse.json({ overrides: {} });

  const rows = await prisma.addressOverride.findMany({
    where: { userId, jobKey: { in: keys } },
  });

  const overrides: Record<string, { address: string; lat: number; lng: number; landmarkName: string | null; source: string }> = {};
  for (const r of rows) {
    overrides[r.jobKey] = {
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      landmarkName: r.landmarkName,
      source: r.source,
    };
  }

  return NextResponse.json({ overrides });
}

/**
 * POST /api/address-overrides
 *   { jobKey, address, lat, lng, landmarkName?, source? }
 *   → upserts the override for the current user
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { jobKey, address, lat, lng, landmarkName, source } = body;
  if (!jobKey || !address || lat == null || lng == null) {
    return NextResponse.json({ error: "jobKey, address, lat, lng required" }, { status: 400 });
  }

  const override = await prisma.addressOverride.upsert({
    where: { userId_jobKey: { userId, jobKey } },
    create: { userId, jobKey, address, lat, lng, landmarkName: landmarkName ?? null, source: source ?? "manual" },
    update: { address, lat, lng, landmarkName: landmarkName ?? null, source: source ?? "manual" },
  });

  return NextResponse.json({ override });
}

/**
 * DELETE /api/address-overrides?jobKey=abc
 *   → removes the override
 */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobKey = new URL(req.url).searchParams.get("jobKey") ?? "";
  if (!jobKey) return NextResponse.json({ error: "jobKey required" }, { status: 400 });

  await prisma.addressOverride.deleteMany({ where: { userId, jobKey: jobKey } });
  return NextResponse.json({ deleted: true });
}
