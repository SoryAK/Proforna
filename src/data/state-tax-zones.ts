/**
 * US State + local tax zone data for map overlay.
 * Uses real GeoJSON state boundaries loaded from /data/us-states.json.
 * Rates are approximate effective rates at ~$80k income (single filer, 2026).
 */

/* ── State tax rates by full name (matches GeoJSON "name" property) ── */
export interface StateTaxInfo {
  abbr: string;
  /** Effective state income tax rate (0–1) */
  rate: number;
  /** Median effective property tax rate as % of home value (0–1) */
  propTaxRate: number;
}

export const STATE_TAX_BY_NAME: Record<string, StateTaxInfo> = {
  // propTaxRate = median effective property tax rate (source: Tax Foundation / Census ACS 2024)
  "Alabama":        { abbr: "AL", rate: 0.04,   propTaxRate: 0.0040 },
  "Alaska":         { abbr: "AK", rate: 0,      propTaxRate: 0.0118 },
  "Arizona":        { abbr: "AZ", rate: 0.025,  propTaxRate: 0.0062 },
  "Arkansas":       { abbr: "AR", rate: 0.044,  propTaxRate: 0.0063 },
  "California":     { abbr: "CA", rate: 0.045,  propTaxRate: 0.0071 },
  "Colorado":       { abbr: "CO", rate: 0.044,  propTaxRate: 0.0051 },
  "Connecticut":    { abbr: "CT", rate: 0.048,  propTaxRate: 0.0198 },
  "Delaware":       { abbr: "DE", rate: 0.05,   propTaxRate: 0.0057 },
  "Florida":        { abbr: "FL", rate: 0,      propTaxRate: 0.0086 },
  "Georgia":        { abbr: "GA", rate: 0.0549, propTaxRate: 0.0088 },
  "Hawaii":         { abbr: "HI", rate: 0.065,  propTaxRate: 0.0028 },
  "Idaho":          { abbr: "ID", rate: 0.058,  propTaxRate: 0.0063 },
  "Illinois":       { abbr: "IL", rate: 0.0495, propTaxRate: 0.0207 },
  "Indiana":        { abbr: "IN", rate: 0.0305, propTaxRate: 0.0085 },
  "Iowa":           { abbr: "IA", rate: 0.044,  propTaxRate: 0.0153 },
  "Kansas":         { abbr: "KS", rate: 0.046,  propTaxRate: 0.0141 },
  "Kentucky":       { abbr: "KY", rate: 0.04,   propTaxRate: 0.0086 },
  "Louisiana":      { abbr: "LA", rate: 0.03,   propTaxRate: 0.0055 },
  "Maine":          { abbr: "ME", rate: 0.058,  propTaxRate: 0.0130 },
  "Maryland":       { abbr: "MD", rate: 0.045,  propTaxRate: 0.0104 },
  "Massachusetts":  { abbr: "MA", rate: 0.05,   propTaxRate: 0.0114 },
  "Michigan":       { abbr: "MI", rate: 0.0425, propTaxRate: 0.0145 },
  "Minnesota":      { abbr: "MN", rate: 0.068,  propTaxRate: 0.0111 },
  "Mississippi":    { abbr: "MS", rate: 0.047,  propTaxRate: 0.0081 },
  "Missouri":       { abbr: "MO", rate: 0.048,  propTaxRate: 0.0097 },
  "Montana":        { abbr: "MT", rate: 0.055,  propTaxRate: 0.0083 },
  "Nebraska":       { abbr: "NE", rate: 0.055,  propTaxRate: 0.0163 },
  "Nevada":         { abbr: "NV", rate: 0,      propTaxRate: 0.0053 },
  "New Hampshire":  { abbr: "NH", rate: 0,      propTaxRate: 0.0186 },
  "New Jersey":     { abbr: "NJ", rate: 0.04,   propTaxRate: 0.0240 },
  "New Mexico":     { abbr: "NM", rate: 0.04,   propTaxRate: 0.0078 },
  "New York":       { abbr: "NY", rate: 0.052,  propTaxRate: 0.0162 },
  "North Carolina": { abbr: "NC", rate: 0.045,  propTaxRate: 0.0077 },
  "North Dakota":   { abbr: "ND", rate: 0.0195, propTaxRate: 0.0098 },
  "Ohio":           { abbr: "OH", rate: 0.0357, propTaxRate: 0.0157 },
  "Oklahoma":       { abbr: "OK", rate: 0.0475, propTaxRate: 0.0090 },
  "Oregon":         { abbr: "OR", rate: 0.08,   propTaxRate: 0.0093 },
  "Pennsylvania":   { abbr: "PA", rate: 0.0307, propTaxRate: 0.0158 },
  "Rhode Island":   { abbr: "RI", rate: 0.05,   propTaxRate: 0.0153 },
  "South Carolina": { abbr: "SC", rate: 0.06,   propTaxRate: 0.0057 },
  "South Dakota":   { abbr: "SD", rate: 0,      propTaxRate: 0.0128 },
  "Tennessee":      { abbr: "TN", rate: 0,      propTaxRate: 0.0064 },
  "Texas":          { abbr: "TX", rate: 0,      propTaxRate: 0.0167 },
  "Utah":           { abbr: "UT", rate: 0.0465, propTaxRate: 0.0058 },
  "Vermont":        { abbr: "VT", rate: 0.055,  propTaxRate: 0.0183 },
  "Virginia":       { abbr: "VA", rate: 0.052,  propTaxRate: 0.0080 },
  "Washington":     { abbr: "WA", rate: 0,      propTaxRate: 0.0092 },
  "West Virginia":  { abbr: "WV", rate: 0.05,   propTaxRate: 0.0059 },
  "Wisconsin":      { abbr: "WI", rate: 0.053,  propTaxRate: 0.0168 },
  "Wyoming":        { abbr: "WY", rate: 0,      propTaxRate: 0.0057 },
  "District of Columbia": { abbr: "DC", rate: 0.065, propTaxRate: 0.0056 },
  "Puerto Rico":    { abbr: "PR", rate: 0.04,   propTaxRate: 0.0080 },
};

