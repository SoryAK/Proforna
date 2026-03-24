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

  const q = req.nextUrl.searchParams.get("q")?.toLowerCase().trim() || "";
  if (!q || q.length < 2) {
    return NextResponse.json(socCodes.slice(0, 20));
  }

  // Split query into words so "robotics engineer" matches titles containing any word
  const words = q.split(/\s+/).filter((w) => w.length >= 2);

  const results = socCodes
    .map((occ) => {
      const title = occ.title.toLowerCase();
      const group = occ.group.toLowerCase();
      const code = occ.code.toLowerCase();
      // Count how many query words match
      const matches = words.filter(
        (w) => title.includes(w) || group.includes(w) || code.includes(w)
      ).length;
      return { occ, matches };
    })
    .filter((r) => r.matches > 0)
    .sort((a, b) => b.matches - a.matches) // best matches first
    .map((r) => r.occ);

  return NextResponse.json(results.slice(0, 30));
}
