import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/extract-location
 *   { description: "...", company: "..." }
 *   → { locations: ["King of Prussia, PA", "Malvern, PA"], confidence: "medium" }
 *
 * Uses regex NLP patterns to find real office locations from job descriptions.
 */

/** Common location-indicating patterns ordered by confidence */
const LOCATION_PATTERNS: { re: RegExp; confidence: "high" | "medium" }[] = [
  // "office in King of Prussia, PA"
  { re: /(?:office|headquarter(?:s|ed)?|located|based|position)\s+(?:is\s+)?(?:in|at)\s+([A-Z][-a-zA-Z\s.']+,\s*[A-Z]{2}(?:\s+\d{5})?)/gi, confidence: "high" },
  // "onsite in Malvern, PA"
  { re: /(?:on-?site|in-?person|in-?office|hybrid)\s+(?:in|at|near)\s+([A-Z][-a-zA-Z\s.']+,\s*[A-Z]{2}(?:\s+\d{5})?)/gi, confidence: "high" },
  // "work from our Dallas, TX facility"
  { re: /(?:our|the|client(?:'?s)?)\s+([A-Z][-a-zA-Z\s.']+,\s*[A-Z]{2})\s+(?:office|facility|campus|location|site|headquarters)/gi, confidence: "high" },
  // "report to 123 Main St, Suite 200, Philadelphia, PA 19103"
  { re: /(?:report\s+to|work\s+at|located\s+at)\s+([\d]+[^,]+,\s*(?:[^,]+,\s*)?[A-Z][-a-zA-Z\s.']+,\s*[A-Z]{2}(?:\s+\d{5})?)/gi, confidence: "high" },
  // "Philadelphia, PA area" or "Greater Philadelphia area"
  { re: /(?:greater\s+)?([A-Z][-a-zA-Z\s.']+,\s*[A-Z]{2})\s+(?:area|metro|region)/gi, confidence: "medium" },
  // "City, ST" near work-related context words
  { re: /(?:location|site|address)[:\s]+([A-Z][-a-zA-Z\s.']+,\s*[A-Z]{2}(?:\s+\d{5})?)/gi, confidence: "medium" },
];

/** State abbreviation set for validation */
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

function isValidState(s: string): boolean {
  return US_STATES.has(s.trim().toUpperCase());
}

/** Extract the state abbreviation from a "City, ST" or "City, ST 12345" string */
function extractState(loc: string): string | null {
  const m = loc.match(/,\s*([A-Z]{2})(?:\s+\d{5})?$/i);
  return m ? m[1].toUpperCase() : null;
}

export async function POST(req: NextRequest) {
  const { description, company } = await req.json();
  if (!description) return NextResponse.json({ locations: [], confidence: "none" });

  const text: string = description;
  const seen = new Set<string>();
  const results: { location: string; confidence: "high" | "medium" }[] = [];

  for (const { re, confidence } of LOCATION_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const raw = match[1].trim().replace(/[.]+$/, "");
      const state = extractState(raw);
      if (!state || !isValidState(state)) continue;

      const norm = raw.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);

      // Skip if location is basically the company name (recruiter's own address text)
      if (company) {
        const compLower = company.toLowerCase().replace(/[^a-z0-9]/g, "");
        const locLower = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (locLower.includes(compLower) || compLower.includes(locLower)) continue;
      }

      results.push({ location: raw, confidence });
    }
  }

  const bestConfidence = results.some((r) => r.confidence === "high")
    ? "high"
    : results.length > 0
      ? "medium"
      : "none";

  return NextResponse.json({
    locations: results.map((r) => r.location),
    confidence: bestConfidence,
  });
}
