import { formatCareerSpan } from "./career-file";
import type { ProfileFields } from "./profile";
import {
  fillProfileFromExtract,
  type ExtractedProfile,
  type ExtractedResume,
} from "./resume-extract";

export const ONBOARDING_NO_PLACE = "No place yet";

export type OnboardingCheckItem = {
  source: "job";
  sourceIndex: number;
  kind: "Job";
  org: string;
  title: string;
  place: string;
  span: string;
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

/** Roles the screen can confirm. Schools stay on the file and are not listed. */
export function onboardingCheckItems(data: ExtractedResume): OnboardingCheckItem[] {
  return data.experience.map((job, sourceIndex) => ({
    source: "job" as const,
    sourceIndex,
    kind: "Job" as const,
    org: job.company || "Untitled role",
    title: job.title || "Role",
    place: job.site?.label || job.location || ONBOARDING_NO_PLACE,
    span: formatCareerSpan(job.startDate, job.endDate, job.isCurrent),
    lines: [...job.achievements, job.description].map((line) => line.trim()).filter(Boolean),
    lat: job.site?.latitude ?? null,
    lng: job.site?.longitude ?? null,
  }));
}

/**
 * History to store after confirmation. Roles missing from `kept` are dropped.
 * Schools are copied from the file. A pin replaces the site. When every role
 * is set aside, skills are dropped too.
 */
export function keptOnboardingHistory(
  extracted: ExtractedResume,
  kept: Array<Pick<OnboardingCheckItem, "source" | "sourceIndex" | "place" | "lat" | "lng">>,
): ExtractedResume {
  const experience = kept
    .filter((item) => item.source === "job")
    .map((item) => {
      const job = extracted.experience[item.sourceIndex];
      if (!job) return null;
      const place = item.place === ONBOARDING_NO_PLACE ? job.location : item.place;
      const site =
        item.lat != null && item.lng != null
          ? { label: place, address: place, latitude: item.lat, longitude: item.lng }
          : job.site;
      return { ...job, location: place, site };
    })
    .filter((job): job is ExtractedResume["experience"][number] => job != null);
  const skills = experience.length === 0 ? [] : extracted.skills;
  return { ...extracted, experience, education: extracted.education, skills };
}

/**
 * Profile to store after onboarding. A skipped place or links answer leaves
 * those fields as they already are. A blank field in a given answer does too.
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
    next.address = input.place.street.trim() || input.current.address;
    next.city = input.place.city.trim() || input.current.city;
    next.state = input.place.state.trim() || input.current.state;
  } else {
    next.address = input.current.address;
    next.city = input.current.city;
    next.state = input.current.state;
  }
  if (input.links) {
    next.linkedinUrl = input.links.linkedinUrl.trim() || input.current.linkedinUrl;
    next.githubUrl = input.links.githubUrl.trim() || input.current.githubUrl;
    next.portfolioUrl = input.links.portfolioUrl.trim() || input.current.portfolioUrl;
  } else {
    next.linkedinUrl = input.current.linkedinUrl;
    next.githubUrl = input.current.githubUrl;
    next.portfolioUrl = input.current.portfolioUrl;
  }
  return next;
}
