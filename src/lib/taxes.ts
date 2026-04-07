/**
 * Tax estimation engine — calculates federal, state, FICA, and local taxes
 * for a given gross salary and location. Uses 2026 tax year data.
 */

/* ── Federal Income Tax Brackets (2026, Single filer) ── */
const FEDERAL_BRACKETS: { min: number; max: number; rate: number }[] = [
  { min: 0, max: 11_925, rate: 0.10 },
  { min: 11_925, max: 48_475, rate: 0.12 },
  { min: 48_475, max: 103_350, rate: 0.22 },
  { min: 103_350, max: 197_300, rate: 0.24 },
  { min: 197_300, max: 250_525, rate: 0.32 },
  { min: 250_525, max: 626_350, rate: 0.35 },
  { min: 626_350, max: Infinity, rate: 0.37 },
];

const STANDARD_DEDUCTION = 15_700; // 2026 single filer

/* ── FICA ── */
const SS_RATE = 0.062;
const SS_WAGE_CAP = 174_900; // 2026 cap
const MEDICARE_RATE = 0.0145;
const MEDICARE_SURTAX_RATE = 0.009; // Additional Medicare on income > $200k
const MEDICARE_SURTAX_THRESHOLD = 200_000;

/* ── FUTA (Employer only) ── */
const FUTA_RATE = 0.006; // After state credit
const FUTA_WAGE_CAP = 7_000;

/* ── State Income Tax (simplified effective rates + brackets for major states) ── */
// States with no income tax
const NO_INCOME_TAX_STATES = new Set([
  "AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY",
]);

// Flat-rate states
const FLAT_TAX_STATES: Record<string, number> = {
  AZ: 0.025, CO: 0.044, GA: 0.0549, ID: 0.058, IL: 0.0495,
  IN: 0.0305, KY: 0.04, MA: 0.05, MI: 0.0425, MS: 0.047,
  NC: 0.0450, ND: 0.0195, OH: 0.0357, OK: 0.0475, PA: 0.0307,
  UT: 0.0465,
};

// Bracket states (simplified — major states only; others use estimated effective rate)
const STATE_BRACKETS: Record<string, { deduction: number; brackets: { min: number; max: number; rate: number }[] }> = {
  CA: {
    deduction: 5_540,
    brackets: [
      { min: 0, max: 10_756, rate: 0.01 },
      { min: 10_756, max: 25_499, rate: 0.02 },
      { min: 25_499, max: 40_245, rate: 0.04 },
      { min: 40_245, max: 55_866, rate: 0.06 },
      { min: 55_866, max: 70_612, rate: 0.08 },
      { min: 70_612, max: 360_659, rate: 0.093 },
      { min: 360_659, max: 432_787, rate: 0.103 },
      { min: 432_787, max: 721_314, rate: 0.113 },
      { min: 721_314, max: 1_000_000, rate: 0.123 },
      { min: 1_000_000, max: Infinity, rate: 0.133 },
    ],
  },
  NY: {
    deduction: 8_000,
    brackets: [
      { min: 0, max: 8_500, rate: 0.04 },
      { min: 8_500, max: 11_700, rate: 0.045 },
      { min: 11_700, max: 13_900, rate: 0.0525 },
      { min: 13_900, max: 80_650, rate: 0.0585 },
      { min: 80_650, max: 215_400, rate: 0.0625 },
      { min: 215_400, max: 1_077_550, rate: 0.0685 },
      { min: 1_077_550, max: Infinity, rate: 0.103 },
    ],
  },
  NJ: {
    deduction: 1_000,
    brackets: [
      { min: 0, max: 20_000, rate: 0.014 },
      { min: 20_000, max: 35_000, rate: 0.0175 },
      { min: 35_000, max: 40_000, rate: 0.035 },
      { min: 40_000, max: 75_000, rate: 0.05525 },
      { min: 75_000, max: 500_000, rate: 0.0637 },
      { min: 500_000, max: 1_000_000, rate: 0.0897 },
      { min: 1_000_000, max: Infinity, rate: 0.1075 },
    ],
  },
  CT: {
    deduction: 0,
    brackets: [
      { min: 0, max: 10_000, rate: 0.02 },
      { min: 10_000, max: 50_000, rate: 0.045 },
      { min: 50_000, max: 100_000, rate: 0.055 },
      { min: 100_000, max: 200_000, rate: 0.06 },
      { min: 200_000, max: 250_000, rate: 0.065 },
      { min: 250_000, max: 500_000, rate: 0.069 },
      { min: 500_000, max: Infinity, rate: 0.0699 },
    ],
  },
  VA: {
    deduction: 4_500,
    brackets: [
      { min: 0, max: 3_000, rate: 0.02 },
      { min: 3_000, max: 5_000, rate: 0.03 },
      { min: 5_000, max: 17_000, rate: 0.05 },
      { min: 17_000, max: Infinity, rate: 0.0575 },
    ],
  },
  MD: {
    deduction: 2_400,
    brackets: [
      { min: 0, max: 1_000, rate: 0.02 },
      { min: 1_000, max: 2_000, rate: 0.03 },
      { min: 2_000, max: 3_000, rate: 0.04 },
      { min: 3_000, max: 100_000, rate: 0.0475 },
      { min: 100_000, max: 125_000, rate: 0.05 },
      { min: 125_000, max: 150_000, rate: 0.0525 },
      { min: 150_000, max: 250_000, rate: 0.055 },
      { min: 250_000, max: Infinity, rate: 0.0575 },
    ],
  },
  DE: {
    deduction: 3_250,
    brackets: [
      { min: 0, max: 2_000, rate: 0.0 },
      { min: 2_000, max: 5_000, rate: 0.022 },
      { min: 5_000, max: 10_000, rate: 0.039 },
      { min: 10_000, max: 20_000, rate: 0.048 },
      { min: 20_000, max: 25_000, rate: 0.052 },
      { min: 25_000, max: 60_000, rate: 0.0555 },
      { min: 60_000, max: Infinity, rate: 0.066 },
    ],
  },
};

