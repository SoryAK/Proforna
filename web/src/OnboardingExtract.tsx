import { useEffect, useLayoutEffect, useState } from "react";
import { formatCareerSpan } from "@core/career-file";
import type { ProfileFields } from "@core/profile";
import {
  isExtractReviewComplete,
  type ExtractedJob,
  type ExtractedResume,
  type ExtractedSite,
} from "@core/resume-extract";
import { OnboardingSiteMap } from "./OnboardingSiteMap";
import { lookupNote, reversePlace, searchPlaces, type PlaceHit } from "./place-search";

export function OnboardingExtractConfirm({
  extracted,
  model,
  profile,
  onChange,
  onProfileChange,
  onReviewReadyChange,
}: {
  extracted: ExtractedResume;
  model: string | null;
  profile: ProfileFields;
  onChange: (next: ExtractedResume) => void;
  onProfileChange: (next: ProfileFields) => void;
  onReviewReadyChange: (ready: boolean) => void;
}) {
  const jobs = extracted.experience;
  const [jobIndex, setJobIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(() => jobs.map(() => false));
  const job = jobs[jobIndex] ?? null;
  const reviewedCount = confirmed.filter(Boolean).length;

  useEffect(() => {
    if (jobIndex >= jobs.length) setJobIndex(Math.max(0, jobs.length - 1));
  }, [jobIndex, jobs.length]);

  useLayoutEffect(() => {
    onReviewReadyChange(isExtractReviewComplete(jobs.length, reviewedCount));
  }, [jobs.length, reviewedCount, onReviewReadyChange]);

  function markJobLooksRight() {
    const flags = jobs.map((_, i) => confirmed[i] ?? false);
    flags[jobIndex] = true;
    setConfirmed(flags);
    const next = nextUnreviewed(flags, jobIndex);
    if (next !== jobIndex) setJobIndex(next);
  }

  function removeJob() {
    setConfirmed((prev) => prev.filter((_, i) => i !== jobIndex));
    onChange({
      ...extracted,
      experience: jobs.filter((_, i) => i !== jobIndex),
    });
  }

  function patchJob(index: number, patch: Partial<ExtractedJob>) {
    onChange({
      ...extracted,
      experience: jobs.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  return (
    <div className="onboarding-extract">
      {model ? (
        <p className="onboarding-extract-meta">Parsed with {model}</p>
      ) : null}

      <section>
        <h2>Profile from the resume</h2>
        <p className="onboarding-extract-hint">
          Blank fields on Welcome were filled when the resume had them. Keep or
          correct them here.
        </p>
        <label className="onboarding-field">
          <span>Headline</span>
          <input
            value={profile.headline}
            onChange={(event) =>
              onProfileChange({ ...profile, headline: event.target.value })
            }
          />
        </label>
        <label className="onboarding-field">
          <span>Address</span>
          <input
            value={profile.address}
            autoComplete="street-address"
            placeholder="Street address"
            onChange={(event) =>
              onProfileChange({ ...profile, address: event.target.value })
            }
          />
        </label>
        <div className="onboarding-field-row">
          <label className="onboarding-field">
            <span>City</span>
            <input
              value={profile.city}
              onChange={(event) =>
                onProfileChange({ ...profile, city: event.target.value })
              }
            />
          </label>
          <label className="onboarding-field">
            <span>State</span>
            <input
              value={profile.state}
              onChange={(event) =>
                onProfileChange({ ...profile, state: event.target.value })
              }
            />
          </label>
        </div>
        <label className="onboarding-field">
          <span>Short bio</span>
          <textarea
            rows={3}
            value={profile.bio}
            onChange={(event) =>
              onProfileChange({ ...profile, bio: event.target.value })
            }
          />
        </label>
        <label className="onboarding-field">
          <span>LinkedIn</span>
          <input
            value={profile.linkedinUrl}
            onChange={(event) =>
              onProfileChange({ ...profile, linkedinUrl: event.target.value })
            }
          />
        </label>
        <label className="onboarding-field">
          <span>GitHub</span>
          <input
            value={profile.githubUrl}
            onChange={(event) =>
              onProfileChange({ ...profile, githubUrl: event.target.value })
            }
          />
        </label>
        <label className="onboarding-field">
          <span>Portfolio</span>
          <input
            value={profile.portfolioUrl}
            onChange={(event) =>
              onProfileChange({ ...profile, portfolioUrl: event.target.value })
            }
          />
        </label>
      </section>

      <section>
        <h2>Jobs</h2>
        {job ? (
          <>
            <p className="onboarding-extract-hint">
              Confirm each role. Save stays off until every job looks right.
            </p>
            <JobReview
              key={`${job.company}-${job.title}-${jobIndex}`}
              job={job}
              index={jobIndex}
              total={jobs.length}
              confirmed={Boolean(confirmed[jobIndex])}
              reviewedCount={reviewedCount}
              onPrev={() => setJobIndex((value) => Math.max(0, value - 1))}
              onNext={() =>
                setJobIndex((value) => Math.min(jobs.length - 1, value + 1))
              }
              onPatch={(patch) => patchJob(jobIndex, patch)}
              onLooksRight={markJobLooksRight}
              onRemove={removeJob}
            />
          </>
        ) : (
          <p className="onboarding-extract-empty">No jobs found.</p>
        )}
      </section>

      <section>
        <h2>Schools</h2>
        {extracted.education.length === 0 ? (
          <p className="onboarding-extract-empty">No schools found.</p>
        ) : (
          extracted.education.map((school, i) => (
            <article
              key={`${school.institution}-${i}`}
              className="onboarding-fact"
            >
              <strong>
                {school.institution}
                {school.degree ? ` · ${school.degree}` : ""}
              </strong>
              <span>
                {[
                  school.location,
                  school.field,
                  formatCareerSpan(school.startDate, school.endDate, false),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                type="button"
                className="onboarding-fact-remove"
                onClick={() =>
                  onChange({
                    ...extracted,
                    education: extracted.education.filter((_, idx) => idx !== i),
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
              <li key={skill}>
                {skill}
                <button
                  type="button"
                  className="onboarding-skill-remove"
                  onClick={() =>
                    onChange({
                      ...extracted,
                      skills: extracted.skills.filter((name) => name !== skill),
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function JobReview({
  job,
  index,
  total,
  confirmed,
  reviewedCount,
  onPrev,
  onNext,
  onPatch,
  onLooksRight,
  onRemove,
}: {
  job: ExtractedJob;
  index: number;
  total: number;
  confirmed: boolean;
  reviewedCount: number;
  onPrev: () => void;
  onNext: () => void;
  onPatch: (patch: Partial<ExtractedJob>) => void;
  onLooksRight: () => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState(job.location);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [matches, setMatches] = useState<PlaceHit[]>([]);

  useEffect(() => {
    setQuery(job.location);
  }, [job.company, job.title, job.location]);

  useEffect(() => {
    if (!job.location || job.site) return;
    let cancelled = false;
    setLookingUp(true);
    setLookupError(null);
    void searchPlaces(job.location)
      .then((found) => {
        if (cancelled || !found) return;
        const place = found.place;
        if (!place) {
          setLookupError(lookupNote(found) || "Could not place that address. Click the map.");
          return;
        }
        onPatch({ site: siteFromPlace(place, job.company) });
        const note = lookupNote(found);
        if (note) setLookupError(note);
      })
      .catch(() => {
        if (!cancelled) {
          setLookupError("Could not place that address. Click the map.");
        }
      })
      .finally(() => {
        if (!cancelled) setLookingUp(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.company, job.location, job.site]);

  async function lookup() {
    const q = query.trim();
    if (!q) return;
    setLookingUp(true);
    setLookupError(null);
    try {
      const found = await searchPlaces(q);
      if (!found || found.places.length === 0) {
        setMatches([]);
        setLookupError(found ? lookupNote(found) || "Could not place that address. Click the map." : "Could not place that address. Click the map.");
        return;
      }
      if (found.places.length > 1) {
        setMatches(found.places);
        setLookupError(lookupNote(found) || null);
        return;
      }
      setMatches([]);
      const place = found.places[0];
      onPatch({
        location: place.label,
        site: siteFromPlace(place, job.company),
      });
      const note = lookupNote(found);
      if (note) setLookupError(note);
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <article
      className="onboarding-job-review"
      data-confirmed={confirmed ? "true" : undefined}
    >
      <header className="onboarding-job-head">
        <div>
          <strong>
            {job.title} · {job.company}
          </strong>
          <span>
            {formatCareerSpan(job.startDate, job.endDate, job.isCurrent)}
            {confirmed ? " · looks right" : ""}
          </span>
        </div>
        {total > 1 ? (
          <div className="onboarding-job-pager">
            <button
              type="button"
              className="onboarding-btn onboarding-btn-ghost"
              onClick={onPrev}
              disabled={index === 0}
            >
              Previous
            </button>
            <span>
              {index + 1} of {total} · {reviewedCount} confirmed
            </span>
            <button
              type="button"
              className="onboarding-btn onboarding-btn-ghost"
              onClick={onNext}
              disabled={index === total - 1}
            >
              Next
            </button>
          </div>
        ) : null}
      </header>

      <h3>Location</h3>
      <p className="onboarding-extract-hint">
        Confirm the pin. Look up the resume place or click the map.
      </p>
      <label className="onboarding-field onboarding-lookup">
        <span>Place</span>
        <span className="onboarding-lookup-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="City, address, or site name"
          />
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={() => void lookup()}
            disabled={lookingUp || !query.trim()}
          >
            {lookingUp ? "Looking up…" : "Look up"}
          </button>
        </span>
      </label>
      {lookupError ? (
        <p className="onboarding-field-hint" role="status">
          {lookupError}
        </p>
      ) : null}
      {matches.length > 1 ? (
        <ul className="role-place-matches onboarding-place-matches">
          {matches.map((place) => (
            <li key={`${place.latitude}:${place.longitude}:${place.address}`}>
              <button
                type="button"
                onClick={() => {
                  setMatches([]);
                  setQuery(place.address);
                  onPatch({
                    location: place.label,
                    site: siteFromPlace(place, job.company),
                  });
                }}
              >
                {place.address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {job.site ? (
        <p className="onboarding-extract-hint">{job.site.address}</p>
      ) : null}
      <OnboardingSiteMap
        site={job.site}
        onMove={(latitude, longitude) => {
          onPatch({
            site: {
              label: job.site?.label || job.company || "Work site",
              address: job.site?.address || query || job.location,
              latitude,
              longitude,
            },
          });
          void reversePlace(latitude, longitude).then((found) => {
            const place = found?.place;
            if (!place) {
              if (found && lookupNote(found)) setLookupError(lookupNote(found));
              return;
            }
            onPatch({
              location: place.label,
              site: {
                label: job.site?.label || job.company || place.label || "Work site",
                address: place.address,
                latitude,
                longitude,
              },
            });
            if (found && lookupNote(found)) setLookupError(lookupNote(found));
          });
        }}
      />

      <h3>Responsibilities</h3>
      <p className="onboarding-extract-hint">
        Keep only the work you actually did. Add or drop lines from the
        resume.
      </p>
      <label className="onboarding-field">
        <span>Summary</span>
        <textarea
          rows={3}
          value={job.description}
          onChange={(event) => onPatch({ description: event.target.value })}
        />
      </label>
      <ol className="onboarding-duties">
        {job.achievements.map((line, i) => (
          <li key={i}>
            <textarea
              rows={2}
              value={line}
              onChange={(event) => {
                const achievements = job.achievements.map((current, idx) =>
                  idx === i ? event.target.value : current,
                );
                onPatch({ achievements });
              }}
            />
            <button
              type="button"
              className="onboarding-fact-remove"
              onClick={() =>
                onPatch({
                  achievements: job.achievements.filter((_, idx) => idx !== i),
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="onboarding-btn onboarding-btn-ghost"
        onClick={() => onPatch({ achievements: [...job.achievements, ""] })}
      >
        Add a responsibility
      </button>
      <button
        type="button"
        className="onboarding-btn onboarding-btn-solid onboarding-job-confirm"
        onClick={onLooksRight}
        disabled={confirmed}
      >
        {confirmed ? "Looks right" : "This job looks right"}
      </button>
      <button
        type="button"
        className="onboarding-fact-remove"
        onClick={onRemove}
      >
        Remove this job
      </button>
    </article>
  );
}

function siteFromPlace(place: PlaceHit, company: string): ExtractedSite {
  return {
    label: place.label || company || "Work site",
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

function nextUnreviewed(flags: boolean[], from: number): number {
  for (let i = from + 1; i < flags.length; i++) {
    if (!flags[i]) return i;
  }
  for (let i = 0; i < from; i++) {
    if (!flags[i]) return i;
  }
  return from;
}
