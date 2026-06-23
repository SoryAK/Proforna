/**
 * O*NET Web Services API v2 Client
 *
 * Docs: https://services.onetcenter.org/reference/
 * Base: https://api-v2.onetcenter.org
 *
 * All endpoints are GET-only. Auth via X-API-Key header.
 * Pagination: max 2000 per page. Rate: ~10 req/s guidance.
 */

const BASE = "https://api-v2.onetcenter.org";

function getApiKey(): string {
  const key = process.env.ONET_API_KEY ?? "";
  if (!key) throw new Error("ONET_API_KEY is not configured");
  return key;
}

// ── Rate limiter: ~8 req/s to stay under guidance ──────────────
let lastRequestAt = 0;
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < 125) {
    await new Promise((r) => setTimeout(r, 125 - elapsed));
  }
  lastRequestAt = Date.now();
}

// ── Core fetch with retry on 429 ──────────────────────────────
async function onetFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  await throttle();
  const url = new URL(`${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { "X-API-Key": getApiKey(), Accept: "application/json" },
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`O*NET API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }
  throw new Error("O*NET API rate limited after 3 retries");
}

// ── Types ──────────────────────────────────────────────────────

export interface OnetOccupationListItem {
  href: string;
  code: string;
  title: string;
  tags: { bright_outlook?: boolean };
  datalevel?: boolean;
  zone?: { code: number; title: string };
}

interface PagedResponse<T> {
  start: number;
  end: number;
  total: number;
  next?: string;
  prev?: string;
  occupation?: T[];
  element?: T[];
}

export interface OnetOccupationOverview {
  code: string;
  title: string;
  tags: { bright_outlook?: boolean };
  description?: string;
  sample_of_reported_titles?: string[];
  bright_outlook?: { code: string; title: string }[];
}

export interface OnetSkillElement {
  id: string;
  name: string;
  description: string;
  importance: number;
}

export interface OnetTechnologyElement {
  id?: string;
  name: string;
  hot_technology?: boolean;
  example?: { href: string; name: string }[];
}

export interface OnetWorkActivityElement {
  id: string;
  name: string;
  description: string;
  importance: number;
}

// ── All-page fetcher ───────────────────────────────────────────

async function fetchAllPages<T>(
  path: string,
  field: "occupation" | "element",
  pageSize = 500,
): Promise<T[]> {
  const all: T[] = [];
  let start = 1;
  while (true) {
    const end = start + pageSize - 1;
    const page = await onetFetch<PagedResponse<T>>(path, {
      start: String(start),
      end: String(end),
    });
    const items = page[field] ?? [];
    all.push(...items);
    if (page.end >= page.total || items.length === 0) break;
    start = page.end + 1;
  }
  return all;
}

// ── Public API ─────────────────────────────────────────────────

/** Fetch all ~1016 occupations (code, title, tags, zone). */
export async function listAllOccupations(): Promise<OnetOccupationListItem[]> {
  return fetchAllPages<OnetOccupationListItem>(
    "/online/occupations/",
    "occupation",
    2000,
  );
}

/** Fetch occupation overview (description, sample titles, bright outlook). */
export async function getOccupationOverview(
  code: string,
): Promise<OnetOccupationOverview> {
  return onetFetch<OnetOccupationOverview>(`/online/occupations/${code}/`);
}

/** Fetch skills for an occupation (importance 0-100). */
export async function getOccupationSkills(
  code: string,
): Promise<OnetSkillElement[]> {
  return fetchAllPages<OnetSkillElement>(
    `/online/occupations/${code}/details/skills`,
    "element",
    100,
  );
}

/** Fetch knowledge areas for an occupation (importance 0-100). */
export async function getOccupationKnowledge(
  code: string,
): Promise<OnetSkillElement[]> {
  return fetchAllPages<OnetSkillElement>(
    `/online/occupations/${code}/details/knowledge`,
    "element",
    100,
  );
}

/** Fetch abilities for an occupation (importance 0-100). */
export async function getOccupationAbilities(
  code: string,
): Promise<OnetSkillElement[]> {
  return fetchAllPages<OnetSkillElement>(
    `/online/occupations/${code}/details/abilities`,
    "element",
    100,
  );
}

/** Fetch work activities for an occupation (importance 0-100). */
export async function getOccupationWorkActivities(
  code: string,
): Promise<OnetWorkActivityElement[]> {
  return fetchAllPages<OnetWorkActivityElement>(
    `/online/occupations/${code}/details/work_activities`,
    "element",
    100,
  );
}

/** Fetch technology skills for an occupation. */
export async function getOccupationTechnology(
  code: string,
): Promise<OnetTechnologyElement[]> {
  return fetchAllPages<OnetTechnologyElement>(
    `/online/occupations/${code}/details/technology`,
    "element",
    100,
  );
}

/** Keyword search for occupations. */
export async function searchOccupations(
  keyword: string,
  limit = 20,
): Promise<OnetOccupationListItem[]> {
  const page = await onetFetch<PagedResponse<OnetOccupationListItem>>(
    "/online/search",
    { keyword, start: "1", end: String(limit) },
  );
  return page.occupation ?? [];
}

/** SOC code cluster name mapping (first 2 digits of SOC). */
export const SOC_CLUSTER_MAP: Record<string, string> = {
  "11": "Management",
  "13": "Business and Financial Operations",
  "15": "Computer and Mathematical",
  "17": "Architecture and Engineering",
  "19": "Life, Physical, and Social Science",
  "21": "Community and Social Service",
  "23": "Legal",
  "25": "Educational Instruction and Library",
  "27": "Arts, Design, Entertainment, Sports, and Media",
  "29": "Healthcare Practitioners and Technical",
  "31": "Healthcare Support",
  "33": "Protective Service",
  "35": "Food Preparation and Serving Related",
  "37": "Building and Grounds Cleaning and Maintenance",
  "39": "Personal Care and Service",
  "41": "Sales and Related",
  "43": "Office and Administrative Support",
  "45": "Farming, Fishing, and Forestry",
  "47": "Construction and Extraction",
  "49": "Installation, Maintenance, and Repair",
  "51": "Production",
  "53": "Transportation and Material Moving",
  "55": "Military Specific",
};

export function getClusterForSoc(socCode: string): string {
  const prefix = socCode.slice(0, 2);
  return SOC_CLUSTER_MAP[prefix] ?? "Other";
}
