import { isHttpUrl } from "./model-connection";
import type { ProfileFields } from "./profile";
import { prepareWorkMapLocation } from "./work-map";

export const MIN_RESUME_TEXT_LENGTH = 50;

export const EXTRACT_SYSTEM_PROMPT = `You are a strict resume data extractor. Your ONLY job is to pull information DIRECTLY from the resume text provided.

RULES:
1. ONLY extract text that is LITERALLY present. Do not infer, guess, or embellish.
2. If a field is not stated, use null for strings or [] for lists.
3. Do not rephrase. Copy as closely as possible.
4. Dates: month+year becomes YYYY-MM-01. Year only becomes YYYY-01-01.
5. isCurrent is true only if the resume says Present, Current, or similar.
6. Skills: only names explicitly listed as skills, not inferred from jobs.
7. Return ONLY JSON. No markdown.

Schema:
{
  "profile": {
    "headline": "string or null",
    "bio": "string or null"
  },
  "experience": [
    {
      "company": "string",
      "title": "string",
      "location": "string or null",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "isCurrent": false,
      "description": "string or null",
      "achievements": ["string"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string or null",
      "field": "string or null",
      "location": "string or null",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "description": "string or null"
    }
  ],
  "skills": ["string"]
}`;

export type ExtractedProfile = {
  headline: string;
  bio: string;
  location: string;
  website: string;
  githubUrl: string;
  linkedinUrl: string;
};

export type ExtractedSite = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
};

export type ExtractedJob = {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
  site: ExtractedSite | null;
};

export type ExtractedSchool = {
  institution: string;
  degree: string;
  field: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
};

export type ExtractedResume = {
  profile: ExtractedProfile;
  experience: ExtractedJob[];
  education: ExtractedSchool[];
  skills: string[];
};

export function isExtractableResumeText(text: string): boolean {
  return text.trim().length >= MIN_RESUME_TEXT_LENGTH;
}

export function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export type ResidenceParts = {
  street: string;
  city: string;
  state: string;
};

/** Street, city, and state from a resume line or a looked-up place name. */
export function splitResidence(label: string): ResidenceParts {
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (/^(usa|u\.s\.a\.|united states|us)$/i.test(parts.at(-1) ?? "")) parts.pop();
  if (/^\d{5}(?:-\d{4})?$/.test(parts.at(-1) ?? "")) parts.pop();
  if (parts.length === 0) return { street: "", city: "", state: "" };
  const state = stateCode(parts.at(-1) ?? "");
  if (!state) {
    if (parts.length === 1) return { street: "", city: parts[0] ?? "", state: "" };
    return {
      street: "",
      city: parts.slice(0, -1).join(", "),
      state: parts.at(-1) ?? "",
    };
  }
  const before = parts.slice(0, -1);
  if (/county$/i.test(before.at(-1) ?? "") && before.length >= 2) before.pop();
  if (before.length === 0) return { street: "", city: "", state };
  if (before.length === 1) return { street: "", city: before[0] ?? "", state };
  return {
    street: joinStreet(before.slice(0, -1)),
    city: before.at(-1) ?? "",
    state,
  };
}

export function splitPlaceLabel(label: string): { city: string; state: string } {
  const place = splitResidence(label);
  return { city: place.city, state: place.state };
}

function joinStreet(parts: string[]): string {
  return parts.reduce((street, part) => {
    if (!street) return part;
    return /^\d+[A-Za-z]?$/.test(street) ? `${street} ${part}` : `${street}, ${part}`;
  }, "");
}

function stateCode(token: string): string {
  const withoutZip = token.replace(/\s+\d{5}(?:-\d{4})?$/, "").trim();
  if (/^[A-Za-z]{2}$/.test(withoutZip)) {
    const code = withoutZip.toUpperCase();
    return STATE_CODES.has(code) ? code : "";
  }
  return STATE_NAMES[withoutZip.toLowerCase()] ?? "";
}

const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const STATE_NAMES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
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
};

export function isExtractReviewComplete(
  jobCount: number,
  reviewedCount: number,
): boolean {
  return jobCount <= 0 || reviewedCount >= jobCount;
}

