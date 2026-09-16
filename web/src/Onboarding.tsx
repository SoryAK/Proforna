import { useEffect, useState } from "react";
import type { ExtractedResume } from "@core/resume-extract";
import { OnboardingModelOffer, OnboardingModelSetup } from "./OnboardingModels";
import { OnboardingProgress } from "./OnboardingProgress";
import { OnboardingResume } from "./OnboardingResume";
import "./onboarding.css";

type Me = {
  occupant: { id: string };
  profile: { fullName: string; onboardingCompletedAt: string | null };
};

type Step = "welcome" | "profile" | "models" | "model-setup" | "resume";

export function Onboarding({
  initialName,
  onFinished,
}: {
  initialName: string;
  onFinished: (me: Me) => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [fullName, setFullName] = useState(initialName);
  const [nameSaved, setNameSaved] = useState(Boolean(initialName.trim()));
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
    if (next !== "welcome" && next !== "profile" && !nameSaved) {
      setStep("profile");
      return;
    }
    setError(null);
    setStep(next);
  }

  async function saveProfile() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save your name.");
        return;
      }
      setNameSaved(true);
      setStep("models");
    } finally {
      setBusy(false);
    }
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
      <div className="onboarding-stage">
        <OnboardingProgress step={step} modelPath={modelPath} />
        <section className="onboarding-card">
          {step === "welcome" ? (
            <>
              <p className="onboarding-kicker">Step 01 — Welcome</p>
              <h1>
                Own the work. <em>Act on it.</em>
              </h1>
              <p className="onboarding-lead">
                Welcome to Proforna. Your name first, then an optional model,
                then an optional resume — on this machine, with no account to
                create.
              </p>
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-solid"
                  onClick={() => go("profile")}
                >
                  Let&apos;s get started
                </button>
              </div>
            </>
          ) : null}

          {step === "profile" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveProfile();
              }}
            >
              <p className="onboarding-kicker">Step 02 — Profile</p>
              <h1>
                What should we <em>call you?</em>
              </h1>
              <p className="onboarding-lead">
                Tell us your name. You can change this later.
              </p>
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
                  type="button"
                  className="onboarding-btn onboarding-btn-ghost"
                  onClick={() => go("welcome")}
                  disabled={busy}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="onboarding-btn onboarding-btn-solid"
                  disabled={busy}
                >
                  Continue
                </button>
              </div>
            </form>
          ) : null}

          {step === "models" ? (
            <OnboardingModelOffer
              busy={busy}
              onBack={() => go("profile")}
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
