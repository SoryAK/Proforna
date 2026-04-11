import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/** POST /api/work-history/:id/locations — add a sub-location */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const { label, type, address, lat, lng, isPrimary, placeId, skills, startDate, endDate } = body;

  if (!label || !address || lat == null || lng == null) {
    return NextResponse.json({ error: "label, address, lat, lng are required" }, { status: 400 });
  }

  const validTypes = ["daily-workplace", "main-office", "satellite", "remote", "client-site"];
  const locationType = validTypes.includes(type) ? type : "daily-workplace";

  // Validate skills is a JSON array of strings if provided
  let skillsJson: string | null = null;
  if (skills && Array.isArray(skills)) {
    skillsJson = JSON.stringify(skills.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 50));
  }

  const loc = await prisma.workHistoryLocation.create({
    data: {
      workHistoryId: id,
      label: String(label).slice(0, 200),
      type: locationType,
      address: String(address).slice(0, 500),
      lat: Number(lat),
      lng: Number(lng),
      placeId: placeId ? String(placeId) : null,
      isPrimary: isPrimary === true,
      skills: skillsJson,
      startDate: startDate ? String(startDate).slice(0, 7) : null,
      endDate: endDate ? String(endDate).slice(0, 7) : null,
    },
  });
  return NextResponse.json(loc, { status: 201 });
}
