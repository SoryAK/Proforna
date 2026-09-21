export const CAREER_HISTORY_SECTIONS = [
  { key: "job", label: "Jobs" },
  { key: "internship", label: "Internships" },
  { key: "school", label: "Education" },
] as const;

export type CareerHistorySectionKey =
  (typeof CAREER_HISTORY_SECTIONS)[number]["key"];

export type CareerHistoryItem = {
  id: string;
  kind: string;
  title: string;
  organization: string;
  locationLabel: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  locations?: Array<{
    address: string;
    latitude: number;
    longitude: number;
  }>;
};

export type CareerHistoryGroup = {
  key: CareerHistorySectionKey;
  label: string;
  items: CareerHistoryItem[];
};

export type CareerHistoryStats = {
  tenure: string;
  roles: number;
  miles: number;
  cities: number;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function classifyCareerHistorySection(item: {
  kind: string;
  title?: string;
}): CareerHistorySectionKey {
  if (item.kind === "school") return "school";
  if (item.kind === "internship") return "internship";
  return "job";
}

export function searchCareerHistory(
  items: CareerHistoryItem[],
  query: string,
): CareerHistoryItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    [item.organization, item.title, item.locationLabel, formatHistoryPlace(item)]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function sortCareerHistory(
  items: CareerHistoryItem[],
  order: "newest" | "oldest",
): CareerHistoryItem[] {
  const sorted = [...items].sort(byHistoryRecency);
  return order === "oldest" ? sorted.reverse() : sorted;
}

export function groupCareerHistory(
  items: CareerHistoryItem[],
): CareerHistoryGroup[] {
  return CAREER_HISTORY_SECTIONS.map((section) => ({
    ...section,
    items: items.filter(
      (item) => classifyCareerHistorySection(item) === section.key,
    ),
  })).filter((section) => section.items.length > 0);
}

export function presentCareerHistoryStats(
  items: CareerHistoryItem[],
  now = new Date(),
): CareerHistoryStats {
  const work = items.filter(
    (item) => classifyCareerHistorySection(item) !== "school",
  );
  return {
    tenure: formatTenureMonths(careerSpanMonths(items, now)),
    roles: work.length,
    miles: Math.round(travelMiles(items)),
    cities: uniqueCities(items).size,
  };
}

const STATE_ABBREV: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const STREET_WORD =
  /\b(streets?|roads?|avenues?|boulevards?|drives?|lanes?|ways?|courts?|highways?|parkways?|circles?|places?|terraces?|trails?)\b/i;

export function formatHistoryPlace(item: {
  organization: string;
  locationLabel: string;
  locations?: Array<{ address: string }>;
}): string {
  const candidates = [
    ...(item.locations ?? []).map((location) => location.address),
    item.locationLabel,
  ];
  for (const raw of candidates) {
    const place = compactPlace(raw, item.organization);
    if (place) return place;
  }
  return "";
}

function compactPlace(raw: string, organization: string): string {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let state = "";
  let county = "";
  const cities: string[] = [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (
      isCountry(part) ||
      isPostalCode(part) ||
      isHouseNumber(part) ||
      isStreet(part) ||
      isSamePlace(part, organization)
    ) {
      continue;
    }
    const abbrev = stateAbbrev(part);
    if (abbrev) {
      if (!state) state = abbrev;
      continue;
    }
    if (/ county$/i.test(part)) {
      if (!county) county = part.replace(/ county$/i, "").trim();
      continue;
    }
    if (/ township$/i.test(part)) continue;
    cities.push(part);
  }
  const city = (cities[0] || county).trim();
  if (!city || isHouseNumber(city) || isSamePlace(city, organization)) return "";
  return state ? `${city}, ${state}` : city;
}

function isCountry(value: string): boolean {
  return /^(united states(?: of america)?|usa|u\.s\.a\.?|us)$/i.test(value);
}

function isPostalCode(value: string): boolean {
  return /^\d{5}(?:-\d{4})?$/.test(value);
}

function isHouseNumber(value: string): boolean {
  return /^\d+[a-z]?$/i.test(value.trim());
}

function isStreet(value: string): boolean {
  return STREET_WORD.test(value);
}

function stateAbbrev(value: string): string | null {
  const trimmed = value.trim();
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  return STATE_ABBREV[trimmed.toLowerCase()] ?? null;
}

function isSamePlace(value: string, organization: string): boolean {
  const left = normalizePlace(value);
  const right = normalizePlace(organization);
  if (!left || !right || left.length < 4) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function normalizePlace(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function formatHistoryGist(item: CareerHistoryItem, now = new Date()): string {
  const period = formatHistoryPeriod(
    item.startDate,
    item.endDate,
    item.isCurrent,
  );
  const tenure = formatTenureMonths(
    tenureMonths(item.startDate, item.endDate, item.isCurrent, now),
  );
  const gist = [formatHistoryPlace(item), period].filter(Boolean).join(" · ");
  if (gist && tenure) return `${gist} (${tenure})`;
  return gist;
}

export function formatHistoryPeriod(
  startDate: string,
  endDate: string,
  isCurrent: boolean,
): string {
  if (!startDate && !endDate && !isCurrent) return "";
  const from = formatMonthYear(startDate) || "—";
  const to = isCurrent ? "Present" : formatMonthYear(endDate) || "—";
  return `${from} – ${to}`;
}

export function tenureMonths(
  startDate: string,
  endDate: string,
  isCurrent: boolean,
  now = new Date(),
): number {
  const start = parseYearMonth(startDate);
  if (!start) return 0;
  const end = isCurrent || !endDate ? now : (parseYearMonth(endDate) ?? now);
  return Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()),
  );
}

export function formatTenureMonths(months: number): string {
  if (months <= 0) return "";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years > 0 && rest > 0) return `${years}y ${rest}m`;
  if (years > 0) return `${years}y`;
  return `${rest}m`;
}

