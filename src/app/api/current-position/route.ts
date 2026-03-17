import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - fetch current active position(s)
export async function GET() {
  try {
    const positions = await prisma.currentPosition.findMany({
      orderBy: { startDate: "desc" },
    });
    return NextResponse.json(positions);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST - create a new current position
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const position = await prisma.currentPosition.create({
      data: {
        company: body.company,
        role: body.role,
        department: body.department || null,
        location: body.location || null,
        type: body.type || "remote",
        startDate: new Date(body.startDate),
        salary: body.salary || null,
        currency: body.currency || "USD",
        description: body.description || null,
        responsibilities: body.responsibilities || null,
        techStack: body.techStack || null,
        managerName: body.managerName || null,
        isActive: body.isActive ?? true,
        companySynopsis: body.companySynopsis || null,
        industry: body.industry || null,
        website: body.website || null,
        address: body.address || null,
        focus: body.focus || null,
        schedule: body.schedule || null,
        payRate: body.payRate || null,
        payType: body.payType || "salary",
        differentials: body.differentials || null,
        payFrequency: body.payFrequency || "biweekly",
        rotatingSchedule: body.rotatingSchedule ?? false,
        hoursPerWeek: body.hoursPerWeek != null ? parseFloat(body.hoursPerWeek) : null,
        scheduleBHours: body.scheduleBHours != null ? parseFloat(body.scheduleBHours) : null,
        otHoursA: body.otHoursA != null ? parseFloat(body.otHoursA) : null,
        otHoursB: body.otHoursB != null ? parseFloat(body.otHoursB) : null,
        otRate: body.otRate != null ? parseFloat(body.otRate) : null,
        estimatorSettings: body.estimatorSettings || null,
      },
    });

    await prisma.activityLog.create({
      data: {
        entityType: "position",
        entityId: position.id,
        action: "created",
        description: `Added current position: ${body.role} at ${body.company}`,
      },
    });

    return NextResponse.json(position, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
