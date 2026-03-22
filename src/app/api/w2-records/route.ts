import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — all W-2 records, optionally filtered by yearId or ein
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const yearId = searchParams.get("yearId");
  const ein = searchParams.get("ein");

  const where: Record<string, unknown> = {};
  if (yearId) where.yearId = yearId;
  if (ein) where.employerEIN = ein.replace(/\D/g, "").replace(/^(\d{2})(\d{7})$/, "$1-$2");

  const records = await prisma.w2Record.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { taxYear: "desc" },
  });

  return NextResponse.json(records);
}

// POST — create a new W-2 record
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  if (!body.yearId || !body.taxYear) {
    return NextResponse.json(
      { error: "yearId and taxYear are required" },
      { status: 400 }
    );
  }

  const record = await prisma.w2Record.create({
    data: {
      yearId: body.yearId,
      taxYear: parseInt(body.taxYear),
      employerName: body.employerName ?? null,
      employerEIN: body.employerEIN ?? null,
      employerAddress: body.employerAddress ?? null,
      state: body.state ?? null,
      wages: body.wages != null ? parseFloat(body.wages) : null,
      federalTaxWithheld: body.federalTaxWithheld != null ? parseFloat(body.federalTaxWithheld) : null,
      socialSecurityWages: body.socialSecurityWages != null ? parseFloat(body.socialSecurityWages) : null,
      socialSecurityTax: body.socialSecurityTax != null ? parseFloat(body.socialSecurityTax) : null,
      medicareWages: body.medicareWages != null ? parseFloat(body.medicareWages) : null,
      medicareTax: body.medicareTax != null ? parseFloat(body.medicareTax) : null,
      stateWages: body.stateWages != null ? parseFloat(body.stateWages) : null,
      stateTaxWithheld: body.stateTaxWithheld != null ? parseFloat(body.stateTaxWithheld) : null,
      localWages: body.localWages != null ? parseFloat(body.localWages) : null,
      localTaxWithheld: body.localTaxWithheld != null ? parseFloat(body.localTaxWithheld) : null,
      netIncome: body.netIncome != null ? parseFloat(body.netIncome) : null,
      notes: body.notes ?? null,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
