export const JUDGMENT_SECTIONS = [
  "profile",
  "history",
  "skills",
  "worklog",
  "residence",
] as const;

export type JudgmentSection = (typeof JUDGMENT_SECTIONS)[number];

export type JobListingSource = {
  id: string;
  name: string;
  applicationId: string;
  apiKey: string;
  enabled: boolean;
};

export type CompanySiteSource = {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
};

export type JobSourceSettings = {
  sources: JobListingSource[];
  sites: CompanySiteSource[];
  judgment: JudgmentSection[];
};

export type JobSourceSettingsError = "source-invalid" | "site-invalid" | "site-url-invalid";

export const DEFAULT_JOB_SOURCE_SETTINGS: JobSourceSettings = {
  sources: [],
  sites: [],
  judgment: ["profile", "history", "skills"],
};

export function sourceCredentials(
  settings: JobSourceSettings,
  sourceName: string,
  env: { applicationId?: string; apiKey?: string } = {},
): { applicationId: string; apiKey: string } | null {
  const matches = settings.sources.filter(
    (source) => source.name.trim().toLowerCase() === sourceName.trim().toLowerCase(),
  );
  if (matches.length === 0) return envPair(env);
  const source = matches.find((item) => item.enabled);
  if (!source) return null;
  if (source.applicationId || source.apiKey) {
    if (!source.applicationId || !source.apiKey) return null;
    return { applicationId: source.applicationId, apiKey: source.apiKey };
  }
  return envPair(env);
}

export function prepareJobSourceSettings(input: {
  sources?: unknown;
  adzuna?: unknown;
  adzunaAppId?: unknown;
  adzunaAppKey?: unknown;
  sites?: unknown;
  judgment?: unknown;
}): { ok: true; value: JobSourceSettings } | { ok: false; error: JobSourceSettingsError } {
  const sources = listingSources(input);
  if (!sources.ok) return sources;
  const sites = companySites(input.sites);
  if (!sites.ok) return sites;
  const requested = Array.isArray(input.judgment) ? input.judgment : DEFAULT_JOB_SOURCE_SETTINGS.judgment;
  const judgment = JUDGMENT_SECTIONS.filter((section) => requested.includes(section));
  return {
    ok: true,
    value: {
      sources: sources.value,
      sites: sites.value,
      judgment,
    },
  };
}

export function careerRecordInJudgment(settings: JobSourceSettings): boolean {
  return settings.judgment.length > 0;
}

function listingSources(input: {
  sources?: unknown;
  adzuna?: unknown;
  adzunaAppId?: unknown;
  adzunaAppKey?: unknown;
}): { ok: true; value: JobListingSource[] } | { ok: false; error: "source-invalid" } {
  if (input.sources !== undefined && !Array.isArray(input.sources)) {
    return { ok: false, error: "source-invalid" };
  }
  const sources: JobListingSource[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(input.sources) ? input.sources : []) {
    const source = oneSource(item);
    if (!source || seen.has(source.id)) return { ok: false, error: "source-invalid" };
    seen.add(source.id);
    sources.push(source);
  }
  if (!Array.isArray(input.sources)) {
    const legacy = legacyAdzuna(input);
    if (legacy) sources.push(legacy);
  }
  return { ok: true, value: sources };
}

function oneSource(item: unknown): JobListingSource | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const id = text(row.id);
  const name = text(row.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    applicationId: text(row.applicationId),
    apiKey: text(row.apiKey),
    enabled: row.enabled !== false,
  };
}

function legacyAdzuna(input: {
  adzuna?: unknown;
  adzunaAppId?: unknown;
  adzunaAppKey?: unknown;
}): JobListingSource | null {
  const applicationId = text(input.adzunaAppId);
  const apiKey = text(input.adzunaAppKey);
  const configured = input.adzuna === false || applicationId !== "" || apiKey !== "";
  if (!configured) return null;
  return {
    id: "legacy-adzuna",
    name: "Adzuna",
    applicationId,
    apiKey,
    enabled: input.adzuna !== false,
  };
}

function companySites(
  input: unknown,
): { ok: true; value: CompanySiteSource[] } | { ok: false; error: "site-invalid" | "site-url-invalid" } {
  if (input !== undefined && !Array.isArray(input)) return { ok: false, error: "site-invalid" };
  const sites: CompanySiteSource[] = [];
  for (const item of Array.isArray(input) ? input : []) {
    if (!item || typeof item !== "object") return { ok: false, error: "site-invalid" };
    const row = item as Record<string, unknown>;
    const label = text(row.label);
    const url = text(row.url);
    const id = text(row.id);
    if (!label || !id) return { ok: false, error: "site-invalid" };
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: "site-url-invalid" };
    sites.push({
      id,
      label,
      url,
      enabled: row.enabled !== false,
    });
  }
  return { ok: true, value: sites };
}

function envPair(env: { applicationId?: string; apiKey?: string }): {
  applicationId: string;
  apiKey: string;
} | null {
  const applicationId = env.applicationId?.trim() ?? "";
  const apiKey = env.apiKey?.trim() ?? "";
  if (!applicationId || !apiKey) return null;
  return { applicationId, apiKey };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
