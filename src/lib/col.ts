/**
 * Cost of Living index — based on BEA Regional Price Parities (RPP).
 * National average = 100. Higher = more expensive.
 *
 * State-level values are approximate 2024 RPP indices.
 * Metro overrides use city name substring matching for major metros.
 */

/* ── State-level COL (RPP, goods + services + rent) ── */
const STATE_COL: Record<string, number> = {
  AL: 87.0, AK: 106.0, AZ: 97.3, AR: 86.0, CA: 113.4,
  CO: 105.2, CT: 109.5, DE: 101.0, FL: 100.8, GA: 93.0,
  HI: 119.2, ID: 95.5, IL: 97.3, IN: 90.5, IA: 89.0,
  KS: 89.5, KY: 88.0, LA: 89.5, ME: 98.0, MD: 109.0,
  MA: 110.5, MI: 92.0, MN: 97.5, MS: 83.5, MO: 88.5,
  MT: 95.0, NE: 90.5, NV: 98.0, NH: 106.5, NJ: 113.5,
  NM: 92.0, NY: 115.5, NC: 92.0, ND: 90.0, OH: 90.0,
  OK: 87.0, OR: 101.5, PA: 97.0, RI: 99.5, SC: 90.5,
  SD: 90.0, TN: 90.0, TX: 93.5, UT: 98.5, VT: 100.0,
  VA: 103.0, WA: 107.5, WV: 84.5, WI: 93.0, WY: 93.5,
  DC: 117.0,
};

/* ── Metro-area overrides (city substring → COL index) ── */
// Ordered by specificity — first match wins
const METRO_COL: { match: string; col: number }[] = [
  // Extremely high
  { match: "San Francisco", col: 127.0 },
  { match: "San Jose", col: 125.0 },
  { match: "Manhattan", col: 135.0 },
  { match: "Brooklyn", col: 128.0 },
  { match: "Honolulu", col: 122.0 },
  // Very high
  { match: "New York", col: 128.0 },
  { match: "Los Angeles", col: 116.0 },
  { match: "San Diego", col: 114.5 },
  { match: "Seattle", col: 115.0 },
  { match: "Boston", col: 114.0 },
  { match: "Washington", col: 117.0 },
  { match: "Miami", col: 110.0 },
  // Above average
  { match: "Denver", col: 106.5 },
  { match: "Portland", col: 104.5 },
  { match: "Austin", col: 101.0 },
  { match: "Chicago", col: 102.0 },
  { match: "Philadelphia", col: 102.5 },
  { match: "Minneapolis", col: 100.5 },
  { match: "Hartford", col: 104.0 },
  { match: "Baltimore", col: 105.0 },
  { match: "Sacramento", col: 108.0 },
  { match: "Stamford", col: 115.0 },
  // Average
  { match: "Nashville", col: 96.0 },
  { match: "Raleigh", col: 96.0 },
  { match: "Charlotte", col: 94.0 },
  { match: "Atlanta", col: 96.5 },
  { match: "Dallas", col: 97.0 },
  { match: "Houston", col: 95.5 },
  { match: "Phoenix", col: 98.5 },
  { match: "Las Vegas", col: 99.0 },
  { match: "Salt Lake", col: 100.0 },
  { match: "Tampa", col: 97.0 },
  { match: "Orlando", col: 97.5 },
  // Below average
  { match: "Pittsburgh", col: 92.0 },
  { match: "Columbus", col: 91.0 },
  { match: "Cincinnati", col: 90.0 },
  { match: "Indianapolis", col: 90.5 },
  { match: "Kansas City", col: 91.5 },
  { match: "St. Louis", col: 89.5 },
  { match: "Detroit", col: 90.5 },
  { match: "Cleveland", col: 89.0 },
  { match: "San Antonio", col: 90.5 },
  { match: "Memphis", col: 86.5 },
  { match: "Louisville", col: 89.5 },
  { match: "Birmingham", col: 86.0 },
  { match: "Oklahoma City", col: 87.5 },
  { match: "Little Rock", col: 85.5 },
  { match: "Jackson", col: 83.0 },
  { match: "El Paso", col: 87.0 },
];

/**
 * Resolve a COL index for a location string.
 * Checks metro overrides first, then falls back to state-level.
 * Returns `null` if location can't be resolved.
 */
export function getCOL(
  location: string,
  stateCode?: string | null,
): { col: number; source: "metro" | "state" } | null {
  if (!location && !stateCode) return null;

  // Try metro match first
  const loc = location.toLowerCase();
  for (const m of METRO_COL) {
    if (loc.includes(m.match.toLowerCase())) {
      return { col: m.col, source: "metro" };
    }
  }

  // Fall back to state
  const st = stateCode?.toUpperCase();
  if (st && STATE_COL[st] !== undefined) {
    return { col: STATE_COL[st], source: "state" };
  }

  return null;
}

/**
 * Compare two COL indices and describe the difference.
 * Returns { diff (%), label, purchasingPower }.
 * diff > 0 means `area` is MORE expensive than `home`.
 */
export function compareCOL(
  homeCOL: number,
  areaCOL: number,
  salary: number,
): {
  diff: number; // percentage difference (positive = area more expensive)
  label: string; // human-readable label
  adjustedSalary: number; // what the salary is "worth" relative to home
} {
  const diff = ((areaCOL - homeCOL) / homeCOL) * 100;
  const adjustedSalary = salary * (homeCOL / areaCOL);

  let label: string;
  const absDiff = Math.abs(diff);
  if (absDiff < 1) {
    label = "Similar cost of living";
  } else if (diff > 0) {
    label = `${absDiff.toFixed(0)}% more expensive`;
  } else {
    label = `${absDiff.toFixed(0)}% cheaper`;
  }

  return { diff, label, adjustedSalary };
}

/* ── Monthly cost estimates ── */
// National average monthly costs (single adult, BLS Consumer Expenditure Survey 2024)
const BASE_MONTHLY: { key: string; label: string; amount: number }[] = [
  { key: "housing",   label: "Housing",   amount: 1_540 },
  { key: "groceries", label: "Groceries", amount: 415 },
  { key: "transport", label: "Transport", amount: 780 },
  { key: "utilities", label: "Utilities", amount: 210 },
  { key: "healthcare", label: "Healthcare", amount: 420 },
];

/**
 * Estimate monthly living costs for a given COL index.
 * Scales national averages by `col / 100`.
 * Returns individual categories + total.
 */
export function getMonthlyCosts(col: number) {
  const scale = col / 100;
  const items = BASE_MONTHLY.map((b) => ({
    key: b.key,
    label: b.label,
    amount: Math.round(b.amount * scale),
  }));
  const total = items.reduce((s, i) => s + i.amount, 0);
  return { items, total };
}