export function fillProfileFromExtract(
  current: ProfileFields,
  extracted: ExtractedProfile,
): ProfileFields {
  const place = splitResidence(extracted.location);
  return {
    fullName: current.fullName,
    headline: current.headline || extracted.headline,
    address: current.address || place.street,
    city: current.city || place.city,
    state: current.state || place.state,
    bio: current.bio || extracted.bio,
    linkedinUrl: current.linkedinUrl || usableUrl(extracted.linkedinUrl),
    githubUrl: current.githubUrl || usableUrl(extracted.githubUrl),
    portfolioUrl: current.portfolioUrl || usableUrl(extracted.website),
  };
}

export function emptyExtractedResume(): ExtractedResume {
  return {
    profile: {
      headline: "",
      bio: "",
      location: "",
      website: "",
      githubUrl: "",
      linkedinUrl: "",
    },
    experience: [],
    education: [],
    skills: [],
  };
}

export function parseExtractedResume(raw: unknown): ExtractedResume | null {
  const data = coerceObject(raw);
  if (!data) return null;
  const profile = coerceObject(data.profile) ?? {};
  const experience = Array.isArray(data.experience) ? data.experience : [];
  const education = Array.isArray(data.education) ? data.education : [];
  const skills = Array.isArray(data.skills) ? data.skills : [];

  return {
    profile: {
      headline: asText(profile.headline),
      bio: asText(profile.bio),
      location: asText(profile.location),
      website: asText(profile.website),
      githubUrl: asText(profile.githubUrl),
      linkedinUrl: asText(profile.linkedinUrl),
    },
    experience: experience
      .map(asJob)
      .filter((job): job is ExtractedJob => job !== null),
    education: education
      .map(asSchool)
      .filter((school): school is ExtractedSchool => school !== null),
    skills: skills.map(asText).filter(Boolean),
  };
}

export function parseExtractedResumeText(text: string): ExtractedResume | null {
  try {
    return parseExtractedResume(JSON.parse(stripJsonFence(text)) as unknown);
  } catch {
    return null;
  }
}

export function parseHistoryResumeId(
  raw: unknown,
): { ok: true; resumeId: string | null } | { ok: false } {
  const data = coerceObject(raw);
  if (!data) return { ok: false };
  if (!("resumeId" in data) || data.resumeId == null || data.resumeId === "") {
    return { ok: true, resumeId: null };
  }
  if (typeof data.resumeId !== "string") return { ok: false };
  const resumeId = data.resumeId.trim();
  if (!resumeId) return { ok: true, resumeId: null };
  return { ok: true, resumeId };
}

function usableUrl(value: string): string {
  return isHttpUrl(value) ? value : "";
}

function coerceObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (value === null || value === undefined || value === "null") return "";
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseSite(value: unknown): ExtractedSite | null {
  const row = coerceObject(value);
  if (!row) return null;
  const prepared = prepareWorkMapLocation({
    ...row,
    kind: "primary",
    isPublic: false,
  });
  if (!prepared.ok) return null;
  return {
    label: prepared.value.label,
    address: prepared.value.address,
    latitude: prepared.value.latitude,
    longitude: prepared.value.longitude,
  };
}

function asJob(value: unknown): ExtractedJob | null {
  const row = coerceObject(value);
  if (!row) return null;
  const company = asText(row.company);
  const title = asText(row.title);
  if (!company || !title) return null;
  const achievements = Array.isArray(row.achievements)
    ? row.achievements.map(asText).filter(Boolean)
    : [];
  return {
    company,
    title,
    location: asText(row.location),
    startDate: asText(row.startDate),
    endDate: asText(row.endDate),
    isCurrent: row.isCurrent === true,
    description: asText(row.description),
    achievements,
    site: parseSite(row.site),
  };
}

function asSchool(value: unknown): ExtractedSchool | null {
  const row = coerceObject(value);
  if (!row) return null;
  const institution = asText(row.institution);
  if (!institution) return null;
  return {
    institution,
    degree: asText(row.degree),
    field: asText(row.field),
    location: asText(row.location),
    startDate: asText(row.startDate),
    endDate: asText(row.endDate),
    description: asText(row.description),
  };
}
