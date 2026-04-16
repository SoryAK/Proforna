/**
 * Experience Diffusion Model (EDM) — core math & types.
 *
 * Each work-history role is a "diffusion source" that radiates exposure
 * across four zones with Gaussian-style intensity falloff:
 *   CORE  (1.0)  — skills you directly used daily
 *   NEAR  (0.7)  — adjacent things you observed / participated in
 *   MID   (0.4)  — roles / concepts you interacted with
 *   FAR   (0.15) — industry / ambient knowledge through osmosis
 *
 * Tenure amplifies reach: tenure_factor = min(1, months / 24).
 * Accumulated intensity across roles uses diminishing returns:
 *   I_acc = 1 - ∏(1 - I_i)
 */

// ── Zone definitions ────────────────────────────────────────────

export const EDM_ZONES = ["CORE", "NEAR", "MID", "FAR"] as const;
export type EDMZone = (typeof EDM_ZONES)[number];

export const ZONE_BASE_INTENSITY: Record<EDMZone, number> = {
  CORE: 1.0,
  NEAR: 0.7,
  MID: 0.4,
  FAR: 0.15,
};

// ── Exposure categories ─────────────────────────────────────────

export const EDM_CATEGORIES = [
  "skill",
  "process",
  "role_exposure",
  "equipment",
  "domain_concept",
  "industry",
] as const;
export type EDMCategory = (typeof EDM_CATEGORIES)[number];

// ── Exposure types (how the person encountered it) ──────────────

export const EDM_EXPOSURE_TYPES = [
  "direct",       // hands-on daily use
  "observed",     // watched others do it
  "collaborated", // worked alongside someone doing it
  "ambient",      // absorbed through environment
] as const;
export type EDMExposureType = (typeof EDM_EXPOSURE_TYPES)[number];

// ── Tenure factor ───────────────────────────────────────────────

/** Months to reach full penetration into FAR zone. */
const FULL_TENURE_MONTHS = 24;

/**
 * tenure_factor = min(1, months / 24)
 * - 6 months  → 0.25
 * - 12 months → 0.50
 * - 24+ months → 1.0
 */
export function tenureFactor(startDate: string | null, endDate: string | null): number {
  if (!startDate) return 0.5; // unknown tenure → assume 1 year
  const start = parseYearMonth(startDate);
  const end = endDate ? parseYearMonth(endDate) : new Date();
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.min(1.0, Math.max(0, months) / FULL_TENURE_MONTHS);
}

function parseYearMonth(ym: string): Date {
  // Accepts "2020-01" or "2020-01-15" or just "2020"
  const parts = ym.split("-").map(Number);
  return new Date(parts[0], (parts[1] ?? 1) - 1, 1);
}

// ── Effective intensity ─────────────────────────────────────────

/**
 * effective_intensity = base_intensity × tenure_factor
 */
export function effectiveIntensity(zone: EDMZone, tenure: number): number {
  return ZONE_BASE_INTENSITY[zone] * tenure;
}

// ── Accumulated intensity (diminishing returns) ─────────────────

/**
 * Given an array of individual effective intensities from different sources,
 * returns the accumulated intensity using:
 *   I_acc = 1 - ∏(1 - I_i)
 *
 * Two roles each contributing 0.7 → 1 - (0.3 × 0.3) = 0.91
 */
export function accumulatedIntensity(intensities: number[]): number {
  if (intensities.length === 0) return 0;
  const product = intensities.reduce((acc, i) => acc * (1 - Math.min(1, Math.max(0, i))), 1);
  return 1 - product;
}

// ── Mapping helpers ─────────────────────────────────────────────

/** Map a zone + exposure type to the SkillNode type that should be created. */
export function zoneToNodeType(category: EDMCategory): string {
  switch (category) {
    case "skill":           return "technical";
    case "process":         return "process";
    case "role_exposure":   return "role_exposure";
    case "equipment":       return "tool";
    case "domain_concept":  return "domain";
    case "industry":        return "industry_concept";
    default:                return "technical";
  }
}

// ── Exposure descriptor (used by generate API) ──────────────────

export interface ExposureDescriptor {
  name: string;        // display name
  normName: string;    // lowercased dedup key
  zone: EDMZone;
  category: EDMCategory;
  exposureType: EDMExposureType;
  intensity: number;   // base intensity (before tenure)
}
