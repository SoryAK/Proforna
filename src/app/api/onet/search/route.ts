import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { searchOccupations } from "@/lib/onet";

/**
 * GET /api/onet/search?keyword=software+developer&limit=20
 *
 * Proxy to O*NET keyword search. Returns matching occupations
 * with code, title, and bright_outlook flag.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keyword = req.nextUrl.searchParams.get("keyword") ?? "";
  if (!keyword.trim())
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });

  const limit = Math.min(
    50,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20),
  );

  const results = await searchOccupations(keyword.trim(), limit);

  return NextResponse.json({
    keyword,
    count: results.length,
    occupations: results.map((o) => ({
      code: o.code,
      title: o.title,
      brightOutlook: o.tags?.bright_outlook ?? false,
    })),
  });
}
