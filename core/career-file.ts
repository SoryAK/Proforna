export type CareerJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
};

export type CareerSchool = {
  id: string;
  institution: string;
  degree: string;
  field: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
};

export type CareerFile = {
  jobs: CareerJob[];
  schools: CareerSchool[];
  skills: string[];
};

export type CareerHistoryRecord = {
  id: string;
  kind: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
  degree: string;
  field: string;
};

export function presentCareerFile(
  records: CareerHistoryRecord[],
  skillNames: string[],
): CareerFile {
  const jobs = records
    .filter((row) => row.kind === "job")
    .sort(byRecency)
    .map((row) => ({
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      startDate: row.startDate,
      endDate: row.endDate,
      isCurrent: row.isCurrent,
      description: row.description,
      achievements: row.achievements,
    }));

  const schools = records
    .filter((row) => row.kind === "school")
    .sort(byRecency)
    .map((row) => ({
      id: row.id,
      institution: row.company,
      degree: row.degree || row.title,
      field: row.field,
      location: row.location,
      startDate: row.startDate,
      endDate: row.endDate,
      description: row.description,
    }));

  return {
    jobs,
    schools,
    skills: skillNames.map((name) => name.trim()).filter(Boolean),
  };
}

export function currentJobs(file: CareerFile): CareerJob[] {
  return file.jobs.filter((job) => job.isCurrent);
}

export function currentJob(file: CareerFile): CareerJob | null {
  return currentJobs(file)[0] ?? null;
}

function byRecency(
  a: { isCurrent: boolean; startDate: string },
  b: { isCurrent: boolean; startDate: string },
): number {
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
  return (b.startDate || "").localeCompare(a.startDate || "");
}
