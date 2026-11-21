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
import { isReadableWebUrl, readPublicPage } from "./public-page";

const ADZUNA_SEARCH = "https://api.adzuna.com/v1/api/jobs/us/search/1";

export async function searchJobListings(
  input: { q?: unknown; where?: unknown; distance?: unknown },
  options: {
    settings?: JobSourceSettings;
    fetchImpl?: typeof fetch;
    readPage?: typeof readPublicPage;
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
  const pages = settings.sites.filter((site) => site.enabled && isReadableWebUrl(site.url));
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
    const posting = await postingFromSavedPage(site, prepared.value, options.readPage ?? readPublicPage);
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
  readPage: typeof readPublicPage,
): Promise<JobListing | null> {
  try {
    const page = await readPage(site.url, {
      headers: {
        accept: "text/html,text/plain",
        "user-agent": "Proforna",
      },
      timeoutMs: 8000,
    });
    if (page.status < 200 || page.status >= 300) return null;
    const type = page.contentType;
    if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) return null;
    return postingFromPage({
      organization: site.label,
      url: site.url,
      html: page.text.slice(0, 400_000),
      query: query.q,
      place: query.where,
    });
  } catch {
    return null;
  }
}
