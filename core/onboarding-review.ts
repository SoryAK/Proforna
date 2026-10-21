import { formatCareerSpan } from "./career-file";
import type { ProfileFields } from "./profile";
import {
  fillProfileFromExtract,
  type ExtractedProfile,
  type ExtractedResume,
} from "./resume-extract";

export const ONBOARDING_NO_PLACE = "No place yet";

export type OnboardingCheckItem = {
  source: "job" | "school";
  sourceIndex: number;
  kind: "Job" | "School";
  org: string;
  title: string;
  field: string;
  place: string;
  span: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
  lines: string[];
  lat: number | null;
  lng: number | null;
};

export type OnboardingPlaceAnswer = {
  street: string;
  city: string;
  state: string;
};

export type OnboardingLinkAnswer = {
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
};

/** How many resumes, jobs, schools, and internships the read yielded. Added records are not part of the extract. */
export function onboardingExtractSummary(items: OnboardingCheckItem[], resumes: number): string {
  const extracted = items.filter((item) => item.sourceIndex >= 0);
  const jobs = extracted.filter((item) => item.kind === "Job").length;
  const schools = extracted.filter((item) => item.kind === "School").length;
  // An internship is kept as a job until the role records that kind.
  const internships = 0;
  return `${countLabel(resumes, "resume", "resumes")}, ${countLabel(jobs, "job", "jobs")}, ${countLabel(schools, "school", "schools")}, and ${countLabel(internships, "internship", "internships")} were extracted.`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export type OnboardingDone = {
  tiles: Array<{ count: number; label: string }>;
  setAside: string | null;
};

export type OnboardingSavedLine = { label: string; value: string };

/** Profile values worth showing after save. The street stays off this list. */
export function onboardingSavedLines(profile: {
  headline: string;
  city: string;
  state: string;
  bio: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}): OnboardingSavedLine[] {
  const place = [profile.city.trim(), profile.state.trim()].filter(Boolean).join(", ");
  const rows: Array<[string, string]> = [
    ["Headline", profile.headline],
    ["Place", place],
    ["LinkedIn", profile.linkedinUrl],
    ["GitHub", profile.githubUrl],
    ["Website", profile.portfolioUrl],
    ["Bio", profile.bio],
  ];
  return rows.flatMap(([label, value]) => {
    const text = value.trim();
    return text ? [{ label, value: text }] : [];
  });
}

export type EvidenceRoleChoice = { id: string; label: string };

/** Jobs and schools the Done step can open. A school is a choice when no job was kept. */
export function evidenceRoleChoices(input: {
  jobs: ReadonlyArray<{ id: string; title: string; company: string }>;
  schools: ReadonlyArray<{ id: string; institution: string; degree: string }>;
}): EvidenceRoleChoice[] {
  const jobs = input.jobs.flatMap((job) => {
    const id = job.id.trim();
    if (!id) return [];
    const label = [job.title.trim(), job.company.trim()].filter(Boolean).join(" · ") || "Job";
    return [{ id, label }];
  });
  const schools = input.schools.flatMap((school) => {
    const id = school.id.trim();
    if (!id) return [];
    const label = [school.institution.trim(), school.degree.trim()].filter(Boolean).join(" · ") || "School";
    return [{ id, label }];
  });
  return [...jobs, ...schools];
}

/** What the last step reports once the session is saved. */
export function onboardingDone(saved: {
  jobs: number;
  schools: number;
  skills: number;
  resumes: number;
  setAside: number;
}): OnboardingDone {
  const word = (count: number, singular: string, plural: string) => (count === 1 ? singular : plural);
  return {
    tiles: [
      { count: saved.jobs, label: word(saved.jobs, "job", "jobs") },
      { count: saved.schools, label: word(saved.schools, "school", "schools") },
      { count: saved.skills, label: word(saved.skills, "skill", "skills") },
      {
        count: saved.resumes,
        label: word(saved.resumes, "resume kept as evidence", "resumes kept as evidence"),
      },
    ],
    setAside:
      saved.setAside > 0
        ? `${saved.setAside} set aside. Import a resume from Career History to bring them back.`
        : null,
  };
}

/** Roles and schools the screen can confirm. */
export function onboardingCheckItems(data: ExtractedResume): OnboardingCheckItem[] {
  const jobs = data.experience.map((job, sourceIndex) =>
    checkItem({
      source: "job",
      sourceIndex,
      kind: "Job",
      org: job.company || "Untitled role",
      title: job.title || "Role",
      field: "",
      place: job.site?.label || job.location || ONBOARDING_NO_PLACE,
      startDate: job.startDate,
      endDate: job.endDate,
      isCurrent: job.isCurrent,
      description: job.description,
      achievements: job.achievements,
      lat: job.site?.latitude ?? null,
      lng: job.site?.longitude ?? null,
    }),
  );
  const schools = data.education.map((school, sourceIndex) =>
    checkItem({
      source: "school",
      sourceIndex,
      kind: "School",
      org: school.institution || "Untitled school",
      title: school.degree,
      field: school.field,
      place: school.site?.label || school.location || ONBOARDING_NO_PLACE,
      startDate: school.startDate,
      endDate: school.endDate,
      isCurrent: false,
      description: school.description,
      achievements: [],
      lat: school.site?.latitude ?? null,
      lng: school.site?.longitude ?? null,
    }),
  );
  return [...jobs, ...schools];
}

/** A record the occupant adds during verify. Negative indexes are not from the file. */
export function blankOnboardingCheckItem(
  kind: OnboardingCheckItem["kind"],
  sourceIndex: number,
): OnboardingCheckItem {
  return {
    source: kind === "School" ? "school" : "job",
    sourceIndex,
    kind,
    org: "",
    title: "",
    field: "",
    place: ONBOARDING_NO_PLACE,
    span: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    description: "",
    achievements: [],
    lines: [],
    lat: null,
    lng: null,
  };
}

export function nextOnboardingSourceIndex(
  items: OnboardingCheckItem[],
  kind: OnboardingCheckItem["kind"],
): number {
  const source = kind === "School" ? "school" : "job";
  const lowest = items
    .filter((item) => item.source === source)
    .reduce((min, item) => Math.min(min, item.sourceIndex), 0);
  return lowest - 1;
}

/** An added record with nothing typed in yet. */
export function isBlankOnboardingCheckItem(item: OnboardingCheckItem): boolean {
  if (item.sourceIndex >= 0) return false;
  const text = [item.org, item.title, item.field, item.description, item.startDate, item.endDate, ...item.achievements];
  return text.every((line) => !line.trim()) && item.lat == null && item.lng == null;
}

function checkItem(input: {
  source: OnboardingCheckItem["source"];
  sourceIndex: number;
  kind: OnboardingCheckItem["kind"];
  org: string;
  title: string;
  field: string;
  place: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
  lat: number | null;
  lng: number | null;
}): OnboardingCheckItem {
  const description = input.description.trim();
  const achievements = input.achievements.map((line) => line.trim()).filter(Boolean);
  return {
    source: input.source,
    sourceIndex: input.sourceIndex,
    kind: input.kind,
    org: input.org.trim() || (input.kind === "School" ? "Untitled school" : "Untitled role"),
    title: input.title.trim(),
    field: input.field.trim(),
    place: input.place.trim() || ONBOARDING_NO_PLACE,
    span: formatCareerSpan(input.startDate, input.endDate, input.isCurrent),
    startDate: input.startDate,
    endDate: input.isCurrent ? "" : input.endDate,
    isCurrent: input.isCurrent,
    description,
    achievements,
    lines: [...achievements, description].map((line) => line.trim()).filter(Boolean),
    lat: input.lat,
    lng: input.lng,
  };
}

/**
 * History to store after confirmation. Records missing from `kept` are dropped.
 * Edits on a kept record replace the file. A pin replaces the site. When every
 * role is set aside, skills are dropped too.
 */
export function keptOnboardingHistory(
  extracted: ExtractedResume,
  kept: OnboardingCheckItem[],
): ExtractedResume {
  const experience = kept
    .filter((item) => item.source === "job")
    .map((item) => keptJob(extracted, item))
    .filter((job): job is ExtractedResume["experience"][number] => job != null);
  const education = kept
    .filter((item) => item.source === "school")
    .map((item) => keptSchool(extracted, item))
    .filter((school): school is ExtractedResume["education"][number] => school != null);
  const skills = experience.length === 0 ? [] : extracted.skills;
  return { ...extracted, experience, education, skills };
}

function keptJob(
  extracted: ExtractedResume,
  item: OnboardingCheckItem,
): ExtractedResume["experience"][number] | null {
  const base = item.sourceIndex >= 0 ? extracted.experience[item.sourceIndex] : undefined;
  if (item.sourceIndex >= 0 && !base) return null;
  const place = item.place === ONBOARDING_NO_PLACE ? (base?.location ?? "") : item.place;
  const site =
    item.lat != null && item.lng != null
      ? { label: place, address: place, latitude: item.lat, longitude: item.lng }
      : (base?.site ?? null);
  return {
    ...base,
    company: item.org.trim() || "Untitled role",
    title: item.title.trim() || "Role",
    location: place,
    startDate: item.startDate,
    endDate: item.isCurrent ? "" : item.endDate,
    isCurrent: item.isCurrent,
    description: item.description.trim(),
    achievements: item.achievements.map((line) => line.trim()).filter(Boolean),
    site,
  };
}

function keptSchool(
  extracted: ExtractedResume,
  item: OnboardingCheckItem,
): ExtractedResume["education"][number] | null {
  const base = item.sourceIndex >= 0 ? extracted.education[item.sourceIndex] : undefined;
  if (item.sourceIndex >= 0 && !base) return null;
  const place = item.place === ONBOARDING_NO_PLACE ? (base?.location ?? "") : item.place;
  const site =
    item.lat != null && item.lng != null
      ? { label: place, address: place, latitude: item.lat, longitude: item.lng }
      : (base?.site ?? null);
  return {
    ...base,
    institution: item.org.trim() || "Untitled school",
    degree: item.title.trim(),
    field: item.field.trim(),
    location: place,
    startDate: item.startDate,
    endDate: item.endDate,
    description: item.description.trim(),
    site,
  };
}

/**
 * Profile to store after onboarding. A skipped place or links answer, or a
 * blank field in one, keeps the saved value, or the resume's when none is saved.
 */
export function profileAfterOnboarding(input: {
  current: ProfileFields;
  extracted: ExtractedProfile | null;
  fullName: string;
  place: OnboardingPlaceAnswer | null;
  links: OnboardingLinkAnswer | null;
}): ProfileFields {
  const base = input.extracted
    ? fillProfileFromExtract(input.current, input.extracted)
    : { ...input.current };
  const next: ProfileFields = {
    ...base,
    fullName: input.fullName.trim().replace(/\s+/g, " "),
  };
  if (input.place) {
    next.address = input.place.street.trim() || base.address;
    next.city = input.place.city.trim() || base.city;
    next.state = input.place.state.trim() || base.state;
  }
  if (input.links) {
    next.linkedinUrl = input.links.linkedinUrl.trim() || base.linkedinUrl;
    next.githubUrl = input.links.githubUrl.trim() || base.githubUrl;
    next.portfolioUrl = input.links.portfolioUrl.trim() || base.portfolioUrl;
  }
  return next;
}