// Estimated effective rates for remaining bracket states (mid-range income)
const ESTIMATED_STATE_RATES: Record<string, number> = {
  AL: 0.04, AR: 0.044, HI: 0.065, IA: 0.044, KS: 0.046,
  LA: 0.03, ME: 0.058, MN: 0.068, MO: 0.048, MT: 0.055,
  NE: 0.055, NM: 0.04, OR: 0.08, RI: 0.05, SC: 0.06,
  VT: 0.055, WI: 0.053, WV: 0.05, DC: 0.065,
};

/* ── Local / City Taxes ── */
interface LocalTax {
  name: string;
  rate: number;
}

const LOCAL_TAXES: Record<string, LocalTax[]> = {
  // Pennsylvania cities
  "philadelphia,pa": [{ name: "Philadelphia Wage Tax", rate: 0.03748 }],
  "pittsburgh,pa": [{ name: "Pittsburgh EIT", rate: 0.03 }],
  "scranton,pa": [{ name: "Scranton EIT", rate: 0.0340 }],
  "reading,pa": [{ name: "Reading EIT", rate: 0.034 }],
  "allentown,pa": [{ name: "Allentown EIT", rate: 0.0195 }],
  "harrisburg,pa": [{ name: "Harrisburg EIT", rate: 0.02 }],
  // New York
  "new york,ny": [{ name: "NYC Income Tax", rate: 0.03876 }],
  "yonkers,ny": [{ name: "Yonkers Surcharge", rate: 0.01959 }],
  // Ohio cities
  "columbus,oh": [{ name: "Columbus Income Tax", rate: 0.025 }],
  "cleveland,oh": [{ name: "Cleveland Income Tax", rate: 0.025 }],
  "cincinnati,oh": [{ name: "Cincinnati Income Tax", rate: 0.018 }],
  // Others
  "detroit,mi": [{ name: "Detroit Income Tax", rate: 0.024 }],
  "st. louis,mo": [{ name: "St. Louis Earnings Tax", rate: 0.01 }],
  "kansas city,mo": [{ name: "KC Earnings Tax", rate: 0.01 }],
  "san francisco,ca": [{ name: "SF Payroll Tax (approx)", rate: 0.006 }],
  "denver,co": [{ name: "Denver OPT", rate: 0.0577 / 100 }], // flat $5.75/month ≈ negligible
  "wilmington,de": [{ name: "Wilmington Wage Tax", rate: 0.0125 }],
  "newark,nj": [{ name: "Newark Payroll Tax", rate: 0.01 }],
};

/* ── Helper: calculate tax from brackets ── */
function calcBracketTax(taxableIncome: number, brackets: { min: number; max: number; rate: number }[]): number {
  let tax = 0;
  for (const b of brackets) {
    if (taxableIncome <= b.min) break;
    const amount = Math.min(taxableIncome, b.max) - b.min;
    tax += amount * b.rate;
  }
  return tax;
}

/* ── Resolve state abbreviation from location string ── */
const STATE_ABBREVS: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC",
};

export function resolveState(location: string): string | null {
  const parts = location.split(",").map((p) => p.trim());
  // Try last part as state abbreviation
  const last = parts[parts.length - 1]?.toUpperCase();
  if (last && last.length === 2 && (NO_INCOME_TAX_STATES.has(last) || FLAT_TAX_STATES[last] || STATE_BRACKETS[last] || ESTIMATED_STATE_RATES[last])) {
    return last;
  }
  // Try full name
  for (const part of parts) {
    const abbr = STATE_ABBREVS[part.toLowerCase()];
    if (abbr) return abbr;
  }
  // Check if "County" is in the string — try the state after it
  // e.g. "Montgomery County, PA" → "PA" already handled above
  return null;
}

