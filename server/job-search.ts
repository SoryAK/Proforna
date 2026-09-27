import {
  DEFAULT_JOB_SOURCE_SETTINGS,
  sourceCredentials,
  type CompanySiteSource,
  type JobSourceSettings,
} from "../core/job-sources";
import {
  presentJobListings,
  prepareJobSearchQuery,
  type JobListing,
  type JobSearchQuery,
} from "../core/job-search";
import { postingFromPage } from "../core/posting";

const ADZUNA_SEARCH = "https://api.adzuna.com/v1/api/jobs/us/search/1";

export async function searchJobListings(
  input: { q?: unknown; where?: unknown; distance?: unknown },
  options: {
    settings?: JobSourceSettings;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<
  | { ok: true; configured: boolean; listings: JobListing[]; total: number }
  | { ok: false; error: "query-required" | "search-failed" }
> {
  const prepared = prepareJobSearchQuery(input);
  if (!prepared.ok) return prepared;
  const fetchImpl = options.fetchImpl ?? fetch;
  const settings = options.settings ?? DEFAULT_JOB_SOURCE_SETTINGS;
  const credentials = sourceCredentials(settings, "Adzuna", {
    applicationId: process.env.ADZUNA_APP_ID,
    apiKey: process.env.ADZUNA_APP_KEY,
  });
  const pages = settings.sites.filter((site) => site.enabled && readablePageUrl(site.url));
  if (!credentials && pages.length === 0) {
    return { ok: true, configured: false, listings: [], total: 0 };
  }
  const listings: JobListing[] = [];
  let total = 0;
  let listingSearchFailed = false;
  if (credentials) {
    try {
      const response = await fetchImpl(
        adzunaUrl(prepared.value, credentials.applicationId, credentials.apiKey),
      );
      if (!response.ok) {
        listingSearchFailed = true;
      } else {
        const body = (await response.json()) as { results?: unknown; count?: unknown };
        const found = presentJobListings(body.results, prepared.value.q);
        listings.push(...found);
        total += typeof body.count === "number" ? body.count : found.length;
      }
    } catch {
      listingSearchFailed = true;
    }
  }
  for (const site of pages) {
    const posting = await postingFromSavedPage(site, prepared.value, fetchImpl);
    if (!posting) continue;
    listings.push(posting);
    total += 1;
  }
  if (listingSearchFailed && listings.length === 0) {
    return { ok: false, error: "search-failed" };
  }
  return { ok: true, configured: true, listings, total };
}

function adzunaUrl(query: JobSearchQuery, appId: string, appKey: string): string {
  const url = new URL(ADZUNA_SEARCH);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "25");
  url.searchParams.set("distance", query.distance);
  url.searchParams.set("content-type", "application/json");
  if (query.q) url.searchParams.set("what", query.q);
  if (query.where) url.searchParams.set("where", query.where);
  return url.toString();
}

async function postingFromSavedPage(
  site: CompanySiteSource,
  query: JobSearchQuery,
  fetchImpl: typeof fetch,
): Promise<JobListing | null> {
  try {
    const response = await fetchImpl(site.url, {
      headers: {
        accept: "text/html,text/plain",
        "user-agent": "Proforna",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) return null;
    const html = (await response.text()).slice(0, 400_000);
    return postingFromPage({
      organization: site.label,
      url: site.url,
      html,
      query: query.q,
      place: query.where,
    });
  } catch {
    return null;
  }
}

function readablePageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return false;
    if (host === "::1" || host.startsWith("127.") || host.startsWith("10.")) return false;
    if (host.startsWith("192.168.") || host.startsWith("169.254.") || host.startsWith("0.")) {
      return false;
    }
    return !/^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  } catch {
    return false;
  }
}
