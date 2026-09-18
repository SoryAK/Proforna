import { formatCareerSpan } from "@core/career-file";
import type { ExtractedResume } from "@core/resume-extract";

export function OnboardingExtractConfirm({
  extracted,
  model,
  onChange,
}: {
  extracted: ExtractedResume;
  model: string | null;
  onChange: (next: ExtractedResume) => void;
}) {
  const jobs = extracted.experience;
  const schools = extracted.education;

  return (
    <div className="onboarding-extract">
      {model ? (
        <p className="onboarding-extract-meta">Parsed with {model}</p>
      ) : null}
      {extracted.profile.headline ? (
        <p className="onboarding-extract-headline">{extracted.profile.headline}</p>
      ) : null}

      <section>
        <h2>Jobs</h2>
        {jobs.length === 0 ? (
          <p className="onboarding-extract-empty">No jobs found.</p>
        ) : (
          jobs.map((job, i) => (
            <article key={`${job.company}-${job.title}-${i}`} className="onboarding-fact">
              <strong>
                {job.title} · {job.company}
              </strong>
              <span>
                {[job.location, formatCareerSpan(job.startDate, job.endDate, job.isCurrent)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                type="button"
                className="onboarding-fact-remove"
                onClick={() =>
                  onChange({
                    ...extracted,
                    experience: jobs.filter((_, idx) => idx !== i),
                  })
                }
              >
                Remove
              </button>
            </article>
          ))
        )}
      </section>

      <section>
        <h2>Schools</h2>
        {schools.length === 0 ? (
          <p className="onboarding-extract-empty">No schools found.</p>
        ) : (
          schools.map((school, i) => (
            <article
              key={`${school.institution}-${i}`}
              className="onboarding-fact"
            >
              <strong>
                {school.institution}
                {school.degree ? ` · ${school.degree}` : ""}
              </strong>
              <span>
                {[school.field, formatCareerSpan(school.startDate, school.endDate, false)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                type="button"
                className="onboarding-fact-remove"
                onClick={() =>
                  onChange({
                    ...extracted,
                    education: schools.filter((_, idx) => idx !== i),
                  })
                }
              >
                Remove
              </button>
            </article>
          ))
        )}
      </section>

      <section>
        <h2>Skills</h2>
        {extracted.skills.length === 0 ? (
          <p className="onboarding-extract-empty">No skills listed.</p>
        ) : (
          <ul className="onboarding-skills">
            {extracted.skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