/* ── Reference home value for property tax estimates ── */
export const REF_HOME_VALUE = 350_000;

/* ── Local / City tax markers ── */
export interface CityTaxMarker {
  city: string;
  state: string;
  lat: number;
  lng: number;
  taxes: { name: string; rate: number }[];
}

export const CITY_TAX_MARKERS: CityTaxMarker[] = [
  // Pennsylvania
  { city: "Philadelphia", state: "PA", lat: 39.9526, lng: -75.1652, taxes: [{ name: "Wage Tax", rate: 0.0375 }] },
  { city: "Pittsburgh", state: "PA", lat: 40.4406, lng: -79.9959, taxes: [{ name: "EIT", rate: 0.03 }] },
  { city: "Scranton", state: "PA", lat: 41.4090, lng: -75.6624, taxes: [{ name: "EIT", rate: 0.034 }] },
  { city: "Reading", state: "PA", lat: 40.3357, lng: -75.9269, taxes: [{ name: "EIT", rate: 0.034 }] },
  { city: "Allentown", state: "PA", lat: 40.6084, lng: -75.4902, taxes: [{ name: "EIT", rate: 0.0195 }] },
  { city: "Harrisburg", state: "PA", lat: 40.2732, lng: -76.8867, taxes: [{ name: "EIT", rate: 0.02 }] },
  // New York
  { city: "New York City", state: "NY", lat: 40.7128, lng: -74.0060, taxes: [{ name: "City Income Tax", rate: 0.0388 }] },
  { city: "Yonkers", state: "NY", lat: 40.9312, lng: -73.8987, taxes: [{ name: "Surcharge", rate: 0.0196 }] },
  // Ohio
  { city: "Columbus", state: "OH", lat: 39.9612, lng: -82.9988, taxes: [{ name: "Income Tax", rate: 0.025 }] },
  { city: "Cleveland", state: "OH", lat: 41.4993, lng: -81.6944, taxes: [{ name: "Income Tax", rate: 0.025 }] },
  { city: "Cincinnati", state: "OH", lat: 39.1031, lng: -84.5120, taxes: [{ name: "Income Tax", rate: 0.018 }] },
  // Michigan
  { city: "Detroit", state: "MI", lat: 42.3314, lng: -83.0458, taxes: [{ name: "Income Tax", rate: 0.024 }] },
  // Missouri
  { city: "St. Louis", state: "MO", lat: 38.6270, lng: -90.1994, taxes: [{ name: "Earnings Tax", rate: 0.01 }] },
  { city: "Kansas City", state: "MO", lat: 39.0997, lng: -94.5786, taxes: [{ name: "Earnings Tax", rate: 0.01 }] },
  // California
  { city: "San Francisco", state: "CA", lat: 37.7749, lng: -122.4194, taxes: [{ name: "Payroll Tax", rate: 0.006 }] },
  // Colorado
  { city: "Denver", state: "CO", lat: 39.7392, lng: -104.9903, taxes: [{ name: "OPT", rate: 0.00058 }] },
  // Delaware
  { city: "Wilmington", state: "DE", lat: 39.7391, lng: -75.5398, taxes: [{ name: "Wage Tax", rate: 0.0125 }] },
  // New Jersey
  { city: "Newark", state: "NJ", lat: 40.7357, lng: -74.1724, taxes: [{ name: "Payroll Tax", rate: 0.01 }] },
];

