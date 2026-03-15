import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - list all submissions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where = status ? { status } : {};
    const submissions = await prisma.recruiterSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(submissions);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
