import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - fetch profile (auto-create default if none exists)
export async function GET() {
  try {
    let profile = await prisma.userProfile.findFirst();
    if (!profile) {
      profile = await prisma.userProfile.create({ data: {} });
    }
    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH - update profile settings
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    let profile = await prisma.userProfile.findFirst();
    if (!profile) {
      profile = await prisma.userProfile.create({ data: {} });
    }
    const updated = await prisma.userProfile.update({
      where: { id: profile.id },
      data: body,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
