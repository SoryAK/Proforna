import type { JudgmentSection } from "./job-sources";

export type JudgmentCareerRecord = {
  profile?: { headline: string; bio: string };
  history?: Array<{ title: string; organization: string }>;
  skills?: string[];
  worklog?: Array<{ title: string }>;
  residence?: { address: string } | null;
};

export type FitJudgment = {
  summary: string;
};

const STOPWORDS = new Set([
  "about",
  "after",
  "and",
  "are",
  "for",
  "from",
  "into",
  "that",
  "the",
  "their",
  "this",
  "with",
  "your",
]);

const GENERIC_PLACES = new Set(["united states", "usa", "u.s.a.", "america"]);

export function judgeListingFit(
  listing: { title: string; summary: string; location: string },
  record: JudgmentCareerRecord,
  sections: readonly JudgmentSection[],
): FitJudgment {
  if (sections.length === 0) {
    return { summary: "The career record is left out of this judgment." };
  }
  const roleText = `${listing.title} ${listing.summary}`;
  const labels: string[] = [];
  const seen = new Set<string>();
  function add(label: string) {
    const clean = label.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    labels.push(clean);
  }

  if (sections.includes("profile") && record.profile) {
    for (const word of distinctiveWords(`${record.profile.headline} ${record.profile.bio}`)) {
      if (containsPhrase(listing.title, word)) add(word);
    }
  }
  if (sections.includes("history")) {
    for (const role of record.history ?? []) {
      const title = role.title.trim();
      const organization = role.organization.trim();
      if (title && containsPhrase(roleText, title)) {
        add(organization ? `${title} at ${organization}` : title);
      } else if (organization.length >= 4 && containsPhrase(roleText, organization)) {
        add(organization);
      }
    }
  }
  if (sections.includes("skills")) {
    for (const skill of record.skills ?? []) {
      const name = skill.trim();
      if (name.length < 3) continue;
      if (containsPhrase(roleText, name)) add(name);
    }
  }
  if (sections.includes("worklog")) {
    for (const entry of record.worklog ?? []) {
      const title = entry.title.trim();
      if (title.length >= 4 && containsPhrase(roleText, title)) add(title);
    }
  }
  if (sections.includes("residence") && record.residence?.address) {
    for (const part of record.residence.address.split(",")) {
      const place = part.trim();
      if (place.length < 4 || GENERIC_PLACES.has(place.toLowerCase())) continue;
      if (containsPhrase(listing.location, place)) add(place);
    }
  }

  const shown = labels.slice(0, 4);
  if (shown.length === 0) {
    return { summary: "Nothing in the checked career record lines up with this role." };
  }
  return { summary: `Lines up with ${joinLabels(shown)}.` };
}

function distinctiveWords(value: string): string[] {
  return value
    .split(/[^A-Za-z0-9+#.]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 5 && !STOPWORDS.has(word.toLowerCase()));
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = phrase.trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9+#.])${escaped}([^A-Za-z0-9+#.]|$)`, "i").test(haystack);
}

function joinLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
