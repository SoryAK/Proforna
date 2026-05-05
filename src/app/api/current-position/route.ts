import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/* ── field mapping helpers ──────────────────────────────────── */

// WorkHistory row → CurrentPosition-shaped response
function mapToPosition(wh: Record<string, unknown>) {
  const { title, salaryAmount, salaryCurrency, workMode, ...rest } = wh as Record<string, unknown>;
  return { ...rest, role: title, salary: salaryAmount, currency: salaryCurrency, type: workMode };
}

// Incoming CP-shaped body → WorkHistory field names
function mapFromBody(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  const rename: Record<string, string> = { role: "title", salary: "salaryAmount", currency: "salaryCurrency", type: "workMode" };
  for (const [k, v] of Object.entries(body)) {
    data[rename[k] ?? k] = v;
  }
  // startDate: accept Date/ISO string → store as "YYYY-MM"
  if (data.startDate) {
    const d = new Date(data.startDate as string);
    data.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (data.endDate) {
    const d = new Date(data.endDate as string);
    data.endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return data;
}

// GET - fetch positions (active by default)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const positions = await prisma.workHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(positions.map(mapToPosition));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST - create a new position (writes to WorkHistory)
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const mapped = mapFromBody(body);

    const position = await prisma.workHistory.create({
      data: {
        userId,
        company: (mapped.company as string) || "",
        title: (mapped.title as string) || "",
        department: (mapped.department as string) || null,
        location: (mapped.location as string) || null,
        address: (mapped.address as string) || (mapped.location as string) || "N/A",
        lat: mapped.lat != null ? Number(mapped.lat) : 0,
        lng: mapped.lng != null ? Number(mapped.lng) : 0,
        workMode: (mapped.workMode as string) || "remote",
        startDate: (mapped.startDate as string) || null,
        endDate: (mapped.endDate as string) || null,
        salaryAmount: mapped.salaryAmount != null ? Number(mapped.salaryAmount) : null,
        salaryCurrency: (mapped.salaryCurrency as string) || "USD",
        description: (mapped.description as string) || null,
        responsibilities: (mapped.responsibilities as string) || null,
        techStack: (mapped.techStack as string) || null,
        managerName: (mapped.managerName as string) || null,
        isActive: mapped.isActive != null ? Boolean(mapped.isActive) : true,
        ein: (mapped.ein as string) || null,
        legalName: (mapped.legalName as string) || null,
        companySynopsis: (mapped.companySynopsis as string) || null,
        companyClosed: mapped.companyClosed != null ? Boolean(mapped.companyClosed) : false,
        locationClosed: mapped.locationClosed != null ? Boolean(mapped.locationClosed) : false,
        industry: (mapped.industry as string) || null,
        website: (mapped.website as string) || null,
        focus: (mapped.focus as string) || null,
        schedule: (mapped.schedule as string) || null,
        payRate: (mapped.payRate as string) || null,
        payType: (mapped.payType as string) || "salary",
        differentials: (mapped.differentials as string) || null,
        payFrequency: (mapped.payFrequency as string) || "biweekly",
        rotatingSchedule: mapped.rotatingSchedule != null ? Boolean(mapped.rotatingSchedule) : false,
        hoursPerWeek: mapped.hoursPerWeek != null ? parseFloat(String(mapped.hoursPerWeek)) : null,
        scheduleBHours: mapped.scheduleBHours != null ? parseFloat(String(mapped.scheduleBHours)) : null,
        otHoursA: mapped.otHoursA != null ? parseFloat(String(mapped.otHoursA)) : null,
        otHoursB: mapped.otHoursB != null ? parseFloat(String(mapped.otHoursB)) : null,
        otRate: mapped.otRate != null ? parseFloat(String(mapped.otRate)) : null,
        annualRaiseMin: mapped.annualRaiseMin != null ? parseFloat(String(mapped.annualRaiseMin)) : null,
        annualRaiseMax: mapped.annualRaiseMax != null ? parseFloat(String(mapped.annualRaiseMax)) : null,
        estimatorSettings: (mapped.estimatorSettings as string) || null,
        coverImage: (mapped.coverImage as string) || null,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId,
        entityType: "position",
        entityId: position.id,
        action: "created",
        description: `Added current position: ${body.role ?? body.title} at ${body.company}`,
      },
    });

    return NextResponse.json(mapToPosition(position as unknown as Record<string, unknown>), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
