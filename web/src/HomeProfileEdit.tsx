import { useEffect, useState } from "react";
import { prepareProfile, type ProfileFields } from "@core/profile";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import "./onboarding.css";

export function HomeProfileEdit({
  initial,
  onCancel,
  onSaved,
}: {
  initial: OnboardingProfileValue;
  onCancel: () => void;
  onSaved: (profile: OnboardingProfileValue) => void;
}) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [headline, setHeadline] = useState(initial.headline);
  const [city, setCity] = useState(initial.city);
  const [state, setState] = useState(initial.state);
  const [bio, setBio] = useState(initial.bio);
  const [linkedinUrl, setLinkedinUrl] = useState(initial.linkedinUrl);
  const [githubUrl, setGithubUrl] = useState(initial.githubUrl);
  const [portfolioUrl, setPortfolioUrl] = useState(initial.portfolioUrl);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initial.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function save(fields: ProfileFields, nextPhoto: File | null) {
    const prepared = prepareProfile(fields);
    if (!prepared.ok) {
      setError(
        prepared.error === "url-invalid"
          ? "Use an http(s) URL for LinkedIn, GitHub, or portfolio."
          : "A name is required.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prepared.value),
      });
      const body = (await res.json()) as {
        error?: string;
        profile?: OnboardingProfileValue;
      };
      if (!res.ok || !body.profile) {
        setError(body.error ?? "Could not save your profile.");
        return;
      }
      let profile = body.profile;
      if (nextPhoto) {
        const form = new FormData();
        form.append("avatar", nextPhoto);
        const uploaded = await fetch("/api/profile/avatar", {
          method: "POST",
          body: form,
        });
        const failed = (await uploaded.json()) as {
          error?: string;
          profile?: OnboardingProfileValue;
        };
        if (!uploaded.ok || !failed.profile) {
          setError(failed.error ?? "Could not save the photo.");
          return;
        }
        profile = failed.profile;
      }
      onSaved(profile);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="home-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save(
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
      <h1>Profile</h1>

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
          type="button"
          className="onboarding-btn onboarding-btn-ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="onboarding-btn onboarding-btn-solid"
          disabled={busy}
        >
          Save
        </button>
      </div>
    </form>
  );
}