/* ── County property tax markers (top ~100 populous counties) ── */
export interface CountyPropTaxMarker {
  county: string;
  state: string;
  lat: number;
  lng: number;
  /** Effective property tax rate as % of home value */
  rate: number;
  /** Median home value in this county */
  medianHome: number;
}

export const COUNTY_PROP_TAX_MARKERS: CountyPropTaxMarker[] = [
  // ── New Jersey (highest prop tax state) ──
  { county: "Bergen Co",      state: "NJ", lat: 40.96, lng: -74.07, rate: 0.0254, medianHome: 530000 },
  { county: "Essex Co",       state: "NJ", lat: 40.79, lng: -74.25, rate: 0.0270, medianHome: 385000 },
  { county: "Hudson Co",      state: "NJ", lat: 40.73, lng: -74.08, rate: 0.0195, medianHome: 465000 },
  { county: "Middlesex Co",   state: "NJ", lat: 40.44, lng: -74.38, rate: 0.0264, medianHome: 395000 },
  { county: "Monmouth Co",    state: "NJ", lat: 40.29, lng: -74.16, rate: 0.0205, medianHome: 480000 },
  { county: "Ocean Co",       state: "NJ", lat: 39.89, lng: -74.25, rate: 0.0182, medianHome: 365000 },
  { county: "Camden Co",      state: "NJ", lat: 39.80, lng: -74.96, rate: 0.0316, medianHome: 220000 },
  { county: "Passaic Co",     state: "NJ", lat: 41.04, lng: -74.30, rate: 0.0280, medianHome: 375000 },
  // ── New York ──
  { county: "Westchester Co", state: "NY", lat: 41.12, lng: -73.76, rate: 0.0216, medianHome: 600000 },
  { county: "Nassau Co",      state: "NY", lat: 40.73, lng: -73.59, rate: 0.0213, medianHome: 560000 },
  { county: "Suffolk Co",     state: "NY", lat: 40.94, lng: -72.68, rate: 0.0211, medianHome: 475000 },
  { county: "Rockland Co",    state: "NY", lat: 41.15, lng: -74.02, rate: 0.0252, medianHome: 490000 },
  { county: "Erie Co",        state: "NY", lat: 42.76, lng: -78.78, rate: 0.0262, medianHome: 190000 },
  { county: "Monroe Co",      state: "NY", lat: 43.15, lng: -77.61, rate: 0.0256, medianHome: 175000 },
  // ── Illinois ──
  { county: "Cook Co",        state: "IL", lat: 41.84, lng: -87.82, rate: 0.0202, medianHome: 275000 },
  { county: "DuPage Co",      state: "IL", lat: 41.85, lng: -88.09, rate: 0.0206, medianHome: 335000 },
  { county: "Lake Co",        state: "IL", lat: 42.35, lng: -87.96, rate: 0.0263, medianHome: 280000 },
  { county: "Will Co",        state: "IL", lat: 41.45, lng: -87.98, rate: 0.0228, medianHome: 265000 },
  { county: "Kane Co",        state: "IL", lat: 41.94, lng: -88.43, rate: 0.0254, medianHome: 265000 },
  // ── Connecticut ──
  { county: "Fairfield Co",   state: "CT", lat: 41.22, lng: -73.37, rate: 0.0193, medianHome: 480000 },
  { county: "Hartford Co",    state: "CT", lat: 41.79, lng: -72.74, rate: 0.0211, medianHome: 260000 },
  { county: "New Haven Co",   state: "CT", lat: 41.35, lng: -72.90, rate: 0.0248, medianHome: 265000 },
  // ── Pennsylvania ──
  { county: "Philadelphia Co", state: "PA", lat: 39.95, lng: -75.16, rate: 0.0134, medianHome: 195000 },
  { county: "Delaware Co",    state: "PA", lat: 39.92, lng: -75.40, rate: 0.0210, medianHome: 265000 },
  { county: "Montgomery Co",  state: "PA", lat: 40.21, lng: -75.37, rate: 0.0168, medianHome: 345000 },
  { county: "Chester Co",     state: "PA", lat: 39.97, lng: -75.75, rate: 0.0157, medianHome: 410000 },
  { county: "Bucks Co",       state: "PA", lat: 40.34, lng: -75.11, rate: 0.0152, medianHome: 380000 },
  { county: "Allegheny Co",   state: "PA", lat: 40.47, lng: -79.98, rate: 0.0194, medianHome: 185000 },
  { county: "Lancaster Co",   state: "PA", lat: 40.04, lng: -76.31, rate: 0.0164, medianHome: 260000 },
  // ── Texas (no income tax but high property tax) ──
  { county: "Harris Co",      state: "TX", lat: 29.86, lng: -95.39, rate: 0.0196, medianHome: 225000 },
  { county: "Dallas Co",      state: "TX", lat: 32.77, lng: -96.78, rate: 0.0193, medianHome: 240000 },
  { county: "Tarrant Co",     state: "TX", lat: 32.77, lng: -97.29, rate: 0.0210, medianHome: 265000 },
  { county: "Bexar Co",       state: "TX", lat: 29.45, lng: -98.52, rate: 0.0198, medianHome: 210000 },
  { county: "Travis Co",      state: "TX", lat: 30.33, lng: -97.77, rate: 0.0175, medianHome: 440000 },
  { county: "Collin Co",      state: "TX", lat: 33.19, lng: -96.57, rate: 0.0193, medianHome: 410000 },
  { county: "Denton Co",      state: "TX", lat: 33.21, lng: -97.13, rate: 0.0186, medianHome: 370000 },
  { county: "Fort Bend Co",   state: "TX", lat: 29.55, lng: -95.77, rate: 0.0225, medianHome: 310000 },
  { county: "Williamson Co",  state: "TX", lat: 30.64, lng: -97.60, rate: 0.0197, medianHome: 375000 },
  // ── Ohio ──
  { county: "Cuyahoga Co",    state: "OH", lat: 41.47, lng: -81.68, rate: 0.0227, medianHome: 155000 },
  { county: "Franklin Co",    state: "OH", lat: 39.97, lng: -82.99, rate: 0.0173, medianHome: 235000 },
  { county: "Hamilton Co",    state: "OH", lat: 39.14, lng: -84.54, rate: 0.0182, medianHome: 195000 },
  { county: "Summit Co",      state: "OH", lat: 41.13, lng: -81.54, rate: 0.0194, medianHome: 165000 },
  // ── Michigan ──
  { county: "Wayne Co",       state: "MI", lat: 42.28, lng: -83.26, rate: 0.0204, medianHome: 135000 },
  { county: "Oakland Co",     state: "MI", lat: 42.66, lng: -83.38, rate: 0.0161, medianHome: 280000 },
  { county: "Macomb Co",      state: "MI", lat: 42.67, lng: -82.91, rate: 0.0167, medianHome: 215000 },
  { county: "Washtenaw Co",   state: "MI", lat: 42.25, lng: -83.83, rate: 0.0183, medianHome: 315000 },
  // ── Wisconsin ──
  { county: "Milwaukee Co",   state: "WI", lat: 43.01, lng: -87.97, rate: 0.0235, medianHome: 175000 },
  { county: "Dane Co",        state: "WI", lat: 43.07, lng: -89.42, rate: 0.0193, medianHome: 330000 },
  // ── New Hampshire (no income tax but high prop tax) ──
  { county: "Hillsborough Co", state: "NH", lat: 42.93, lng: -71.72, rate: 0.0216, medianHome: 380000 },
  { county: "Rockingham Co",  state: "NH", lat: 43.00, lng: -71.10, rate: 0.0178, medianHome: 420000 },
  // ── Florida ──
  { county: "Miami-Dade Co",  state: "FL", lat: 25.76, lng: -80.37, rate: 0.0095, medianHome: 430000 },
  { county: "Broward Co",     state: "FL", lat: 26.15, lng: -80.25, rate: 0.0101, medianHome: 370000 },
  { county: "Palm Beach Co",  state: "FL", lat: 26.65, lng: -80.27, rate: 0.0098, medianHome: 400000 },
  { county: "Hillsborough Co FL", state: "FL", lat: 27.91, lng: -82.37, rate: 0.0094, medianHome: 335000 },
  { county: "Orange Co",      state: "FL", lat: 28.50, lng: -81.40, rate: 0.0090, medianHome: 345000 },
  { county: "Duval Co",       state: "FL", lat: 30.35, lng: -81.66, rate: 0.0091, medianHome: 270000 },
  // ── California ──
  { county: "Los Angeles Co", state: "CA", lat: 34.02, lng: -118.41, rate: 0.0073, medianHome: 810000 },
  { county: "San Diego Co",   state: "CA", lat: 32.83, lng: -116.97, rate: 0.0072, medianHome: 780000 },
  { county: "Orange Co CA",   state: "CA", lat: 33.70, lng: -117.77, rate: 0.0068, medianHome: 880000 },
  { county: "Santa Clara Co", state: "CA", lat: 37.36, lng: -121.97, rate: 0.0067, medianHome: 1450000 },
  { county: "Alameda Co",     state: "CA", lat: 37.65, lng: -121.89, rate: 0.0070, medianHome: 950000 },
  { county: "San Francisco Co", state: "CA", lat: 37.77, lng: -122.42, rate: 0.0063, medianHome: 1300000 },
  { county: "Contra Costa Co", state: "CA", lat: 37.92, lng: -121.95, rate: 0.0075, medianHome: 760000 },
  { county: "San Mateo Co",   state: "CA", lat: 37.50, lng: -122.33, rate: 0.0060, medianHome: 1500000 },
  { county: "Sacramento Co",  state: "CA", lat: 38.47, lng: -121.34, rate: 0.0082, medianHome: 470000 },
  { county: "Riverside Co",   state: "CA", lat: 33.74, lng: -115.99, rate: 0.0090, medianHome: 510000 },
  // ── Washington (no income tax) ──
  { county: "King Co",        state: "WA", lat: 47.49, lng: -121.84, rate: 0.0090, medianHome: 750000 },
  { county: "Pierce Co",      state: "WA", lat: 47.04, lng: -122.13, rate: 0.0108, medianHome: 460000 },
  { county: "Snohomish Co",   state: "WA", lat: 48.04, lng: -121.72, rate: 0.0087, medianHome: 580000 },
  // ── Massachusetts ──
  { county: "Suffolk Co MA",  state: "MA", lat: 42.36, lng: -71.06, rate: 0.0099, medianHome: 640000 },
  { county: "Middlesex Co MA", state: "MA", lat: 42.49, lng: -71.39, rate: 0.0116, medianHome: 620000 },
  { county: "Norfolk Co",     state: "MA", lat: 42.17, lng: -71.18, rate: 0.0116, medianHome: 560000 },
  // ── Maryland ──
  { county: "Montgomery Co MD", state: "MD", lat: 39.14, lng: -77.20, rate: 0.0097, medianHome: 530000 },
  { county: "Baltimore Co",   state: "MD", lat: 39.39, lng: -76.61, rate: 0.0113, medianHome: 295000 },
  { county: "Prince George's Co", state: "MD", lat: 38.83, lng: -76.85, rate: 0.0116, medianHome: 365000 },
  { county: "Anne Arundel Co", state: "MD", lat: 38.95, lng: -76.56, rate: 0.0094, medianHome: 400000 },
  // ── Virginia ──
  { county: "Fairfax Co",     state: "VA", lat: 38.85, lng: -77.28, rate: 0.0104, medianHome: 620000 },
  { county: "Loudoun Co",     state: "VA", lat: 39.08, lng: -77.64, rate: 0.0096, medianHome: 610000 },
  { county: "Prince William Co", state: "VA", lat: 38.72, lng: -77.48, rate: 0.0099, medianHome: 440000 },
  // ── Georgia ──
  { county: "Fulton Co",      state: "GA", lat: 33.80, lng: -84.39, rate: 0.0113, medianHome: 380000 },
  { county: "Gwinnett Co",    state: "GA", lat: 33.96, lng: -84.02, rate: 0.0101, medianHome: 340000 },
  { county: "DeKalb Co",      state: "GA", lat: 33.77, lng: -84.23, rate: 0.0122, medianHome: 325000 },
  { county: "Cobb Co",        state: "GA", lat: 33.94, lng: -84.58, rate: 0.0099, medianHome: 370000 },
  // ── Minnesota ──
  { county: "Hennepin Co",    state: "MN", lat: 44.97, lng: -93.35, rate: 0.0122, medianHome: 325000 },
  { county: "Ramsey Co",      state: "MN", lat: 44.98, lng: -93.10, rate: 0.0131, medianHome: 260000 },
  { county: "Dakota Co",      state: "MN", lat: 44.67, lng: -93.06, rate: 0.0107, medianHome: 320000 },
  // ── Colorado ──
  { county: "Denver Co",      state: "CO", lat: 39.74, lng: -104.99, rate: 0.0055, medianHome: 530000 },
  { county: "Arapahoe Co",    state: "CO", lat: 39.62, lng: -104.34, rate: 0.0053, medianHome: 440000 },
  { county: "Jefferson Co",   state: "CO", lat: 39.59, lng: -105.25, rate: 0.0053, medianHome: 480000 },
  { county: "El Paso Co",     state: "CO", lat: 38.83, lng: -104.76, rate: 0.0052, medianHome: 380000 },
  // ── Arizona ──
  { county: "Maricopa Co",    state: "AZ", lat: 33.51, lng: -112.07, rate: 0.0060, medianHome: 380000 },
  { county: "Pima Co",        state: "AZ", lat: 32.10, lng: -111.47, rate: 0.0077, medianHome: 270000 },
  // ── Nevada ──
  { county: "Clark Co",       state: "NV", lat: 36.21, lng: -115.02, rate: 0.0060, medianHome: 390000 },
  // ── North Carolina ──
  { county: "Mecklenburg Co", state: "NC", lat: 35.24, lng: -80.84, rate: 0.0094, medianHome: 350000 },
  { county: "Wake Co",        state: "NC", lat: 35.79, lng: -78.65, rate: 0.0083, medianHome: 390000 },
  // ── Oregon ──
  { county: "Multnomah Co",   state: "OR", lat: 45.55, lng: -122.42, rate: 0.0107, medianHome: 475000 },
  { county: "Washington Co OR", state: "OR", lat: 45.55, lng: -122.91, rate: 0.0095, medianHome: 490000 },
  // ── South Dakota (no income tax) ──
  { county: "Minnehaha Co",   state: "SD", lat: 43.67, lng: -96.74, rate: 0.0146, medianHome: 240000 },
  // ── Nebraska ──
  { county: "Douglas Co",     state: "NE", lat: 41.30, lng: -96.15, rate: 0.0184, medianHome: 220000 },
  { county: "Lancaster Co NE", state: "NE", lat: 40.84, lng: -96.69, rate: 0.0191, medianHome: 225000 },
];

