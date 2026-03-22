import { NextRequest, NextResponse } from "next/server";
import socCodes from "@/data/soc-codes.json";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/market-research/occupations?q=software
 * Search SOC occupation codes by keyword.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.toLowerCase() || "";
  if (!q || q.length < 2) {
    return NextResponse.json(socCodes.slice(0, 20));
  }

  const results = socCodes.filter(
    (occ) =>
      occ.title.toLowerCase().includes(q) ||
      occ.group.toLowerCase().includes(q) ||
      occ.code.includes(q)
  );

  return NextResponse.json(results.slice(0, 30));
}
