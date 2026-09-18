import type { CareerFile } from "./career-file";

export type CareerSearchHit = {
  kind: "job" | "school" | "skill";
  id: string;
  title: string;
  detail: string;
};

export function searchCareerFile(
  file: CareerFile,
  query: string,
): CareerSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const hits: CareerSearchHit[] = [];
  for (const job of file.jobs) {
    if (
      matches(
        needle,
        job.title,
        job.company,
        job.location,
        job.description,
        ...job.achievements,
      )
    ) {
      hits.push({
        kind: "job",
        id: job.id,
        title: job.title,
        detail: job.company,
      });
    }
  }
  for (const school of file.schools) {
    if (
      matches(
        needle,
        school.institution,
        school.degree,
        school.field,
        school.location,
        school.description,
      )
    ) {
      hits.push({
        kind: "school",
        id: school.id,
        title: school.degree || school.institution,
        detail: school.institution,
      });
    }
  }
  for (const skill of file.skills) {
    if (matches(needle, skill)) {
      hits.push({
        kind: "skill",
        id: skill,
        title: skill,
        detail: "Skill",
      });
    }
  }
  return hits;
}

function matches(needle: string, ...parts: string[]): boolean {
  return parts.join(" ").toLowerCase().includes(needle);
}