/* ── Color helpers ── */

/** Color for a given effective state tax rate */
export function getTaxZoneColor(rate: number): string {
  if (rate === 0) return "#16a34a";       // green-600: no tax
  if (rate < 0.03) return "#4ade80";      // green-400: very low
  if (rate < 0.05) return "#facc15";      // yellow-400: low-moderate
  if (rate < 0.065) return "#f97316";     // orange-500: moderate
  if (rate < 0.075) return "#ef4444";     // red-500: above average
  return "#dc2626";                        // red-600: high
}

/** Human-readable label for a tax tier */
export function getTaxTierLabel(rate: number): string {
  if (rate === 0) return "No Income Tax";
  if (rate < 0.03) return "Very Low";
  if (rate < 0.05) return "Low–Moderate";
  if (rate < 0.065) return "Moderate";
  if (rate < 0.075) return "Above Average";
  return "High";
}

/** Format rate as percentage string */
export function formatTaxRate(rate: number): string {
  if (rate === 0) return "0%";
  return `${(rate * 100).toFixed(1)}%`;
}

/** Property tax color (green = low, red = high) */
export function getPropTaxColor(rate: number): string {
  if (rate < 0.006) return "#16a34a";    // green — very low
  if (rate < 0.010) return "#84cc16";    // lime — low
  if (rate < 0.015) return "#facc15";    // yellow — moderate
  if (rate < 0.020) return "#f97316";    // orange — above average
  if (rate < 0.025) return "#ef4444";    // red — high
  return "#dc2626";                       // dark red — very high
}

