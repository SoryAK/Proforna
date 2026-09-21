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
  onContinue: (fullName: string, photo: File | null) => void;
}) {
  const [fullName, setFullName] = useState(initial.fullName);
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
        onContinue(fullName, photo);
      }}
    >
      <p className="onboarding-kicker">{stepKicker("welcome")}</p>
      <h1>
        What should we <em>call you?</em>
      </h1>
      <p className="onboarding-lead">
        Proforna keeps your career file on this machine. Name is required.
        Headline, city, bio, and links wait until the resume is reviewed.
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
