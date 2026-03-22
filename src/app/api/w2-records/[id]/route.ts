import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// PUT — update a W-2 record
export async function PUT(
  request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  const record = await prisma.w2Record.update({
    where: { id },
    data: {
      taxYear: body.taxYear != null ? parseInt(body.taxYear) : undefined,
      employerName: body.employerName !== undefined ? body.employerName : undefined,
      employerEIN: body.employerEIN !== undefined ? body.employerEIN : undefined,
      employerAddress: body.employerAddress !== undefined ? body.employerAddress : undefined,
      state: body.state !== undefined ? body.state : undefined,
      wages: body.wages !== undefined ? (body.wages != null ? parseFloat(body.wages) : null) : undefined,
      federalTaxWithheld: body.federalTaxWithheld !== undefined ? (body.federalTaxWithheld != null ? parseFloat(body.federalTaxWithheld) : null) : undefined,
      socialSecurityWages: body.socialSecurityWages !== undefined ? (body.socialSecurityWages != null ? parseFloat(body.socialSecurityWages) : null) : undefined,
      socialSecurityTax: body.socialSecurityTax !== undefined ? (body.socialSecurityTax != null ? parseFloat(body.socialSecurityTax) : null) : undefined,
      medicareWages: body.medicareWages !== undefined ? (body.medicareWages != null ? parseFloat(body.medicareWages) : null) : undefined,
      medicareTax: body.medicareTax !== undefined ? (body.medicareTax != null ? parseFloat(body.medicareTax) : null) : undefined,
      stateWages: body.stateWages !== undefined ? (body.stateWages != null ? parseFloat(body.stateWages) : null) : undefined,
      stateTaxWithheld: body.stateTaxWithheld !== undefined ? (body.stateTaxWithheld != null ? parseFloat(body.stateTaxWithheld) : null) : undefined,
      localWages: body.localWages !== undefined ? (body.localWages != null ? parseFloat(body.localWages) : null) : undefined,
      localTaxWithheld: body.localTaxWithheld !== undefined ? (body.localTaxWithheld != null ? parseFloat(body.localTaxWithheld) : null) : undefined,
      netIncome: body.netIncome !== undefined ? (body.netIncome != null ? parseFloat(body.netIncome) : null) : undefined,
      notes: body.notes !== undefined ? body.notes : undefined,
    },
  });

  return NextResponse.json(record);
}

// DELETE — remove a W-2 record
export async function DELETE(
  _request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.w2Record.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
