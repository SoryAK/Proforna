import { NextResponse } from "next/server";
import { getMicrosoftAuthUrl } from "@/lib/email";

export async function GET() {
  const url = getMicrosoftAuthUrl();
  return NextResponse.redirect(url);
}
