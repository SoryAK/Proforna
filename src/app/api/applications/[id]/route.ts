import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET(
  _req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const application = await prisma.jobApplication.findFirst({
    where: { id , userId },
    include: { interviews: { orderBy: { scheduledAt: "asc" } } },
  });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(application);
}

export async function PATCH(
  req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await req.json();
  const old = await prisma.jobApplication.findFirst({ where: { id , userId } });
  const application = await prisma.jobApplication.update({ where: { id  }, data });

  let createdPositionId: string | null = null;

  if (old && old.status !== application.status) {
    await prisma.activityLog.create({
      data: { userId,
        entityType: "application",
        entityId: id,
        action: "status_changed",
        description: `${application.company} - ${application.role}: ${old.status} → ${application.status}`,
      },
    });

    // Auto-create CurrentPosition when status changes to "accepted"
    if (application.status === "accepted" && old.status !== "accepted") {
      const position = await prisma.currentPosition.create({
        data: {
          userId,
          company: application.company,
          role: application.role,
          location: application.location || null,
          type: application.type || "remote",
          startDate: application.offerStartDate ?? new Date(),
          salary: application.offerSalary || null,
          currency: application.currency || "USD",
          payType: application.offerPayType || "salary",
          payRate: application.offerPayRate || null,
          payFrequency: application.offerPayFrequency || "biweekly",
          hoursPerWeek: application.offerHoursPerWeek || null,
          otRate: application.offerOtRate || null,
          ein: application.ein || null,
          isActive: true,
        },
      });
      createdPositionId = position.id;

      // Auto-create benefits from offer data
      const benefitsToCreate: Prisma.BenefitCreateManyInput[] = [];

      if (application.offer401kMatch != null) {
        benefitsToCreate.push({
          positionId: position.id,
          category: "retirement",
          name: "401(k) Match",
          coverage: `${application.offer401kMatch}% employer match`,
        });
      }
      if (application.offerHealthCost != null) {
        benefitsToCreate.push({
          positionId: position.id,
          category: "health",
          name: "Health Insurance",
          employeeCost: Math.round(application.offerHealthCost),
        });
      }
      if (benefitsToCreate.length > 0) {
        await prisma.benefit.createMany({ data: benefitsToCreate });
      }

      // Auto-create time-off balance from offer PTO days
      if (application.offerPtoDays != null) {
        await prisma.timeOffBalance.create({
          data: {
            positionId: position.id,
            category: "pto",
            totalDays: application.offerPtoDays,
            usedDays: 0,
            year: new Date().getFullYear(),
            accrual: "annual",
          },
        });
      }

      // Auto-create compensation events from offer bonuses
      const compEvents: Prisma.CompensationEventCreateManyInput[] = [];
      const effectiveDate = application.offerStartDate ?? new Date();

      if (application.offerSigningBonus) {
        compEvents.push({
          positionId: position.id,
          type: "signing_bonus",
          title: "Signing Bonus",
          amount: application.offerSigningBonus,
          currency: application.currency || "USD",
          effectiveDate,
          recurring: false,
        });
      }
      if (application.offerAnnualBonus) {
        compEvents.push({
          positionId: position.id,
          type: "annual_bonus",
          title: "Annual Bonus",
          amount: application.offerAnnualBonus,
          currency: application.currency || "USD",
          effectiveDate,
          recurring: true,
        });
      }
      if (compEvents.length > 0) {
        await prisma.compensationEvent.createMany({ data: compEvents });
      }

      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "position",
          entityId: position.id,
          action: "created",
          description: `Auto-created position from accepted application: ${application.role} at ${application.company}`,
        },
      });
    }
  }
  return NextResponse.json({ ...application, createdPositionId });
}

export async function DELETE(
  _req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const app = await prisma.jobApplication.findFirst({ where: { id , userId } });
  await prisma.jobApplication.delete({ where: { id  } });
  if (app) {
    await prisma.activityLog.create({
      data: { userId,
        entityType: "application",
        entityId: id,
        action: "deleted",
        description: `Deleted application: ${app.role} at ${app.company}`,
      },
    });
  }
  return NextResponse.json({ success: true });
}
