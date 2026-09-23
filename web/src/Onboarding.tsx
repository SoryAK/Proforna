import { useEffect, useRef, useState } from "react";
import { presentModelId } from "@core/model-onboarding";
import { prepareProfile, type ProfileFields } from "@core/profile";
import { fillProfileFromExtract, type ExtractedResume } from "@core/resume-extract";
import { OnboardingModelStep } from "./OnboardingModels";
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
    address: initialProfile.address,
    city: initialProfile.city,
    state: initialProfile.state,
    bio: initialProfile.bio,
    linkedinUrl: initialProfile.linkedinUrl,
    githubUrl: initialProfile.githubUrl,
    portfolioUrl: initialProfile.portfolioUrl,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [nameReady, setNameReady] = useState(
    Boolean(initialProfile.fullName.trim()),
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canExtract, setCanExtract] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedResume | null>(null);
  const [extractModel, setExtractModel] = useState<string | null>(null);
  const [extractModelLabel, setExtractModelLabel] = useState<string | null>(
    null,
  );
  const [extracting, setExtracting] = useState(false);
  const extractAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetch("/api/models")
      .then((res) => (res.ok ? res.json() : { connections: [] }))
      .then((body: { connections?: Array<{ model: string }> }) => {
        const connected = body.connections?.find((row) => row.model.trim());
        setCanExtract(Boolean(connected));
        setExtractModelLabel(
          connected ? presentModelId(connected.model) : null,
        );
      })
      .catch(() => {
        setCanExtract(false);
        setExtractModelLabel(null);
      });
  }, []);

  useEffect(() => {
    return () => extractAbort.current?.abort();
  }, []);

  function go(next: Step) {
    if (next !== "welcome" && !nameReady) {
      setStep("welcome");
      return;
    }
    setError(null);
    setStep(next);
  }

  function continueProfile(fullName: string, nextPhoto: File | null) {
    const prepared = prepareProfile({ ...profile, fullName });
    if (!prepared.ok) {
      setError(
        prepared.error === "url-invalid"
          ? "Use an http(s) URL for LinkedIn, GitHub, or portfolio."
          : "A name is required.",
      );
      return;
    }
    setError(null);
    profileRef.current = prepared.value;
    setProfile(prepared.value);
    setPhoto(nextPhoto);
    setNameReady(true);
    setStep("models");
  }

  async function persistProfile() {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profileRef.current),
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
      setExtractModelLabel(
        input.model.trim() ? presentModelId(input.model) : null,
      );
      setStep("resume");
    } finally {
      setBusy(false);
    }
  }

  async function extractResume() {
    if (!file || extracting) return;
    extractAbort.current?.abort();
    const abort = new AbortController();
    extractAbort.current = abort;
    setExtracting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resumes/extract", {
        method: "POST",
        body: form,
        signal: abort.signal,
      });
      const body = (await res.json()) as {
        error?: string;
        model?: string;
        data?: ExtractedResume;
      };
      if (extractAbort.current !== abort || abort.signal.aborted) return;
      if (!res.ok || !body.data) {
        setError(body.error ?? "Could not extract the resume.");
        return;
      }
      setExtracted(body.data);
      setExtractModel(body.model ?? null);
      setProfile(fillProfileFromExtract(profile, body.data.profile));
    } catch (err) {
      if (
        extractAbort.current !== abort ||
        abort.signal.aborted ||
        isAbortError(err)
      ) {
        if (extractAbort.current === abort) {
          setError("Extract cancelled.");
        }
        return;
      }
      setError("Could not extract the resume.");
    } finally {
      if (extractAbort.current === abort) {
        extractAbort.current = null;
        setExtracting(false);
      }
    }
  }

  function cancelExtract() {
    const abort = extractAbort.current;
    extractAbort.current = null;
    abort?.abort();
    setExtracting(false);
    if (abort) setError("Extract cancelled.");
  }

  async function finish(upload: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (!(await persistProfile())) return;
      let resumeId: string | undefined;
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
        const stored = (await uploaded.json()) as { resume?: { id?: string } };
        resumeId = stored.resume?.id;
        if (extracted && !resumeId) {
          setError("Could not store the resume.");
          return;
        }
      }
      if (upload && extracted) {
        const saved = await fetch("/api/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...extracted, resumeId }),
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
      <div
        className="onboarding-stage"
        data-long={extracted ? "true" : undefined}
      >
        <OnboardingProgress step={step} />
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
            <OnboardingModelStep
              kicker={stepKicker("models")}
              busy={busy}
              error={error}
              onBack={() => go("welcome")}
              onSkip={() => go("resume")}
              onSave={(input) => void saveModel(input)}
            />
          ) : null}

          {step === "resume" ? (
            <OnboardingResume
              kicker={stepKicker("resume")}
              file={file}
              extracted={extracted}
              extractModel={extractModel}
              extractModelLabel={extractModelLabel}
              canExtract={canExtract}
              busy={busy}
              extracting={extracting}
              error={error}
              profile={profile}
              onProfileChange={setProfile}
              onPick={(next) => {
                cancelExtract();
                setFile(next);
                setExtracted(null);
                setExtractModel(null);
              }}
              onClear={() => {
                cancelExtract();
                setFile(null);
                setExtracted(null);
                setExtractModel(null);
              }}
              onBack={() => go("models")}
              onSkip={() => void finish(false)}
              onExtract={() => void extractResume()}
              onCancelExtract={cancelExtract}
              onExtractedChange={setExtracted}
              onConfirm={() => void finish(true)}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === "AbortError"
    : err instanceof Error && err.name === "AbortError";
}