/** Property tax tier label */
export function getPropTaxTierLabel(rate: number): string {
  if (rate < 0.006) return "Very Low";
  if (rate < 0.010) return "Low";
  if (rate < 0.015) return "Moderate";
  if (rate < 0.020) return "Above Average";
  if (rate < 0.025) return "High";
  return "Very High";
}

/** Format property tax as annual $ on a home value */
export function formatPropTaxAnnual(rate: number, homeValue: number = REF_HOME_VALUE): string {
  const annual = Math.round(rate * homeValue);
  return `$${annual.toLocaleString()}/yr`;
}

/** Tax zone legend tiers for UI */
export const TAX_ZONE_LEGEND = [
  { label: "No Income Tax", color: "#16a34a", example: "TX, FL, WA" },
  { label: "Very Low (<3%)", color: "#4ade80", example: "ND, AZ" },
  { label: "Low–Moderate (3–5%)", color: "#facc15", example: "CO, PA, NC" },
  { label: "Moderate (5–6.5%)", color: "#f97316", example: "NY, MA, GA" },
  { label: "Above Average (6.5–7.5%)", color: "#ef4444", example: "MN, DC" },
  { label: "High (7.5%+)", color: "#dc2626", example: "OR" },
  { label: "Local/City Tax", color: "#7c3aed", example: "Phila, NYC, Detroit" },
  { label: "County Prop Tax", color: "#0ea5e9", example: "zoom in to see" },
];
