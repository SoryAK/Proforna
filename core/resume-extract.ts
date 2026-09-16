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

export type ExtractedJob = {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
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

function coerceObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (value === null || value === undefined || value === "null") return "";
  if (typeof value !== "string") return "";
  return value.trim();
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