function careerSpanMonths(items: CareerHistoryItem[], now: Date): number {
  const starts = items
    .map((item) => parseYearMonth(item.startDate))
    .filter((value): value is Date => Boolean(value));
  if (starts.length === 0) return 0;
  const earliest = starts.reduce((min, date) => (date < min ? date : min));
  const ends = items.map((item) =>
    item.isCurrent || !item.endDate
      ? now
      : (parseYearMonth(item.endDate) ?? now),
  );
  const latest = ends.reduce((max, date) => (date > max ? date : max));
  return Math.max(
    0,
    (latest.getFullYear() - earliest.getFullYear()) * 12 +
      (latest.getMonth() - earliest.getMonth()),
  );
}

function uniqueCities(items: CareerHistoryItem[]): Set<string> {
  const cities = new Set<string>();
  for (const item of items) {
    const place = formatHistoryPlace(item);
    if (place) cities.add(place.toLowerCase());
  }
  return cities;
}

function travelMiles(items: CareerHistoryItem[]): number {
  const points = [...items]
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))
    .flatMap((item) => {
      const location = item.locations?.[0];
      if (
        !location ||
        !Number.isFinite(location.latitude) ||
        !Number.isFinite(location.longitude)
      ) {
        return [];
      }
      return [location];
    });
  let miles = 0;
  for (let index = 1; index < points.length; index += 1) {
    miles += haversineMiles(points[index - 1], points[index]);
  }
  return miles;
}

function haversineMiles(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const radius = 3958.8;
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

function formatMonthYear(value: string): string {
  const match = value.trim().match(/^(\d{4})-(\d{2})/);
  if (!match) return value.trim();
  const month = Number(match[2]);
  if (month < 1 || month > 12) return value.trim();
  return `${MONTHS[month - 1]} ${match[1]}`;
}

function parseYearMonth(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Number(match[1]), month - 1, 1);
}

function byHistoryRecency(a: CareerHistoryItem, b: CareerHistoryItem): number {
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
  return (b.startDate || "").localeCompare(a.startDate || "");
}
