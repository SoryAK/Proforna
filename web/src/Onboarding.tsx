import { useEffect, useState } from "react";
import { prepareProfile, type ProfileFields } from "@core/profile";
import type { ExtractedResume } from "@core/resume-extract";
import { OnboardingModelOffer, OnboardingModelSetup } from "./OnboardingModels";
import {
  OnboardingProgress,
  stepKicker,
  type Step,
} from "./OnboardingProgress";
import {
  OnboardingProfileForm,
  type OnboardingProfileValue,
} from "./OnboardingProfile";
import { OnboardingResume } from "./OnboardingResume";
import "./onboarding.css";

type Me = {
  occupant: { id: string };
  profile: OnboardingProfileValue & { onboardingCompletedAt: string | null };
};

export function Onboarding({
  initialProfile,
  onFinished,
}: {
  initialProfile: OnboardingProfileValue;
  onFinished: (me: Me) => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [profile, setProfile] = useState<ProfileFields>({
    fullName: initialProfile.fullName,
    headline: initialProfile.headline,
    city: initialProfile.city,
    state: initialProfile.state,
    bio: initialProfile.bio,
    linkedinUrl: initialProfile.linkedinUrl,
    githubUrl: initialProfile.githubUrl,
    portfolioUrl: initialProfile.portfolioUrl,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [nameReady, setNameReady] = useState(
    Boolean(initialProfile.fullName.trim()),
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelPath, setModelPath] = useState(false);
  const [canExtract, setCanExtract] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedResume | null>(null);
  const [extractModel, setExtractModel] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/models")
      .then((res) => (res.ok ? res.json() : { connections: [] }))
      .then((body: { connections?: Array<{ model: string }> }) => {
        setCanExtract(
          Boolean(body.connections?.some((row) => row.model.trim())),
        );
      })
      .catch(() => setCanExtract(false));
  }, []);

  function go(next: Step) {
    if (next !== "welcome" && !nameReady) {
      setStep("welcome");
      return;
    }
    setError(null);
    setStep(next);
  }

  function continueProfile(fields: ProfileFields, nextPhoto: File | null) {
    const prepared = prepareProfile(fields);
    if (!prepared.ok) {
      setError(
        prepared.error === "url-invalid"
          ? "Use an http(s) URL for LinkedIn, GitHub, or portfolio."
          : "A name is required.",
      );
      return;
    }
    setError(null);
    setProfile(prepared.value);
    setPhoto(nextPhoto);
    setNameReady(true);
    setStep("models");
  }

  async function persistProfile() {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profile),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Could not save your profile.");
      return false;
    }
    if (photo) {
      const form = new FormData();
      form.append("avatar", photo);
      const uploaded = await fetch("/api/profile/avatar", {
        method: "POST",
        body: form,
      });
      if (!uploaded.ok) {
        const failed = (await uploaded.json()) as { error?: string };
        setError(failed.error ?? "Could not save the photo.");
        return false;
      }
    }
    return true;
  }

  async function saveModel(input: {
    hosting: "local" | "cloud";
    baseUrl: string;
    model: string;
    apiKey: string;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save the model.");
        return;
      }
      setCanExtract(Boolean(input.model.trim()));
      setStep("resume");
    } finally {
      setBusy(false);
    }
  }

  async function extractResume() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resumes/extract", {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as {
        error?: string;
        model?: string;
        data?: ExtractedResume;
      };
      if (!res.ok || !body.data) {
        setError(body.error ?? "Could not extract the resume.");
        return;
      }
      setExtracted(body.data);
      setExtractModel(body.model ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function finish(upload: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (!(await persistProfile())) return;
      if (upload && file) {
        const form = new FormData();
        form.append("file", file);
        const uploaded = await fetch("/api/resumes", {
          method: "POST",
          body: form,
        });
        if (!uploaded.ok) {
          setError("Could not store the resume.");
          return;
        }
      }
      if (upload && extracted) {
        const saved = await fetch("/api/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(extracted),
        });
        if (!saved.ok) {
          setError("Could not save jobs and schools.");
          return;
        }
      }
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const body = (await res.json()) as Me & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not finish onboarding.");
        return;
      }
      onFinished(body);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-stage" data-long={step === "welcome" ? "true" : undefined}>
        <OnboardingProgress step={step} modelPath={modelPath} />
        <section
          className="onboarding-card"
          data-wide={step === "resume" ? "true" : undefined}
        >
          {step === "welcome" ? (
            <OnboardingProfileForm
              initial={{ ...profile, avatarUrl: initialProfile.avatarUrl }}
              photo={photo}
              busy={busy}
              error={error}
              onContinue={continueProfile}
            />
          ) : null}

          {step === "models" ? (
            <OnboardingModelOffer
              kicker={stepKicker("models", false)}
              busy={busy}
              onBack={() => go("welcome")}
              onYes={() => {
                setModelPath(true);
                go("model-setup");
              }}
              onNo={() => {
                setModelPath(false);
                go("resume");
              }}
            />
          ) : null}

          {step === "model-setup" ? (
            <OnboardingModelSetup
              kicker={stepKicker("model-setup", true)}
              busy={busy}
              error={error}
              onBack={() => go("models")}
              onSkip={() => {
                setModelPath(false);
                go("resume");
              }}
              onSave={(input) => void saveModel(input)}
            />
          ) : null}

          {step === "resume" ? (
            <OnboardingResume
              kicker={stepKicker("resume", modelPath)}
              file={file}
              extracted={extracted}
              extractModel={extractModel}
              canExtract={canExtract}
              busy={busy}
              error={error}
              onPick={(next) => {
                setFile(next);
                setExtracted(null);
                setExtractModel(null);
              }}
              onClear={() => {
                setFile(null);
                setExtracted(null);
                setExtractModel(null);
              }}
              onBack={() => go("models")}
              onSkip={() => void finish(false)}
              onExtract={() => void extractResume()}
              onExtractedChange={setExtracted}
              onConfirm={() => void finish(true)}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
