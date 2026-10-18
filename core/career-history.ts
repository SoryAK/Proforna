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

export type CareerHistoryCluster = {
  lead: CareerHistoryItem;
  copies: CareerHistoryItem[];
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
    [
      item.organization,
      item.title,
      item.locationLabel,
      formatHistoryPlace(item),
      ...(item.locations ?? []).map((location) => location.address),
    ]
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

export function careerHistoryCopyKey(item: {
  kind: string;
  title: string;
  organization: string;
  startDate: string;
}): string {
  const month = item.startDate.trim().match(/^(\d{4})-(\d{2})/);
  const start = month
    ? `${month[1]}-${month[2]}`
    : item.startDate.trim().toLowerCase();
  return [
    classifyCareerHistorySection(item),
    item.organization.trim().toLowerCase().replace(/\s+/g, " "),
    item.title.trim().toLowerCase().replace(/\s+/g, " "),
    start,
  ].join("\0");
}

export function clusterCareerHistory(
  items: CareerHistoryItem[],
): CareerHistoryCluster[] {
  const order: string[] = [];
  const groups = new Map<string, CareerHistoryItem[]>();
  for (const item of items) {
    const key = careerHistoryCopyKey(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else {
      groups.set(key, [item]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const group = groups.get(key) ?? [];
    const lead = [...group].sort(byCopyRichness)[0];
    return {
      lead,
      copies: [lead, ...group.filter((item) => item.id !== lead.id)],
    };
  });
}

export type CareerHistoryIdentity = CareerHistoryItem & {
  description?: string;
  achievements?: string[];
};

export type IdenticalRoleFlag = {
  count: number;
  keeper: boolean;
};

export function careerHistoryIdentityKey(item: CareerHistoryIdentity): string {
  const places = (item.locations ?? [])
    .map((location) => normalizeHistoryText(location.address))
    .filter(Boolean)
    .sort();
  const achievements = (item.achievements ?? [])
    .map((achievement) => normalizeHistoryText(achievement))
    .filter(Boolean)
    .sort();
  return [
    classifyCareerHistorySection(item),
    normalizeHistoryText(item.organization),
    normalizeHistoryText(item.title),
    historyMonthKey(item.startDate),
    item.isCurrent ? "current" : historyMonthKey(item.endDate),
    normalizeHistoryText(item.description ?? ""),
    achievements.join("|"),
    places.length > 0
      ? places.join("|")
      : normalizeHistoryText(item.locationLabel),
  ].join("\0");
}

export function flagIdenticalRoles(
  items: CareerHistoryIdentity[],
): Map<string, IdenticalRoleFlag> {
  const groups = new Map<string, string[]>();
  const order: string[] = [];
  for (const item of items) {
    const key = careerHistoryIdentityKey(item);
    const group = groups.get(key);
    if (group) group.push(item.id);
    else {
      groups.set(key, [item.id]);
      order.push(key);
    }
  }
  const flags = new Map<string, IdenticalRoleFlag>();
  for (const key of order) {
    const ids = groups.get(key) ?? [];
    ids.forEach((id, index) => {
      flags.set(id, { count: ids.length, keeper: index === 0 });
    });
  }
  return flags;
}

export function presentCareerHistoryStats(
  items: CareerHistoryIdentity[],
  now = new Date(),
): CareerHistoryStats {
  const work = items.filter(
    (item) => classifyCareerHistorySection(item) !== "school",
  );
  return {
    tenure: formatTenureMonths(workTenureMonths(items, now)),
    roles: new Set(work.map((item) => careerHistoryIdentityKey(item))).size,
    miles: Math.round(travelMiles(items, now)),
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
const STREET_SUFFIX =
  /\b(?:st|ave|blvd|dr|ln|rd|ct|hwy|pkwy|cir|pl|ter|trl|sq|pike|aly)\.?$/i;
const STATE_CODES = new Set(Object.values(STATE_ABBREV));

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
    const postal = stateBeforePostal(part);
    if (postal) {
      if (!state) state = postal.state;
      if (postal.city) cities.push(postal.city);
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
  const trimmed = value.trim();
  return STREET_WORD.test(trimmed) || STREET_SUFFIX.test(trimmed);
}

function stateBeforePostal(part: string): { state: string; city: string } | null {
  const match = part.trim().match(/^(.*?)(?:\s+)(\d{5}(?:-\d{4})?)$/);
  if (!match) return null;
  const head = match[1].trim();
  const direct = knownState(head);
  if (direct) return { state: direct, city: "" };
  const words = head.split(/\s+/);
  if (words.length < 2) return null;
  const abbrev = knownState(words[words.length - 1] ?? "");
  if (!abbrev) return null;
  return { state: abbrev, city: words.slice(0, -1).join(" ") };
}

function knownState(value: string): string | null {
  const abbrev = stateAbbrev(value);
  if (!abbrev || !STATE_CODES.has(abbrev)) return null;
  return abbrev;
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
  const end = isCurrent ? now : parseYearMonth(endDate);
  if (!end) return 0;
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

function workTenureMonths(items: CareerHistoryItem[], now: Date): number {
  const intervals = items
    .filter((item) => classifyCareerHistorySection(item) !== "school")
    .flatMap((item) => {
      const start = parseYearMonth(item.startDate);
      const end = item.isCurrent ? now : parseYearMonth(item.endDate);
      if (!start || !end || end < start) return [];
      return [{ start: monthIndex(start), end: monthIndex(end) }];
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let months = 0;
  let cursor = Number.NEGATIVE_INFINITY;
  for (const interval of intervals) {
    const from = Math.max(interval.start, cursor);
    if (interval.end > from) {
      months += interval.end - from;
      cursor = interval.end;
    }
  }
  return months;
}

function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

function uniqueCities(items: CareerHistoryItem[]): Set<string> {
  const cities = new Set<string>();
  for (const item of items) {
    const sources = [
      ...(item.locations ?? []).map((location) => location.address),
      item.locationLabel,
    ];
    for (const raw of sources) {
      const place = compactPlace(raw, item.organization);
      if (place) cities.add(place.toLowerCase());
    }
  }
  return cities;
}

function travelMiles(items: CareerHistoryItem[], now: Date): number {
  const stops = [...items]
    .filter((item) => mappedPoint(item) !== null)
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  let miles = 0;
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const next = stops[index];
    if (!previous || !next || rolesOverlap(previous, next, now)) continue;
    const from = mappedPoint(previous);
    const to = mappedPoint(next);
    if (!from || !to) continue;
    miles += haversineMiles(from, to);
  }
  return miles;
}

function mappedPoint(item: CareerHistoryItem): {
  latitude: number;
  longitude: number;
} | null {
  const location = item.locations?.[0];
  if (
    !location ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude)
  ) {
    return null;
  }
  return location;
}

function rolesOverlap(
  left: CareerHistoryItem,
  right: CareerHistoryItem,
  now: Date,
): boolean {
  const leftStart = parseYearMonth(left.startDate);
  const rightStart = parseYearMonth(right.startDate);
  if (!leftStart || !rightStart) return false;
  const leftEnd = left.isCurrent ? now : parseYearMonth(left.endDate);
  const rightEnd = right.isCurrent ? now : parseYearMonth(right.endDate);
  if (!leftEnd || !rightEnd) return true;
  return leftStart < rightEnd && rightStart < leftEnd;
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

function normalizeHistoryText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function historyMonthKey(value: string): string {
  const month = value.trim().match(/^(\d{4})-(\d{2})/);
  return month ? `${month[1]}-${month[2]}` : normalizeHistoryText(value);
}

function byCopyRichness(a: CareerHistoryItem, b: CareerHistoryItem): number {
  const locations = (b.locations?.length ?? 0) - (a.locations?.length ?? 0);
  if (locations !== 0) return locations;
  const label = b.locationLabel.trim().length - a.locationLabel.trim().length;
  if (label !== 0) return label;
  return a.id.localeCompare(b.id);
}

function byHistoryRecency(a: CareerHistoryItem, b: CareerHistoryItem): number {
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
  return (b.startDate || "").localeCompare(a.startDate || "");
}