function resolveCity(location: string): string | null {
  const parts = location.split(",").map((p) => p.trim().toLowerCase());
  if (parts.length >= 2) {
    // "Philadelphia, PA" → "philadelphia,pa"
    const state = parts[parts.length - 1].length === 2 ? parts[parts.length - 1] : null;
    if (state) {
      // Try the city part (first segment) + state
      return `${parts[0]},${state}`;
    }
  }
  return null;
}

/* ── Main Tax Estimation ── */
export interface TaxBreakdown {
  grossSalary: number;
  // Employee taxes
  federalIncomeTax: number;
  stateIncomeTax: number;
  stateName: string | null;
  socialSecurity: number;
  medicare: number;
  localTaxes: { name: string; amount: number }[];
  totalEmployeeTax: number;
  takeHomePay: number;
  effectiveRate: number;
  // Employer taxes
  employerSS: number;
  employerMedicare: number;
  employerFUTA: number;
  totalEmployerTax: number;
  totalEmployerCost: number;
  // Marginal rates
  marginalFederalRate: number;
  marginalStateRate: number;
}

export function estimateTaxes(grossSalary: number, location: string): TaxBreakdown {
  const state = resolveState(location);
  const cityKey = resolveCity(location);

  // ── Federal Income Tax ──
  const federalTaxable = Math.max(0, grossSalary - STANDARD_DEDUCTION);
  const federalIncomeTax = calcBracketTax(federalTaxable, FEDERAL_BRACKETS);

  // Marginal federal rate
  let marginalFederalRate = 0.10;
  for (const b of FEDERAL_BRACKETS) {
    if (federalTaxable > b.min) marginalFederalRate = b.rate;
  }

  // ── State Income Tax ──
  let stateIncomeTax = 0;
  let marginalStateRate = 0;

  if (state && !NO_INCOME_TAX_STATES.has(state)) {
    if (FLAT_TAX_STATES[state] !== undefined) {
      stateIncomeTax = grossSalary * FLAT_TAX_STATES[state];
      marginalStateRate = FLAT_TAX_STATES[state];
    } else if (STATE_BRACKETS[state]) {
      const { deduction, brackets } = STATE_BRACKETS[state];
      const stateTaxable = Math.max(0, grossSalary - deduction);
      stateIncomeTax = calcBracketTax(stateTaxable, brackets);
      for (const b of brackets) {
        if (stateTaxable > b.min) marginalStateRate = b.rate;
      }
    } else if (ESTIMATED_STATE_RATES[state]) {
      stateIncomeTax = grossSalary * ESTIMATED_STATE_RATES[state];
      marginalStateRate = ESTIMATED_STATE_RATES[state];
    }
  }

  // ── FICA (Employee) ──
  const socialSecurity = Math.min(grossSalary, SS_WAGE_CAP) * SS_RATE;
  let medicare = grossSalary * MEDICARE_RATE;
  if (grossSalary > MEDICARE_SURTAX_THRESHOLD) {
    medicare += (grossSalary - MEDICARE_SURTAX_THRESHOLD) * MEDICARE_SURTAX_RATE;
  }

  // ── Local taxes ──
  const localTaxes: { name: string; amount: number }[] = [];
  if (cityKey && LOCAL_TAXES[cityKey]) {
    for (const lt of LOCAL_TAXES[cityKey]) {
      localTaxes.push({ name: lt.name, amount: grossSalary * lt.rate });
    }
  }

  const totalLocalTax = localTaxes.reduce((sum, t) => sum + t.amount, 0);
  const totalEmployeeTax = federalIncomeTax + stateIncomeTax + socialSecurity + medicare + totalLocalTax;
  const takeHomePay = grossSalary - totalEmployeeTax;
  const effectiveRate = grossSalary > 0 ? totalEmployeeTax / grossSalary : 0;

  // ── Employer taxes ──
  const employerSS = Math.min(grossSalary, SS_WAGE_CAP) * SS_RATE;
  const employerMedicare = grossSalary * MEDICARE_RATE;
  const employerFUTA = Math.min(grossSalary, FUTA_WAGE_CAP) * FUTA_RATE;
  const totalEmployerTax = employerSS + employerMedicare + employerFUTA;
  const totalEmployerCost = grossSalary + totalEmployerTax;

  return {
    grossSalary,
    federalIncomeTax,
    stateIncomeTax,
    stateName: state,
    socialSecurity,
    medicare,
    localTaxes,
    totalEmployeeTax,
    takeHomePay,
    effectiveRate,
    employerSS,
    employerMedicare,
    employerFUTA,
    totalEmployerTax,
    totalEmployerCost,
    marginalFederalRate,
    marginalStateRate,
  };
}

/** Quick take-home estimate from salary range — uses midpoint */
export function quickTakeHome(salaryMin: number | null, salaryMax: number | null, location: string): number | null {
  const salary = salaryMin && salaryMax ? (salaryMin + salaryMax) / 2
    : salaryMin ?? salaryMax;
  if (!salary) return null;
  return estimateTaxes(salary, location).takeHomePay;
}

/** Format currency compactly */
export function formatSalaryCompact(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}
