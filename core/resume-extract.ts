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
    "bio": "string or null",
    "location": "string or null",
    "website": "string or null",
    "githubUrl": "string or null",
    "linkedinUrl": "string or null"
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

export function splitPlaceLabel(label: string): { city: string; state: string } {
  const trimmed = label.trim();
  if (!trimmed) return { city: "", state: "" };
  const comma = trimmed.lastIndexOf(",");
  if (comma === -1) return { city: trimmed, state: "" };
  return {
    city: trimmed.slice(0, comma).trim(),
    state: trimmed.slice(comma + 1).trim(),
  };
}

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
  const place = splitPlaceLabel(extracted.location);
  return {
    fullName: current.fullName,
    headline: current.headline || extracted.headline,
    address: current.address,
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
