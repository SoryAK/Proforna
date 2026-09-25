import { DEFAULT_JOB_SOURCE_SETTINGS, sourceCredentials, type JobSourceSettings } from "../core/job-sources";
import {
  presentJobListings,
  prepareJobSearchQuery,
  type JobListing,
  type JobSearchQuery,
} from "../core/job-search";

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
  const credentials = sourceCredentials(options.settings ?? DEFAULT_JOB_SOURCE_SETTINGS, "Adzuna", {
    applicationId: process.env.ADZUNA_APP_ID,
    apiKey: process.env.ADZUNA_APP_KEY,
  });
  if (!credentials) {
    return { ok: true, configured: false, listings: [], total: 0 };
  }
  try {
    const response = await fetchImpl(
      adzunaUrl(prepared.value, credentials.applicationId, credentials.apiKey),
    );
    if (!response.ok) return { ok: false, error: "search-failed" };
    const body = (await response.json()) as { results?: unknown; count?: unknown };
    const listings = presentJobListings(body.results, prepared.value.q);
    const total = typeof body.count === "number" ? body.count : listings.length;
    return { ok: true, configured: true, listings, total };
  } catch {
    return { ok: false, error: "search-failed" };
  }
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
