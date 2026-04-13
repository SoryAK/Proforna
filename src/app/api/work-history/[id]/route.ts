import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { syncWorkHistoryToPosition } from "@/lib/position-sync";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.company != null) data.company = String(body.company).slice(0, 200);
  if (body.title !== undefined) data.title = body.title ? String(body.title).slice(0, 200) : null;
  if (body.address != null) data.address = String(body.address).slice(0, 500);
  if (body.lat != null) data.lat = Number(body.lat);
  if (body.lng != null) data.lng = Number(body.lng);
  if (body.startDate !== undefined) data.startDate = body.startDate ? String(body.startDate).slice(0, 7) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? String(body.endDate).slice(0, 7) : null;
  if (body.placeId !== undefined) data.placeId = body.placeId ? String(body.placeId) : null;

  // Type & Education
  if (body.type !== undefined) data.type = body.type ? String(body.type).slice(0, 20) : "job";
  if (body.degree !== undefined) data.degree = body.degree ? String(body.degree).slice(0, 100) : null;
  if (body.major !== undefined) data.major = body.major ? String(body.major).slice(0, 200) : null;
  if (body.gpa !== undefined) data.gpa = body.gpa != null ? Number(body.gpa) : null;

  // Compensation
  if (body.salaryAmount !== undefined) data.salaryAmount = body.salaryAmount != null ? Number(body.salaryAmount) : null;
  if (body.salaryType !== undefined) data.salaryType = body.salaryType ? String(body.salaryType).slice(0, 20) : null;
  if (body.salaryCurrency !== undefined) data.salaryCurrency = body.salaryCurrency ? String(body.salaryCurrency).slice(0, 10) : null;
  if (body.bonusAmount !== undefined) data.bonusAmount = body.bonusAmount != null ? Number(body.bonusAmount) : null;
  if (body.equityNotes !== undefined) data.equityNotes = body.equityNotes ? String(body.equityNotes).slice(0, 500) : null;

  // Schedule
  if (body.workMode !== undefined) data.workMode = body.workMode ? String(body.workMode).slice(0, 20) : null;
  if (body.hybridDays !== undefined) data.hybridDays = body.hybridDays != null ? Number(body.hybridDays) : null;
  if (body.scheduleType !== undefined) data.scheduleType = body.scheduleType ? String(body.scheduleType).slice(0, 20) : null;
  if (body.hoursPerWeek !== undefined) data.hoursPerWeek = body.hoursPerWeek != null ? Number(body.hoursPerWeek) : null;
  if (body.shiftNotes !== undefined) data.shiftNotes = body.shiftNotes ? String(body.shiftNotes).slice(0, 500) : null;

  // Benefits & PTO
  if (body.benefits !== undefined) data.benefits = body.benefits ? String(body.benefits).slice(0, 2000) : null;
  if (body.ptoDaysOffered !== undefined) data.ptoDaysOffered = body.ptoDaysOffered != null ? Number(body.ptoDaysOffered) : null;
  if (body.ptoDaysUsed !== undefined) data.ptoDaysUsed = body.ptoDaysUsed != null ? Number(body.ptoDaysUsed) : null;
  if (body.ptoNotes !== undefined) data.ptoNotes = body.ptoNotes ? String(body.ptoNotes).slice(0, 500) : null;

  // Work Environment
  if (body.companySize !== undefined) data.companySize = body.companySize ? String(body.companySize).slice(0, 20) : null;
  if (body.department !== undefined) data.department = body.department ? String(body.department).slice(0, 200) : null;
  if (body.teamSize !== undefined) data.teamSize = body.teamSize != null ? Number(body.teamSize) : null;
  if (body.managerName !== undefined) data.managerName = body.managerName ? String(body.managerName).slice(0, 200) : null;

  // Skills & Growth
  if (body.skillsUsed !== undefined) data.skillsUsed = body.skillsUsed ? String(body.skillsUsed).slice(0, 2000) : null;
  if (body.skillsGained !== undefined) data.skillsGained = body.skillsGained ? String(body.skillsGained).slice(0, 2000) : null;
  if (body.promotions !== undefined) data.promotions = body.promotions ? String(body.promotions).slice(0, 2000) : null;

  // Departure & Reflection
  if (body.reasonForLeaving !== undefined) data.reasonForLeaving = body.reasonForLeaving ? String(body.reasonForLeaving).slice(0, 50) : null;
  if (body.wouldReturn !== undefined) data.wouldReturn = body.wouldReturn ? String(body.wouldReturn).slice(0, 10) : null;
  if (body.accomplishments !== undefined) data.accomplishments = body.accomplishments ? String(body.accomplishments).slice(0, 2000) : null;

  // Commute
  if (body.commuteMinutes !== undefined) data.commuteMinutes = body.commuteMinutes != null ? Number(body.commuteMinutes) : null;
  if (body.commuteDistance !== undefined) data.commuteDistance = body.commuteDistance != null ? Number(body.commuteDistance) : null;
  if (body.commuteMode !== undefined) data.commuteMode = body.commuteMode ? String(body.commuteMode).slice(0, 20) : null;

  const updated = await prisma.workHistory.update({ where: { id }, data });

  // Best-effort sync overlapping fields to the matching CurrentPosition
  syncWorkHistoryToPosition(userId, updated.company, data);

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.workHistory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
