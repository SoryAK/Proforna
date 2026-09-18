import { useEffect } from "react";
import {
  formatCareerSpan,
  type CareerFile,
  type CareerJob,
  type CareerSchool,
} from "@core/career-file";

export function WorkHistory({
  career,
  careerError,
  focusJobId,
}: {
  career: CareerFile;
  careerError: string | null;
  focusJobId?: string | null;
}) {
  const empty =
    career.jobs.length === 0 &&
    career.schools.length === 0 &&
    career.skills.length === 0;

  useEffect(() => {
    if (!focusJobId) return;
    document
      .getElementById(`history-job-${focusJobId}`)
      ?.scrollIntoView({ block: "start" });
  }, [focusJobId, career]);

  return (
    <div className="history">
      <h1>Work History</h1>
      <p className="history-lead">
        Roles, schools, and skills from a resume extract. Confirm them during
        onboarding and they land here.
      </p>

      {careerError ? (
        <p className="home-alert" role="alert">
          {careerError}
        </p>
      ) : null}

      {empty && !careerError ? (
        <p className="history-empty">
          Nothing saved yet. Connect a model, extract a resume, and confirm the
          jobs and schools to fill this list.
        </p>
      ) : null}

      {career.jobs.length > 0 ? (
        <section className="history-section" aria-labelledby="history-work">
          <h2 id="history-work">Work</h2>
          <ol className="history-list">
            {career.jobs.map((job) => (
              <li key={job.id}>
                <JobRow job={job} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {career.schools.length > 0 ? (
        <section className="history-section" aria-labelledby="history-school">
          <h2 id="history-school">Education</h2>
          <ol className="history-list">
            {career.schools.map((school) => (
              <li key={school.id}>
                <SchoolRow school={school} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {career.skills.length > 0 ? (
        <section className="history-section" aria-labelledby="history-skills">
          <h2 id="history-skills">Skills</h2>
          <ul className="history-skills">
            {career.skills.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function JobRow({ job }: { job: CareerJob }) {
  const span = formatCareerSpan(job.startDate, job.endDate, job.isCurrent);
  return (
    <article className="history-row" id={`history-job-${job.id}`}>
      <h3>{job.title}</h3>
      <p className="history-org">{job.company}</p>
      {span || job.location ? (
        <p className="history-meta">
          {span}
          {span && job.location ? " · " : null}
          {job.location}
        </p>
      ) : null}
    </article>
  );
}

function SchoolRow({ school }: { school: CareerSchool }) {
  const span = formatCareerSpan(school.startDate, school.endDate, false);
  const program = [school.degree, school.field].filter(Boolean).join(", ");
  return (
    <article className="history-row">
      <h3>{program || "Education"}</h3>
      <p className="history-org">{school.institution}</p>
      {span || school.location ? (
        <p className="history-meta">
          {span}
          {span && school.location ? " · " : null}
          {school.location}
        </p>
      ) : null}
    </article>
  );
}
