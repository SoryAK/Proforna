import { useEffect, useState } from "react";
import type { ProfileFields } from "@core/profile";
import { stepKicker } from "./OnboardingProgress";

export type OnboardingProfileValue = ProfileFields & {
  avatarUrl: string | null;
};

export function OnboardingProfileForm({
  initial,
  photo: heldPhoto,
  busy,
  error,
  onContinue,
}: {
  initial: OnboardingProfileValue;
  photo: File | null;
  busy: boolean;
  error: string | null;
  onContinue: (input: ProfileFields, photo: File | null) => void;
}) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [headline, setHeadline] = useState(initial.headline);
  const [city, setCity] = useState(initial.city);
  const [state, setState] = useState(initial.state);
  const [bio, setBio] = useState(initial.bio);
  const [linkedinUrl, setLinkedinUrl] = useState(initial.linkedinUrl);
  const [githubUrl, setGithubUrl] = useState(initial.githubUrl);
  const [portfolioUrl, setPortfolioUrl] = useState(initial.portfolioUrl);
  const [photo, setPhoto] = useState<File | null>(heldPhoto);
  const [preview, setPreview] = useState<string | null>(initial.avatarUrl);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onContinue(
          {
            fullName,
            headline,
            city,
            state,
            bio,
            linkedinUrl,
            githubUrl,
            portfolioUrl,
          },
          photo,
        );
      }}
    >
      <p className="onboarding-kicker">{stepKicker("welcome", false)}</p>
      <h1>
        What should we <em>call you?</em>
      </h1>
      <p className="onboarding-lead">
        Proforna keeps your career file on this machine. About two minutes:
        your name, an optional model, then an optional resume. Name is
        required. The rest can wait.
      </p>

      <label className="onboarding-avatar">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        {preview ? (
          <img src={preview} alt="Profile photo" />
        ) : (
          <span>Add a photo</span>
        )}
      </label>

      <label className="onboarding-field">
        <span>Full name</span>
        <input
          name="fullName"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </label>

      <label className="onboarding-field">
        <span>Professional headline</span>
        <input
          name="headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Senior Software Engineer"
          autoComplete="off"
        />
      </label>

      <div className="onboarding-field-row">
        <label className="onboarding-field">
          <span>City</span>
          <input
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
          />
        </label>
        <label className="onboarding-field">
          <span>State</span>
          <input
            name="state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            autoComplete="address-level1"
          />
        </label>
      </div>

      <label className="onboarding-field">
        <span>Short bio</span>
        <textarea
          name="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
        />
      </label>

      <label className="onboarding-field">
        <span>LinkedIn URL</span>
        <input
          name="linkedinUrl"
          type="url"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="https://linkedin.com/in/yourname"
          autoComplete="url"
        />
      </label>

      <label className="onboarding-field">
        <span>GitHub URL</span>
        <input
          name="githubUrl"
          type="url"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          placeholder="https://github.com/yourname"
          autoComplete="url"
        />
      </label>

      <label className="onboarding-field">
        <span>Portfolio URL</span>
        <input
          name="portfolioUrl"
          type="url"
          value={portfolioUrl}
          onChange={(e) => setPortfolioUrl(e.target.value)}
          placeholder="https://yoursite.com"
          autoComplete="url"
        />
      </label>

      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="onboarding-actions">
        <button
          type="submit"
          className="onboarding-btn onboarding-btn-solid"
          disabled={busy}
        >
          Continue
        </button>
      </div>
    </form>
  );
}
